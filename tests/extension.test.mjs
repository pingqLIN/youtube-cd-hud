import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('declares a narrowly scoped Manifest V3 extension', () => {
  const manifest = JSON.parse(read('extension/manifest.json'));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '5.10.0');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, [
    'https://www.youtube.com/*',
    'https://1001tracklists.com/*',
    'https://www.1001tracklists.com/*',
    'https://www.mixesdb.com/*',
    'https://trackid.net/*',
  ]);
  assert.equal(manifest.options_page, 'options/options.html');
  assert.equal(manifest.background.service_worker, 'background/service-worker.js');
  assert.ok(manifest.action);
  assert.deepEqual(manifest.content_scripts[0].js, [
    'shared/settings.js',
    'content/gm-xmlhttp-request.js',
    'content/youtube-cd-hud.js',
  ]);
});

test('keeps extension settings normalized and bounded', () => {
  const context = {};
  vm.runInNewContext(read('extension/shared/settings.js'), context);
  const normalized = context.YtCdHudSettings.normalize({
    requestTimeoutMs: 1,
    maxCandidates: 99,
    titleFontSize: 100,
    discScale: 0,
    accentColor: 'not-a-color',
    customCss: 'x'.repeat(22000),
    fontFamily: 'untrusted-font); color: red',
  });

  assert.equal(normalized.requestTimeoutMs, 5000);
  assert.equal(normalized.maxCandidates, 10);
  assert.equal(normalized.titleFontSize, 28);
  assert.equal(normalized.discScale, 0.7);
  assert.equal(normalized.accentColor, '#63b3ed');
  assert.equal(normalized.customCss.length, 20000);
  assert.equal(normalized.fontFamily, 'cascadia-mono');
  assert.match(context.YtCdHudSettings.FONT_STACKS['cascadia-mono'], /Cascadia Mono/);
});

test('uses external scripts and exposes the complete control surface', () => {
  const html = read('extension/options/options.html');

  assert.doesNotMatch(html, /唱片 HUD|校準台/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  for (const setting of [
    'enabled',
    'enable1001',
    'autoSearch1001',
    'prefer1001',
    'enableMixesDb',
    'enableTrackId',
    'requestTimeoutMs',
    'maxCandidates',
    'titleFontSize',
    'timeFontSize',
    'fontFamily',
    'discScale',
    'surfaceOpacity',
    'accentColor',
    'showDisc',
    'showTransport',
    'customCss',
  ]) {
    assert.match(html, new RegExp(`name="${setting}"`));
  }
});

test('bridges only allowlisted tracklist providers with provider-specific credentials', () => {
  const worker = read('extension/background/service-worker.js');
  const bridge = read('extension/content/gm-xmlhttp-request.js');

  assert.match(worker, /\(\?:www\\\.\)\?1001tracklists\\\.com/);
  assert.match(worker, /credentials:\s*'include'/);
  assert.match(worker, /www\\\.mixesdb\\\.com/);
  assert.match(worker, /trackid\\\.net/);
  assert.match(worker, /credentials:\s*'omit'/);
  assert.doesNotMatch(worker, /chrome\.cookies/);
  assert.match(worker, /new AbortController\(\)/);
  assert.match(worker, /cache:\s*'default'/);
  assert.match(worker, /referrer:\s*'https:\/\/www\.1001tracklists\.com\/'/);
  assert.match(worker, /clearTimeout\(timeoutTimer\)/);
  assert.match(bridge, /chrome\.runtime\.sendMessage\([\s\S]*?result\s*=>/);
  assert.match(bridge, /chrome\.runtime\.lastError/);
  assert.doesNotMatch(worker, /\.then\s*\(/);
  assert.doesNotMatch(bridge, /\.then\s*\(/);
});

test('maps extension messaging success and runtime failures to GM callbacks', () => {
  let sentMessage = null;
  let responseCallback = null;
  const context = {
    chrome: {
      runtime: {
        lastError: undefined,
        sendMessage(message, callback) {
          sentMessage = message;
          responseCallback = callback;
        },
      },
    },
  };
  vm.runInNewContext(read('extension/content/gm-xmlhttp-request.js'), context);

  let loaded = null;
  let failed = null;
  context.GM_xmlhttpRequest({
    method: 'POST',
    url: 'https://www.1001tracklists.com/search/result.php',
    data: 'term=heldeep',
    onload(result) { loaded = result; },
    onerror(result) { failed = result; },
  });

  assert.equal(sentMessage.type, 'YT_CD_HUD_REMOTE_REQUEST');
  assert.equal(sentMessage.request.method, 'POST');
  assert.equal(sentMessage.request.data, 'term=heldeep');
  responseCallback({ ok: true, status: 200, responseText: '<html></html>' });
  assert.equal(loaded.status, 200);
  assert.equal(failed, null);

  context.chrome.runtime.lastError = { message: 'Extension context invalidated.' };
  context.GM_xmlhttpRequest({
    url: 'https://www.1001tracklists.com/',
    onerror(result) { failed = result; },
  });
  responseCallback(undefined);
  assert.equal(failed.phase, 'message');
  assert.equal(failed.error, 'Extension context invalidated.');
});

test('keeps the service-worker response channel open through a session-aware 1001 POST', async () => {
  let messageListener = null;
  let fetchRequest = null;
  const context = {
    AbortController,
    clearTimeout,
    console,
    fetch: async (url, init) => {
      fetchRequest = { url, init };
      return {
        status: 200,
        statusText: 'OK',
        url,
        headers: { entries: () => [['content-type', 'text/html; charset=utf-8']] },
        text: async () => '<html><a href="/tracklist/example">Result</a></html>',
      };
    },
    setTimeout,
    chrome: {
      action: { onClicked: { addListener() {} } },
      runtime: {
        openOptionsPage: async () => {},
        onMessage: {
          addListener(listener) { messageListener = listener; },
        },
      },
    },
  };
  vm.runInNewContext(read('extension/background/service-worker.js'), context);

  const responsePromise = new Promise(resolve => {
    const keptOpen = messageListener({
      type: 'YT_CD_HUD_REMOTE_REQUEST',
      request: {
        method: 'POST',
        url: 'https://www.1001tracklists.com/search/result.php',
        data: 'main_search=heldeep&search_selection=9',
        timeout: 5000,
      },
    }, {}, response => resolve({ keptOpen, response }));
  });
  const { keptOpen, response } = await responsePromise;

  assert.equal(keptOpen, true);
  assert.equal(fetchRequest.init.credentials, 'include');
  assert.equal(fetchRequest.init.cache, 'default');
  assert.equal(fetchRequest.init.body, 'main_search=heldeep&search_selection=9');
  assert.equal(fetchRequest.init.headers['Content-Type'], 'application/x-www-form-urlencoded; charset=UTF-8');
  assert.equal(response.ok, true);
  assert.equal(response.status, 200);
  assert.match(response.responseText, /\/tracklist\/example/);
});

test('uses anonymous read-only requests for supplemental providers', async () => {
  let messageListener = null;
  let fetchRequest = null;
  const context = {
    AbortController,
    clearTimeout,
    console,
    fetch: async (url, init) => {
      fetchRequest = { url, init };
      return {
        status: 200,
        statusText: 'OK',
        url,
        headers: { entries: () => [['content-type', 'application/json']] },
        text: async () => '{"result":{}}',
      };
    },
    setTimeout,
    chrome: {
      action: { onClicked: { addListener() {} } },
      runtime: {
        openOptionsPage: async () => {},
        onMessage: { addListener(listener) { messageListener = listener; } },
      },
    },
  };
  vm.runInNewContext(read('extension/background/service-worker.js'), context);

  const request = message => new Promise(resolve => {
    let keptOpen;
    keptOpen = messageListener(message, {}, response => {
      queueMicrotask(() => resolve({ keptOpen, response }));
    });
  });
  const mixesResponse = await request({
    type: 'YT_CD_HUD_REMOTE_REQUEST',
    request: { method: 'GET', url: 'https://www.mixesdb.com/w/api.php?action=query' },
  });
  assert.equal(mixesResponse.keptOpen, true);
  assert.equal(mixesResponse.response.ok, true);
  assert.equal(fetchRequest.init.credentials, 'omit');
  assert.equal(fetchRequest.init.body, undefined);
  assert.equal(fetchRequest.init.headers.Accept, 'application/json');

  const musicTrackResponse = await request({
    type: 'YT_CD_HUD_REMOTE_REQUEST',
    request: { method: 'GET', url: 'https://trackid.net/api/public/musictracks?keywords=Suburban+Train' },
  });
  assert.equal(musicTrackResponse.response.ok, true);
  assert.equal(fetchRequest.init.credentials, 'omit');

  const rejected = await request({
    type: 'YT_CD_HUD_REMOTE_REQUEST',
    request: { method: 'POST', url: 'https://trackid.net/api/public/audiostreams' },
  });
  assert.equal(rejected.response.ok, false);
  assert.equal(rejected.response.phase, 'validation');
});

test('keeps the settings preview aligned with the half-overhang HUD geometry', () => {
  const html = read('extension/options/options.html');
  const css = read('extension/options/options.css');

  assert.match(html, /<div class="preview-source">[\s\S]*?<div class="preview-transport">[\s\S]*?<\/div>[\s\S]*?<\/div>/);
  assert.match(css, /\.hud-preview:before\s*\{[\s\S]*?inset:\s*0\s+0\s+0\s+calc\(var\(--preview-disc-size\)\s*\/\s*2\)/);
  assert.match(css, /\.preview-disc\s*\{[\s\S]*?margin:\s*0\s+10px\s+0\s+0/);
  assert.match(css, /\.preview-transport b\s*\{[\s\S]*?width:\s*48px/);
  assert.match(css, /\.hud-preview\.hide-disc\s+\.preview-disc\s*\{\s*visibility:\s*hidden/);
  assert.doesNotMatch(css, /\.hud-preview\.hide-disc:before\s*\{[^}]*left:\s*0/);
  assert.match(css, /font-family:\s*var\(--preview-font\)/);
  assert.match(read('extension/options/options.js'), /settingsApi\.FONT_STACKS\[settings\.fontFamily\]/);
});

test('keeps the generated extension HUD synchronized with the userscript source', () => {
  const userscript = read('src/youtube-cd-hud.user.js');
  const generated = read('extension/content/youtube-cd-hud.js');
  const stripped = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

  assert.match(generated, /^\/\/ Generated from src\/youtube-cd-hud\.user\.js\./);
  assert.equal(generated.slice(generated.indexOf('(function ()')), stripped);
  assert.match(generated, /prepareExtensionSettings/);
  assert.match(generated, /runtimeSettings\.maxCandidates/);
  assert.match(generated, /yt-cd-hud-custom-style/);
});

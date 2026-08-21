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
  assert.equal(manifest.version, '5.12.0');
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
  assert.deepEqual(manifest.content_scripts[1], {
    matches: [
      'https://1001tracklists.com/*',
      'https://www.1001tracklists.com/*',
    ],
    js: ['content/1001-session-bridge.js'],
    run_at: 'document_idle',
  });
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
  const firstPartyBridge = read('extension/content/1001-session-bridge.js');

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
  assert.match(firstPartyBridge, /credentials:\s*'include'/);
  assert.match(firstPartyBridge, /1001tracklists\\\.com/);
  assert.doesNotMatch(firstPartyBridge, /document\.cookie|chrome\.cookies/);
  assert.match(worker, /chrome\.storage\.session/);
  assert.match(worker, /chrome\.tabs\.sendMessage/);
  assert.match(worker, /attachedAt/);
  assert.match(worker, /trying the next route/);
  assert.match(read('src/youtube-cd-hud.user.js'), /@grant\s+GM_getValue[\s\S]*?@grant\s+GM_setValue/);
  assert.doesNotMatch(read('src/youtube-cd-hud.user.js'), /globalThis\.localStorage/);
});

test('routes a YouTube 1001 request through the attached first-party result tab', async () => {
  let messageListener = null;
  let storedSessions = {};
  let directFetchCount = 0;
  let bridgedRequest = null;
  let readyNotification = null;
  const context = {
    AbortController,
    clearTimeout,
    console,
    Date,
    fetch: async () => {
      directFetchCount += 1;
      throw new Error('direct fetch should not run');
    },
    setTimeout,
    chrome: {
      action: { onClicked: { addListener() {} } },
      runtime: {
        openOptionsPage: async () => {},
        onMessage: { addListener(listener) { messageListener = listener; } },
      },
      storage: {
        session: {
          async get(key) { return { [key]: storedSessions }; },
          async set(value) { storedSessions = value.ytCdHud1001BridgeSessions; },
        },
      },
      tabs: {
        async sendMessage(tabId, message) {
          if (message.type === 'YT_CD_HUD_1001_BRIDGE_READY') {
            readyNotification = { tabId, message };
            return { ok: true };
          }
          bridgedRequest = { tabId, message };
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            finalUrl: message.request.url,
            responseHeaders: 'content-type: text/html',
            responseText: '<html><a href="/tracklist/bridge-result">Result</a></html>',
          };
        },
      },
    },
  };
  vm.runInNewContext(read('extension/background/service-worker.js'), context);

  const invoke = (message, sender) => new Promise(resolve => {
    const keptOpen = messageListener(message, sender, response => resolve({ keptOpen, response }));
  });
  const token = '12345678-1234-1234-1234-123456789abc';
  const registration = await invoke(
    { type: 'YT_CD_HUD_REGISTER_1001_BRIDGE', token },
    { url: 'https://www.youtube.com/watch?v=test', tab: { id: 41 } },
  );
  assert.equal(registration.keptOpen, true);
  assert.equal(registration.response.ok, true);

  const attachment = await invoke(
    { type: 'YT_CD_HUD_ATTACH_1001_BRIDGE', token },
    { url: `https://www.1001tracklists.com/search/result.php#yt-cd-hud-session=${token}`, tab: { id: 77 } },
  );
  assert.equal(attachment.response.ok, true);

  const replacementToken = 'abcdefab-cdef-abcd-efab-cdefabcdefab';
  const replacementRegistration = await invoke(
    { type: 'YT_CD_HUD_REGISTER_1001_BRIDGE', token: replacementToken },
    { url: 'https://www.youtube.com/watch?v=test', tab: { id: 41 } },
  );
  assert.equal(replacementRegistration.response.ok, true);
  const replacementAttachment = await invoke(
    { type: 'YT_CD_HUD_ATTACH_1001_BRIDGE', token: replacementToken },
    { url: `https://www.1001tracklists.com/tracklist/example#yt-cd-hud-session=${replacementToken}`, tab: { id: 78 } },
  );
  assert.equal(replacementAttachment.response.ok, true);
  assert.equal(Object.keys(storedSessions).length, 1);

  const ready = await invoke(
    { type: 'YT_CD_HUD_1001_BRIDGE_READY' },
    { url: 'https://www.1001tracklists.com/tracklist/example', tab: { id: 78 } },
  );
  assert.equal(ready.response.ok, true);
  assert.equal(ready.response.notified, true);
  assert.equal(readyNotification.tabId, 41);
  assert.equal(readyNotification.message.type, 'YT_CD_HUD_1001_BRIDGE_READY');

  const rejectedReady = await invoke(
    { type: 'YT_CD_HUD_1001_BRIDGE_READY' },
    { url: 'https://www.youtube.com/watch?v=test', tab: { id: 41 } },
  );
  assert.equal(rejectedReady.response.ok, false);
  assert.equal(rejectedReady.response.phase, 'validation');

  const result = await invoke({
    type: 'YT_CD_HUD_REMOTE_REQUEST',
    request: {
      method: 'POST',
      url: 'https://www.1001tracklists.com/search/result.php',
      data: 'main_search=test&search_selection=9',
    },
  }, { url: 'https://www.youtube.com/watch?v=test', tab: { id: 41 } });

  assert.equal(result.response.ok, true);
  assert.match(result.response.responseText, /bridge-result/);
  assert.equal(bridgedRequest.tabId, 78);
  assert.equal(bridgedRequest.message.type, 'YT_CD_HUD_1001_BRIDGE_FETCH');
  assert.equal(bridgedRequest.message.request.method, 'POST');
  assert.equal(directFetchCount, 0);
});

test('cancels a 1001 request before bridge routing begins', async () => {
  let messageListener = null;
  let releaseSessionLookup = null;
  let bridgeFetchCount = 0;
  let directFetchCount = 0;
  const context = {
    AbortController,
    clearTimeout,
    console,
    Date,
    fetch: async () => { directFetchCount += 1; throw new Error('cancelled request must not fetch'); },
    setTimeout,
    chrome: {
      action: { onClicked: { addListener() {} } },
      runtime: {
        openOptionsPage: async () => {},
        onMessage: { addListener(listener) { messageListener = listener; } },
      },
      storage: {
        session: {
          async get(key) {
            return await new Promise(resolve => {
              releaseSessionLookup = () => resolve({ [key]: {} });
            });
          },
          async set() {},
        },
      },
      tabs: {
        async sendMessage() { bridgeFetchCount += 1; throw new Error('cancelled request must not reach bridge'); },
      },
    },
  };
  vm.runInNewContext(read('extension/background/service-worker.js'), context);
  const invoke = (message, sender) => new Promise(resolve => {
    messageListener(message, sender, response => resolve(response));
  });
  const sender = { url: 'https://www.youtube.com/watch?v=test', tab: { id: 41 } };
  const requestId = '12345678-1234-1234-1234-123456789abc';
  const remoteResult = invoke({
    type: 'YT_CD_HUD_REMOTE_REQUEST',
    requestId,
    request: { method: 'GET', url: 'https://www.1001tracklists.com/tracklist/example' },
  }, sender);
  await new Promise(resolve => setImmediate(resolve));
  const wrongTabCancellation = await invoke(
    { type: 'YT_CD_HUD_CANCEL_REMOTE_REQUEST', requestId },
    { url: 'https://www.youtube.com/watch?v=other', tab: { id: 42 } },
  );
  assert.equal(wrongTabCancellation.ok, false);
  assert.equal(wrongTabCancellation.phase, 'validation');
  const cancellation = await invoke({ type: 'YT_CD_HUD_CANCEL_REMOTE_REQUEST', requestId }, sender);
  assert.equal(cancellation.ok, true);
  releaseSessionLookup();
  const result = await remoteResult;
  assert.equal(result.phase, 'cancelled');
  assert.equal(bridgeFetchCount, 0);
  assert.equal(directFetchCount, 0);
});

test('keeps a cancelled bridge response from completing successfully', async () => {
  let messageListener = null;
  let resolveBridgeFetch = null;
  let bridgeCancelCount = 0;
  const now = Date.now();
  const storedSessions = {
    '12345678-1234-1234-1234-123456789abc': {
      youtubeTabId: 41,
      bridgeTabId: 78,
      registeredAt: now,
      attachedAt: now,
      expiresAt: now + 60_000,
    },
  };
  const context = {
    AbortController,
    clearTimeout,
    console,
    Date,
    fetch: async () => { throw new Error('cancelled bridge must not fall back'); },
    setTimeout,
    chrome: {
      action: { onClicked: { addListener() {} } },
      runtime: {
        openOptionsPage: async () => {},
        onMessage: { addListener(listener) { messageListener = listener; } },
      },
      storage: {
        session: {
          async get(key) { return { [key]: storedSessions }; },
          async set() {},
        },
      },
      tabs: {
        async sendMessage(tabId, message) {
          assert.equal(tabId, 78);
          if (message.type === 'YT_CD_HUD_1001_BRIDGE_CANCEL') {
            bridgeCancelCount += 1;
            return { ok: true };
          }
          return await new Promise(resolve => { resolveBridgeFetch = resolve; });
        },
      },
    },
  };
  vm.runInNewContext(read('extension/background/service-worker.js'), context);
  const invoke = (message, sender) => new Promise(resolve => {
    messageListener(message, sender, response => resolve(response));
  });
  const sender = { url: 'https://www.youtube.com/watch?v=test', tab: { id: 41 } };
  const requestId = 'abcdefab-cdef-abcd-efab-cdefabcdefab';
  const remoteResult = invoke({
    type: 'YT_CD_HUD_REMOTE_REQUEST',
    requestId,
    request: { method: 'GET', url: 'https://www.1001tracklists.com/tracklist/example' },
  }, sender);
  while (!resolveBridgeFetch) await new Promise(resolve => setImmediate(resolve));
  const cancellation = await invoke({ type: 'YT_CD_HUD_CANCEL_REMOTE_REQUEST', requestId }, sender);
  assert.equal(cancellation.ok, true);
  assert.equal(cancellation.cancelled, true);
  resolveBridgeFetch({
    ok: true,
    status: 200,
    responseText: '<html>late success</html>',
  });
  const result = await remoteResult;
  assert.equal(result.ok, false);
  assert.equal(result.phase, 'cancelled');
  assert.equal(bridgeCancelCount, 1);
});

test('uses the rendered 1001 search result once instead of repeating its POST', async () => {
  let bridgeListener = null;
  let attachedMessage = null;
  let fetchCount = 0;
  const renderedHtml = '<html><body><a href="/tracklist/rendered-result">Result</a></body></html>';
  const context = {
    AbortController,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    document: { documentElement: { outerHTML: renderedHtml } },
    fetch: async () => {
      fetchCount += 1;
      throw new Error('the initial POST must use the rendered document');
    },
    history: { state: null, replaceState() {} },
    location: {
      hash: '#yt-cd-hud-session=12345678-1234-1234-1234-123456789abc',
      href: 'https://www.1001tracklists.com/search/result.php#yt-cd-hud-session=12345678-1234-1234-1234-123456789abc',
      origin: 'https://www.1001tracklists.com',
      pathname: '/search/result.php',
      search: '',
    },
    setTimeout,
    chrome: {
      runtime: {
        lastError: undefined,
        onMessage: { addListener(listener) { bridgeListener = listener; } },
        sendMessage(message, callback) {
          attachedMessage = message;
          callback({ ok: true });
        },
      },
    },
  };
  vm.runInNewContext(read('extension/content/1001-session-bridge.js'), context);
  assert.equal(attachedMessage.type, 'YT_CD_HUD_ATTACH_1001_BRIDGE');

  const result = await new Promise(resolve => {
    const keptOpen = bridgeListener({
      type: 'YT_CD_HUD_1001_BRIDGE_FETCH',
      request: {
        method: 'POST',
        url: 'https://www.1001tracklists.com/search/result.php',
        data: 'main_search=test&search_selection=9',
      },
    }, {}, response => resolve({ keptOpen, response }));
  });

  assert.equal(result.keptOpen, true);
  assert.equal(result.response.ok, true);
  assert.equal(result.response.source, 'rendered-document');
  assert.equal(result.response.responseText, renderedHtml);
  assert.equal(fetchCount, 0);
});

test('uses a rendered 1001 candidate GET after manual browser verification', async () => {
  let bridgeListener = null;
  let fetchCount = 0;
  const sentMessages = [];
  const renderedHtml = '<html><body><div class="tlpTog">Verified candidate</div></body></html>';
  const context = {
    AbortController,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    document: {
      documentElement: { outerHTML: renderedHtml },
      querySelector() { return {}; },
    },
    fetch: async () => { fetchCount += 1; throw new Error('rendered GET must not refetch'); },
    history: { state: null, replaceState() {} },
    location: {
      hash: '#yt-cd-hud-session=12345678-1234-1234-1234-123456789abc',
      href: 'https://www.1001tracklists.com/tracklist/example#yt-cd-hud-session=12345678-1234-1234-1234-123456789abc',
      origin: 'https://www.1001tracklists.com',
      pathname: '/tracklist/example',
      search: '',
    },
    setTimeout,
    chrome: {
      runtime: {
        lastError: undefined,
        onMessage: { addListener(listener) { bridgeListener = listener; } },
        sendMessage(message, callback) {
          sentMessages.push(message);
          callback({ ok: true });
        },
      },
    },
  };
  vm.runInNewContext(read('extension/content/1001-session-bridge.js'), context);
  const result = await new Promise(resolve => {
    bridgeListener({
      type: 'YT_CD_HUD_1001_BRIDGE_FETCH',
      request: { method: 'GET', url: 'https://www.1001tracklists.com/tracklist/example' },
    }, {}, resolve);
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'rendered-document');
  assert.equal(result.responseText, renderedHtml);
  assert.equal(fetchCount, 0);
  assert.deepEqual(sentMessages.map(message => message.type), [
    'YT_CD_HUD_ATTACH_1001_BRIDGE',
    'YT_CD_HUD_1001_BRIDGE_READY',
  ]);
});

test('announces a verified rendered 1001 tracklist after the session fragment is removed', () => {
  const sentMessages = [];
  const context = {
    AbortController,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    document: {
      documentElement: { outerHTML: '<html><div class="tlpTog">Track</div></html>' },
      querySelector() { return {}; },
    },
    fetch: async () => { throw new Error('ready notification must not fetch'); },
    history: { state: null, replaceState() {} },
    location: {
      hash: '',
      href: 'https://www.1001tracklists.com/tracklist/example',
      origin: 'https://www.1001tracklists.com',
      pathname: '/tracklist/example',
      search: '',
    },
    setTimeout,
    chrome: {
      runtime: {
        lastError: undefined,
        onMessage: { addListener() {} },
        sendMessage(message, callback) {
          sentMessages.push(message);
          callback({ ok: true });
        },
      },
    },
  };

  vm.runInNewContext(read('extension/content/1001-session-bridge.js'), context);
  assert.deepEqual(sentMessages.map(message => message.type), ['YT_CD_HUD_1001_BRIDGE_READY']);
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

  const abortable = context.GM_xmlhttpRequest({ url: 'https://www.1001tracklists.com/tracklist/test' });
  const requestId = sentMessage.requestId;
  assert.match(requestId, /^[a-z0-9-]{16,100}$/i);
  abortable.abort();
  assert.equal(sentMessage.type, 'YT_CD_HUD_CANCEL_REMOTE_REQUEST');
  assert.equal(sentMessage.requestId, requestId);

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
      storage: {
        session: {
          async get(key) { return { [key]: {} }; },
          async set() {},
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
    }, { url: 'https://www.youtube.com/watch?v=heldeep', tab: { id: 41 } }, response => resolve({ keptOpen, response }));
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

  const youtubeSender = { url: 'https://www.youtube.com/watch?v=providers', tab: { id: 41 } };
  const request = (message, sender = youtubeSender) => new Promise(resolve => {
    let keptOpen;
    keptOpen = messageListener(message, sender, response => {
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

  for (const sender of [
    {},
    { url: 'chrome-extension://example/options.html', tab: { id: 50 } },
    { url: 'https://www.1001tracklists.com/search/result.php', tab: { id: 51 } },
  ]) {
    const unauthorized = await request({
      type: 'YT_CD_HUD_REMOTE_REQUEST',
      request: { method: 'GET', url: 'https://www.mixesdb.com/w/api.php?action=query' },
    }, sender);
    assert.equal(unauthorized.response.ok, false);
    assert.equal(unauthorized.response.phase, 'validation');
  }
});

test('keeps the settings preview aligned with the half-overhang HUD geometry', () => {
  const html = read('extension/options/options.html');
  const css = read('extension/options/options.css');

  assert.match(html, /<div class="preview-source">[\s\S]*?<div class="preview-transport">[\s\S]*?<\/div>[\s\S]*?<\/div>/);
  assert.match(html, /class="preview-tracklist">≡<\/b>/);
  assert.match(html, /class="preview-tools"><b>×<\/b><b>T±<\/b><\/div>/);
  assert.match(html, /class="preview-resize"/);
  assert.match(css, /\.hud-preview:before\s*\{[\s\S]*?inset:\s*0\s+0\s+0\s+calc\(var\(--preview-disc-size\)\s*\/\s*2\)/);
  assert.match(css, /\.hud-preview\s*\{[\s\S]*?gap:\s*6px/);
  assert.match(css, /\.preview-disc\s*\{[\s\S]*?margin:\s*0\s+2px\s+0\s+0/);
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
  assert.match(generated, /TRACKLIST_CACHE_STORAGE_KEY\s*=\s*'ytCdHudTracklistCacheV1'/);
  assert.match(generated, /TRACKLIST_CACHE_TTL_MS\s*=\s*6\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(generated, /TRACKLIST_CACHE_MAX_ENTRIES\s*=\s*30/);
  assert.match(generated, /chrome\.storage\.local\.set\(\{\s*\[TRACKLIST_CACHE_STORAGE_KEY\]/);
  assert.match(generated, /await loadTracklistCache\(\);[\s\S]*?scheduleInitialization\(\)/);
  assert.match(generated, /cacheHitVideoId\s*!==\s*videoId[\s\S]*?refreshedTitle/);
  assert.match(generated, /restoredCacheSource\s*===\s*'youtube'[\s\S]*?setActiveSource\('youtube'\)/);
  assert.match(generated, /sourceLink\.addEventListener\('click'[\s\S]*?cycleTracklistCandidate\(currentSource\)/);
  assert.match(generated, /candidates1001:\s*tracklistCandidates\['1001'\]/);
  assert.match(generated, /scheduleCandidate\(candidateIndex \+ 1\)/);
});

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
  assert.equal(manifest.version, '5.8.0');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, [
    'https://www.youtube.com/*',
    'https://1001tracklists.com/*',
    'https://www.1001tracklists.com/*',
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
  });

  assert.equal(normalized.requestTimeoutMs, 5000);
  assert.equal(normalized.maxCandidates, 10);
  assert.equal(normalized.titleFontSize, 28);
  assert.equal(normalized.discScale, 0.7);
  assert.equal(normalized.accentColor, '#63b3ed');
  assert.equal(normalized.customCss.length, 20000);
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
    'requestTimeoutMs',
    'maxCandidates',
    'titleFontSize',
    'timeFontSize',
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

test('bridges only allowlisted 1001Tracklists requests without credentials', () => {
  const worker = read('extension/background/service-worker.js');
  const bridge = read('extension/content/gm-xmlhttp-request.js');

  assert.match(worker, /\(\?:www\\\.\)\?1001tracklists\\\.com/);
  assert.match(worker, /credentials:\s*'omit'/);
  assert.match(worker, /AbortSignal\.timeout/);
  assert.doesNotMatch(worker, /\.then\s*\(/);
  assert.doesNotMatch(bridge, /\.then\s*\(/);
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

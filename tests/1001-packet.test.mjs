import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const packetSource = fs.readFileSync(path.join(projectRoot, 'extension/shared/1001-packet.js'), 'utf8');
const context = { TextEncoder, URL };
context.globalThis = context;
vm.runInNewContext(packetSource, context);
const packetApi = context.YtCdHud1001Packet;

test('normalizes a bounded structured 1001 packet without raw browsing data', () => {
  const packet = packetApi.normalizePacket({
    version: 1,
    provider: '1001tracklists',
    canonicalUrl: 'https://www.1001tracklists.com/tracklist/example.html#session-secret',
    capturedAt: 1234,
    tracks: [
      { time: 0, title: ' Artist A - Intro ' },
      { time: 240, title: 'Artist B - Next' },
    ],
    responseText: '<html>must not cross the bridge</html>',
    responseHeaders: 'set-cookie: secret',
    token: 'secret',
  });

  assert.deepEqual(Object.keys(packet), ['version', 'provider', 'canonicalUrl', 'capturedAt', 'tracks']);
  assert.equal(packet.canonicalUrl, 'https://www.1001tracklists.com/tracklist/example.html');
  assert.equal(JSON.stringify(packet).includes('secret'), false);
  assert.equal(packet.tracks.length, 2);
});

test('rejects packets outside the first-party tracklist path or without tracks', () => {
  assert.equal(packetApi.normalizePacket({
    version: 1,
    provider: '1001tracklists',
    canonicalUrl: 'https://evil.example/tracklist/example.html',
    tracks: [{ time: 0, title: 'Nope' }],
  }), null);
  assert.equal(packetApi.normalizePacket({
    version: 1,
    provider: '1001tracklists',
    canonicalUrl: 'https://www.1001tracklists.com/search/',
    tracks: [],
  }), null);
});

test('extracts rendered 1001 rows into the direct packet contract', () => {
  const row = {
    querySelector(selector) {
      if (selector.includes('.cue')) return { textContent: '04:20' };
      if (selector.includes('.trackValue')) return { textContent: 'Artist - Track' };
      return null;
    },
  };
  const documentValue = {
    querySelector(selector) {
      if (selector === 'link[rel="canonical"]') {
        return { href: 'https://www.1001tracklists.com/tracklist/example.html' };
      }
      return null;
    },
    querySelectorAll() {
      return [row];
    },
  };

  const packet = packetApi.extractRenderedTracklist(
    documentValue,
    'https://www.1001tracklists.com/tracklist/example.html',
    5000,
  );
  assert.equal(packet.provider, '1001tracklists');
  assert.deepEqual(JSON.parse(JSON.stringify(packet.tracks)), [{ time: 260, title: 'Artist - Track' }]);
});

test('does not turn empty rendered cues into zero-second tracks', () => {
  const makeRow = (value, visibleCue = '') => ({
    querySelector(selector) {
      if (selector.includes('.cue,')) return { textContent: visibleCue };
      if (selector.includes('.trackValue')) return { textContent: 'Key4050 - Want More' };
      if (selector.includes('[data-cue]')) return { dataset: {}, value };
      return null;
    },
  });
  const extract = rows => packetApi.extractRenderedTracklist({
    querySelector() { return null; },
    querySelectorAll() { return rows; },
  }, 'https://www.1001tracklists.com/tracklist/example.html');

  assert.equal(extract([makeRow('')]), null);
  assert.equal(extract([makeRow('  ')]), null);
  assert.equal(extract([makeRow('', 'not a cue')]), null);
  assert.equal(extract([makeRow('', '07:41')]).tracks[0].time, 461);
  assert.equal(extract([makeRow('0')]).tracks[0].time, 0);
  assert.equal(extract([makeRow('120', '07:41')]).tracks[0].time, 120);
});

test('rejects absent or coerced packet times and stale all-zero multi-track packets', () => {
  const normalize = tracks => packetApi.normalizePacket({
    version: 1,
    provider: '1001tracklists',
    canonicalUrl: 'https://www.1001tracklists.com/tracklist/example.html',
    tracks,
  });
  for (const time of [null, undefined, '', '  ', false, [], -1, 'invalid', Infinity]) {
    assert.equal(normalize([{ time, title: 'Untimed track' }]), null, `invalid time: ${String(time)}`);
  }
  assert.equal(normalize([{ time: 0, title: 'Intro' }]).tracks[0].time, 0);
  assert.equal(normalize([{ time: 0, title: 'Intro' }, { time: 0, title: 'Next' }]), null);
});

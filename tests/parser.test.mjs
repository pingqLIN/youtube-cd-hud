import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const sourcePath = path.join(projectRoot, 'src', 'youtube-cd-hud.user.js');
const source = fs.readFileSync(sourcePath, 'utf8');
let documentParseHtmlCalls = 0;

const sandbox = {
  URL,
  URLSearchParams,
  Document: class Document {
    static parseHTML() {
      documentParseHtmlCalls++;
      return { parser: 'sanitized' };
    }
  },
  DOMParser: class DOMParser {
    parseFromString(markup, type) {
      return { markup: String(markup), parser: 'inert', type };
    }
  },
  __YT_CD_HUD_TEST_MODE__: true,
  clearInterval,
  clearTimeout,
  console,
  setInterval,
  setTimeout,
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: sourcePath });

const {
  angleDeltaToSeconds,
  calculateHudMinimumSize,
  chooseHudTitle,
  collectTracklistCandidates,
  detectBlockPage,
  getAdjacentTrackTime,
  getBalancedDiscSize,
  getContentBalancedDiscSize,
  isSuccessfulHttpStatus,
  normalizeSearchTitle,
  normalizeAngleDelta,
  parseRemoteHtml,
  parseTimestampToSeconds,
  parseTracklistDocument,
} = sandbox.__YT_CD_HUD_TEST_EXPORTS__;

test('accepts successful partial-content responses for normal validation', () => {
  assert.equal(isSuccessfulHttpStatus(200), true);
  assert.equal(isSuccessfulHttpStatus(206), true);
  assert.equal(isSuccessfulHttpStatus(299), true);
  assert.equal(isSuccessfulHttpStatus(199), false);
  assert.equal(isSuccessfulHttpStatus(300), false);
});

test('detects the native 1001Tracklists rate-limit captcha before candidate fallback', () => {
  const doc = {
    title: "1001Tracklists - The World's Leading DJ Tracklist Database",
    querySelector: selector => selector.includes('/info/unblock_ip.html') ? {} : null,
  };
  const message = detectBlockPage(
    doc,
    'Your IP has sent too many requests. Fill out the captcha to unblock your IP!',
    206,
  );

  assert.match(message, /CAPTCHA/);
  assert.match(message, /限制請求頻率/);
});

test('maps clockwise disc motion forward and unwraps the angle boundary', () => {
  assert.ok(angleDeltaToSeconds(Math.PI / 2) > 0);
  assert.ok(angleDeltaToSeconds(-Math.PI / 2) < 0);
  assert.ok(normalizeAngleDelta(-Math.PI * 1.5) > 0);
  assert.ok(normalizeAngleDelta(Math.PI * 1.5) < 0);
});

test('balances responsive disc size against the selected title size', () => {
  const defaultSize = getBalancedDiscSize(1920, 1080, 14);
  const enlargedSize = getBalancedDiscSize(1920, 1080, 20);

  assert.ok(defaultSize > 67 && defaultSize < 68);
  assert.ok(enlargedSize > defaultSize);
  assert.equal(getBalancedDiscSize(480, 720, 14), 52.8);
  assert.ok(enlargedSize <= 92);
});

test('keeps the disc slightly taller than the adjacent content by default', () => {
  assert.equal(getContentBalancedDiscSize(1280, 800, 14, 72, 1), 82);
  assert.ok(Math.abs(getContentBalancedDiscSize(1280, 800, 14, 72, 1.2) - 98.4) < 1e-9);
});

test('uses the active 1001 track instead of a YouTube system chapter label', () => {
  assert.equal(
    chooseHudTitle('1001', 'Ross Quinn & Punctual - Omen', '影片相關資訊'),
    'Ross Quinn & Punctual - Omen',
  );
  assert.equal(chooseHudTitle('1001', '', '影片相關資訊'), '1001 Tracklist');
  assert.equal(chooseHudTitle('youtube', 'Fallback track', 'Official chapter'), 'Official chapter');
});

test('calculates a complete HUD floor from the disc, text, controls, and padding', () => {
  const minimum = calculateHudMinimumSize({
    paddingLeft: 12,
    paddingRight: 42,
    paddingTop: 12,
    paddingBottom: 12,
    discWidth: 88,
    discHeight: 88,
    gap: 14,
    infoWidth: 260,
    infoHeight: 102,
    sideWidth: 26,
    sideHeight: 81,
  });

  assert.equal(minimum.width, 418);
  assert.equal(minimum.height, 126);
});

test('selects previous and next track targets with restart behavior', () => {
  const tracks = [{ time: 0 }, { time: 60 }, { time: 120 }];

  assert.equal(getAdjacentTrackTime(tracks, 10, 1), 60);
  assert.equal(getAdjacentTrackTime(tracks, 65, -1), 60);
  assert.equal(getAdjacentTrackTime(tracks, 61, -1), 0);
  assert.equal(getAdjacentTrackTime(tracks, 130, 1), 120);
});

function fakeLink(href, textContent) {
  return {
    textContent,
    closest: () => null,
    getAttribute: name => name === 'href' ? href : null,
  };
}

function fakeElement({ textContent = '', attributes = {} } = {}) {
  return {
    textContent,
    getAttribute: name => attributes[name] ?? null,
  };
}

function fakeTrackRow({ cueText = '', seconds = '', title }) {
  const cue = fakeElement({ textContent: cueText });
  const titleElement = fakeElement({ textContent: title });
  const secondsInput = seconds === ''
    ? null
    : fakeElement({ attributes: { value: String(seconds) } });

  return {
    querySelector(selector) {
      if (selector.startsWith('.cue,')) return cue;
      if (selector.startsWith('.trackValue,')) return titleElement;
      if (selector.startsWith('input[id$="_cue_seconds"]')) return secondsInput;
      return null;
    },
  };
}

test('normalizes common YouTube presentation suffixes', () => {
  assert.equal(
    normalizeSearchTitle('Hardwell - Tomorrowland 2026 (Official Video) [4K]'),
    'Hardwell - Tomorrowland 2026',
  );
});

test('ranks the closest tracklist result ahead of generic results', () => {
  const links = [
    fakeLink('/tracklist/a/hardwell-radio-2026.html', 'Hardwell Radio 2026'),
    fakeLink('/tracklist/b/hardwell-tomorrowland-2026.html', 'Hardwell Tomorrowland 2026'),
    fakeLink('/tracklist/c/another-artist.html', 'Another Artist'),
  ];
  const doc = { querySelectorAll: () => links };

  const candidates = collectTracklistCandidates(doc, 'Hardwell Tomorrowland 2026');
  assert.match(candidates[0], /hardwell-tomorrowland-2026/);
});

test('prefers the inert parser when Chrome exposes its sanitizing parser', () => {
  const parsed = parseRemoteHtml('<div class="bItm">track</div>');

  assert.equal(parsed.parser, 'inert');
  assert.equal(parsed.type, 'text/html');
  assert.match(parsed.markup, /class="bItm"/);
  assert.equal(documentParseHtmlCalls, 0);
});

test('parses visible cues and hidden cue seconds without duplicated test logic', () => {
  const rows = [
    fakeTrackRow({ cueText: '', seconds: 25, title: 'MORTEN & David Guetta - La Révolution' }),
    fakeTrackRow({ cueText: '04:18', title: 'Hardwell - Spaceman' }),
  ];
  const doc = {
    body: { textContent: '' },
    querySelectorAll: selector => selector === '.bItm' ? rows : [],
  };

  const tracks = parseTracklistDocument(doc);
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].time, 25);
  assert.equal(tracks[1].time, 258);
});

test('rejects malformed timestamps', () => {
  assert.equal(parseTimestampToSeconds('01:23'), 83);
  assert.ok(Number.isNaN(parseTimestampToSeconds('01:99')));
});

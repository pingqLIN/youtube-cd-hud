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
  getTrackIdMusicFallbackQuery,
  isSuccessfulHttpStatus,
  isLikelySingleTrackVideo,
  normalizeSearchTitle,
  normalizeAngleDelta,
  parseRemoteHtml,
  parseSearchResultDuration,
  parseMixesDbWikitext,
  parseTrackIdDetail,
  parseTimestampToSeconds,
  parseTracklistDocument,
  rankTrackIdMusicCandidates,
  selectSingleTrackMatch,
  submit1001SearchVerification,
} = sandbox.__YT_CD_HUD_TEST_EXPORTS__;

const trackIdMusicFixtures = [
  { artist: 'Dosem & Gouryella', title: 'Tenshi (Extended Mix)', slug: 'dosem-gouryella-tenshi-extended-mix' },
  { artist: 'Gouryella', title: 'Tenshi', slug: 'gouryella-tenshi' },
  { artist: 'Tiësto', title: 'Suburban Train', slug: 'tiesto-suburban-train' },
  { artist: 'Matt Darey, Li Kwan', title: 'Point Zero (Original 1994 Mix)', slug: 'point-zero-1994' },
  { artist: 'Matt Darey, Li Kwan', title: 'Point Zero (Matt Darey 2004 Mix)', slug: 'point-zero-2004' },
];

test('matches single-track records while preserving remix-version evidence', () => {
  const suburban = rankTrackIdMusicCandidates(
    'Tiësto - Suburban Train (Original Mix)',
    trackIdMusicFixtures,
  );
  const pointZero = rankTrackIdMusicCandidates(
    'Point Zero (Matt Darey 2004 Mix)',
    trackIdMusicFixtures,
  );
  const unsupportedRemix = rankTrackIdMusicCandidates(
    "Gouryella - Tenshi (Aerial state's 2019 remix)",
    trackIdMusicFixtures,
  );

  assert.equal(suburban[0].slug, 'tiesto-suburban-train');
  assert.equal(pointZero[0].slug, 'point-zero-2004');
  assert.equal(unsupportedRemix.length, 0);
});

test('limits music-track fallback to short non-set videos and removes version text from retry queries', () => {
  assert.equal(isLikelySingleTrackVideo('Tiësto - Suburban Train (Original Mix)', 563), true);
  assert.equal(isLikelySingleTrackVideo('Tiësto live DJ set', 563), false);
  assert.equal(isLikelySingleTrackVideo('Short title', 3600), false);
  assert.equal(getTrackIdMusicFallbackQuery('Tiësto - Suburban Train (Original Mix)'), 'Tiësto - Suburban Train');
});

test('extracts only the matching 1001 row for a single-track video', () => {
  const tracks = [
    { time: 120, title: 'Other Artist - Intro Track' },
    { time: 480, title: 'Tiësto - Suburban Train' },
    { time: 900, title: 'Other Artist - Outro Track' },
  ];

  assert.deepEqual(
    JSON.parse(JSON.stringify(selectSingleTrackMatch('Tiësto - Suburban Train (Original Mix)', tracks))),
    { time: 0, title: 'Tiësto - Suburban Train' },
  );
  assert.equal(
    selectSingleTrackMatch("Gouryella - Tenshi (Aerial state's 2019 remix)", [
      { time: 300, title: 'Gouryella - Tenshi' },
    ]),
    null,
  );
});

test('parses timestamped MixesDB wikitext without retaining wiki markup', () => {
  const tracks = parseMixesDbWikitext(`
# [0:05:23] [[Artist]] - [https://example.test Track Name] [Label]
# [12:34] Another Artist - Another Track
# [??] Unknown
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(tracks)), [
    { time: 323, title: 'Artist - Track Name [Label]' },
    { time: 754, title: 'Another Artist - Another Track' },
  ]);
});

test('combines and de-duplicates TrackId detection-process tracks', () => {
  const tracks = parseTrackIdDetail({ result: { detectionProcesses: [
    { detectionProcessMusicTracks: [
      { startTime: '00:01:02.5000000', artist: 'Artist', title: 'Track' },
    ] },
    { detectionProcessMusicTracks: [
      { startTime: '00:01:02', artist: 'Artist', title: 'Track' },
      { startTime: '00:04:00', artist: 'Other', title: 'Next' },
    ] },
  ] } });

  assert.deepEqual(JSON.parse(JSON.stringify(tracks)), [
    { time: 62, title: 'Artist - Track' },
    { time: 240, title: 'Other - Next' },
  ]);
});

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

test('detects the current 1001Tracklists JavaScript Turnstile forwarding page', () => {
  const doc = {
    title: 'Tracklist title',
    querySelector: selector => selector.includes('#turnstile-container') ? {} : null,
  };
  const message = detectBlockPage(
    doc,
    'Please wait, you will be forwarded. function onTurnstileLoad() { turnstile.render("#turnstile-container") } Please enable JavaScript',
    206,
  );

  assert.match(message, /瀏覽器驗證/);
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

test('lets the measured track title shrink the HUD width without a fixed blank reserve', () => {
  const baseMetrics = {
    paddingLeft: 0,
    paddingRight: 42,
    paddingTop: 0,
    paddingBottom: 0,
    discWidth: 88,
    discHeight: 88,
    gap: 14,
    infoHeight: 80,
    sideWidth: 26,
    sideHeight: 78,
  };
  const shortTitle = calculateHudMinimumSize({ ...baseMetrics, infoWidth: 140 });
  const longTitle = calculateHudMinimumSize({ ...baseMetrics, infoWidth: 320 });

  assert.equal(longTitle.width - shortTitle.width, 180);
  assert.ok(shortTitle.width < longTitle.width);
});

test('selects previous and next track targets with restart behavior', () => {
  const tracks = [{ time: 0 }, { time: 60 }, { time: 120 }];

  assert.equal(getAdjacentTrackTime(tracks, 10, 1), 60);
  assert.equal(getAdjacentTrackTime(tracks, 65, -1), 60);
  assert.equal(getAdjacentTrackTime(tracks, 61, -1), 0);
  assert.equal(getAdjacentTrackTime(tracks, 130, 1), 120);
});

function fakeLink(href, textContent, row = null) {
  return {
    textContent,
    closest: selector => selector === '.bItm' ? row : null,
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

test('parses compact 1001Tracklists search-result durations', () => {
  assert.equal(parseSearchResultDuration('1h 3m'), 3780);
  assert.equal(parseSearchResultDuration('2h'), 7200);
  assert.equal(parseSearchResultDuration('59m'), 3540);
  assert.equal(parseSearchResultDuration('unknown'), 0);
});

test('prefers the precise solo ASOT result over a same-event face-to-face set', () => {
  const resultRow = (date, playTime) => ({
    querySelector(selector) {
      if (selector === '[title="tracklist date"]') return fakeElement({ textContent: date });
      if (selector === '[title="play time"]') return fakeElement({ textContent: playTime });
      return null;
    },
  });
  const links = [
    fakeLink(
      '/tracklist/1kz2bb51/armin-van-buuren-john-summit-face-2-face-a-state-of-trance-event-legia-stadium-poland-2026-06-20.html',
      'Armin van Buuren & John Summit @ Face-2-Face, A State Of Trance, Legia Stadium, Poland',
      resultRow('20 Jun 2026', '1h 3m'),
    ),
    fakeLink(
      '/tracklist/2jqkjtw1/armin-van-buuren-a-state-of-trance-event-legia-stadium-poland-2026-06-20.html',
      'Armin van Buuren @ A State Of Trance, Legia Stadium, Poland',
      resultRow('20 Jun 2026', '2h'),
    ),
  ];
  const doc = { querySelectorAll: () => links };

  const candidates = collectTracklistCandidates(
    doc,
    'Armin van Buuren live at A State of Trance Poland 2026',
    5425,
  );

  assert.match(candidates[0], /2jqkjtw1/);
});

test('replays a blocked 1001 search as the original POST in a new tab', () => {
  let submittedForm = null;
  const popupDocument = {
    body: {
      appendChild(element) {
        submittedForm = element;
      },
    },
    createElement(tagName) {
      if (tagName === 'form') {
        return {
          children: [],
          appendChild(element) {
            this.children.push(element);
          },
          submit() {
            this.submitted = true;
          },
        };
      }
      return {};
    },
  };
  const popup = { document: popupDocument, opener: {} };
  const opened = [];

  const replayed = submit1001SearchVerification({
    method: 'POST',
    url: 'https://www.1001tracklists.com/search/result.php',
    fields: {
      main_search: 'Armin van Buuren live at A State of Trance Poland 2026',
      search_selection: '9',
    },
  }, (...args) => {
    opened.push(args);
    return popup;
  });

  assert.equal(replayed, true);
  assert.deepEqual(opened, [['', '_blank']]);
  assert.equal(popup.opener, null);
  assert.equal(submittedForm.method, 'POST');
  assert.equal(submittedForm.action, 'https://www.1001tracklists.com/search/result.php');
  assert.equal(submittedForm.submitted, true);
  assert.deepEqual(
    submittedForm.children.map(input => [input.name, input.value]),
    [
      ['main_search', 'Armin van Buuren live at A State of Trance Poland 2026'],
      ['search_selection', '9'],
    ],
  );
});

test('refuses to replay a verification POST outside the 1001 search endpoint', () => {
  const openWindow = () => {
    throw new Error('must not open');
  };

  assert.equal(submit1001SearchVerification({
    method: 'POST',
    url: 'https://example.com/search/result.php',
    fields: { main_search: 'test' },
  }, openWindow), false);
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

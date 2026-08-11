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

const sandbox = {
  URL,
  URLSearchParams,
  Document: class Document {},
  DOMParser: class DOMParser {},
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
  collectTracklistCandidates,
  normalizeSearchTitle,
  parseTimestampToSeconds,
  parseTracklistDocument,
} = sandbox.__YT_CD_HUD_TEST_EXPORTS__;

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

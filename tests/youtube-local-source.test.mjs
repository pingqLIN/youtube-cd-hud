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
  Document: class Document {
    static parseHTML() {
      return {};
    }
  },
  DOMParser: class DOMParser {
    parseFromString(markup, type) {
      return { markup: String(markup), type };
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
  chooseYouTubeTimestampPlaylist,
  isCredibleTimestampPlaylist,
  parseTimestampPlaylistText,
} = sandbox.__YT_CD_HUD_TEST_EXPORTS__;

test('exports YouTube local timestamp playlist helpers', () => {
  assert.equal(typeof parseTimestampPlaylistText, 'function');
  assert.equal(typeof isCredibleTimestampPlaylist, 'function');
  assert.equal(typeof chooseYouTubeTimestampPlaylist, 'function');
});

test('parses timestamp-first playlist lines and de-duplicates cue times', () => {
  const tracks = parseTimestampPlaylistText(`
00:00 Artist A - Intro
05:12 – Artist B - Second Track
05:12 Duplicate Artist - Duplicate Cue
1:02:03 Artist C - Finale
not a cue line
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(tracks)), [
    { time: 0, title: 'Artist A - Intro' },
    { time: 312, title: 'Artist B - Second Track' },
    { time: 3723, title: 'Artist C - Finale' },
  ]);
});

test('prefers a credible description playlist over loaded comments', () => {
  const selection = chooseYouTubeTimestampPlaylist(
    '00:00 Description A\n03:00 Description B',
    ['00:00 Comment A\n02:00 Comment B\n05:00 Comment C'],
  );

  assert.equal(selection.origin, 'description');
  assert.equal(selection.commentIndex, -1);
  assert.equal(selection.tracks.length, 2);
});

test('falls back to the strongest single loaded comment playlist', () => {
  const selection = chooseYouTubeTimestampPlaylist(
    '00:00 Weak description cue',
    [
      'Great set. My favorite part is around 12:34.',
      '00:00 Comment A\n04:00 Comment B',
      '00:00 Best A\n03:00 Best B\n09:00 Best C',
    ],
  );

  assert.equal(selection.origin, 'comments');
  assert.equal(selection.commentIndex, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(selection.tracks)), [
    { time: 0, title: 'Best A' },
    { time: 180, title: 'Best B' },
    { time: 540, title: 'Best C' },
  ]);
});

test('does not promote a single timestamp comment to a playlist source', () => {
  const selection = chooseYouTubeTimestampPlaylist('', ['00:00 Intro only']);

  assert.equal(selection.origin, '');
  assert.deepEqual(JSON.parse(JSON.stringify(selection.tracks)), []);
  assert.equal(isCredibleTimestampPlaylist([{ time: 0, title: 'Only cue' }]), false);
});

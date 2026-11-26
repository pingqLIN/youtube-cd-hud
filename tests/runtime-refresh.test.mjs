import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/youtube-cd-hud.user.js', import.meta.url), 'utf8');
function load(name, context) {
  const start = source.indexOf(`    function ${name}(`);
  assert.notEqual(start, -1);
  vm.runInNewContext(source.slice(start, source.indexOf('\n    function ', start + 1)), context);
}

test('persistent tracklist rerenders when active video tracks change without opening it', () => {
  const rendered = [];
  const context = {
    tracksFromYouTube: [{ title: 'Video B', time: 0 }], tracksFrom1001: [], tracksFromMixesDb: [], tracksFromTrackId: [],
    tracklistPanel: {}, tracklistVisible: false, currentVideo: null,
    getHudLayoutComponent: () => ({ present: true }),
    renderTracklist: () => rendered.push(context.parsedTracks[0].title),
    updateSourceButtons() {}, updateLinkButton() {}, updateTransportButtons() {},
  };
  for (const name of ['isPersistentTracklistPanel', 'isTracklistPanelVisible', 'setActiveSource']) load(name, context);
  context.setActiveSource('youtube');
  assert.deepEqual(rendered, ['Video B']);
  assert.equal(context.tracklistVisible, false);
});

test('cache clear notification cancels a pending write and forgets in-memory entries', () => {
  const cancelled = [];
  const context = {
    TRACKLIST_CACHE_STORAGE_KEY: 'cache', cachePersistTimer: 42,
    tracklistCache: { old: {} }, cacheHitVideoId: 'old',
    clearTimeout: id => cancelled.push(id), normalizeTracklistCache: value => value || {},
  };
  load('handleTracklistCacheChange', context);
  context.handleTracklistCacheChange({ cache: { newValue: {} } }, 'local');
  assert.deepEqual(cancelled, [42]);
  assert.deepEqual(Object.keys(context.tracklistCache), []);
  assert.equal(context.cachePersistTimer, null);
  assert.equal(context.cacheHitVideoId, '');
});

test('disabled cache bypasses reads and does not enqueue writes', () => {
  const context = { runtimeSettings: { enableCache: false }, setTimeout() { assert.fail('cache write'); } };
  load('scheduleTracklistCachePersist', context);
  load('restoreCachedTracklists', context);
  load('cacheCurrentTracklists', context);
  context.scheduleTracklistCachePersist();
  context.cacheCurrentTracklists('video-id');
  assert.equal(context.restoreCachedTracklists('video-id'), '');
});

test('normal cache acknowledgements preserve cache hit and newer pending results', () => {
  const context = {
    TRACKLIST_CACHE_STORAGE_KEY: 'cache', cachePersistTimer: 42, cacheHitVideoId: 'A',
    tracklistCache: { A: { savedAt: 20, title: 'new local' } },
    clearTimeout() { assert.fail('normal writes must not cancel pending persistence'); },
    normalizeTracklistCache: value => value,
  };
  load('handleTracklistCacheChange', context);
  context.handleTracklistCacheChange({ cache: { newValue: { A: { savedAt: 20, title: 'new local' } } } }, 'local');
  assert.equal(context.cacheHitVideoId, 'A');
  assert.equal(context.cachePersistTimer, 42);
  context.handleTracklistCacheChange({ cache: { newValue: { A: { savedAt: 10, title: 'old remote' }, B: { savedAt: 30 } } } }, 'local');
  assert.equal(context.tracklistCache.A.title, 'new local');
  assert.equal(context.tracklistCache.B.savedAt, 30);
  assert.equal(context.cacheHitVideoId, 'A');
  assert.equal(context.cachePersistTimer, 42);
});

test('disabled YouTube source clears local tracks and reconciles without reading page metadata', () => {
  let reconciled = false;
  const context = { isYouTubeMetadataCurrent: () => true, runtimeSettings: { enableYouTube: false }, tracksFromYouTube: ['old'], youtubeTrackOrigin: 'comments', reconcileActiveSource() { reconciled = true; } };
  load('parseYouTubeLocalTracks', context);
  context.parseYouTubeLocalTracks();
  assert.equal(context.tracksFromYouTube.length, 0);
  assert.equal(context.youtubeTrackOrigin, '');
  assert.equal(reconciled, true);
});

test('SPA A to B to cached A resets identity and renders each new source immediately', () => {
  const rendered = [];
  const cancelled = [];
  const context = {
    activeTracklistVideoId: 'A', activeSearchToken: 1, tracksFromYouTube: [],
    cancelActiveRequests: () => cancelled.push(true), resetProviderCandidates() {},
    clear1001VerificationReturn() {}, disconnectYouTubeCommentObserver() {},
    restoreCachedTracklists(id) {
      if (id === 'A') context.parsedTracks = [{ title: 'Cached A' }];
      return id === 'A' ? '1001' : '';
    },
    reconcileActiveSource() { rendered.push(context.parsedTracks.map(track => track.title)); },
  };
  load('refreshVideoTracklistState', context);
  context.refreshVideoTracklistState('B');
  assert.equal(context.activeTracklistVideoId, 'B');
  assert.equal(context.currentSource, 'none');
  assert.equal(context.refreshVideoTracklistState('A'), '1001');
  assert.equal(context.activeTracklistVideoId, 'A');
  assert.equal(JSON.stringify(rendered), '[[],["Cached A"]]');
  context.refreshVideoTracklistState('A');
  assert.equal(cancelled.length, 2);
});


test('SPA metadata from the previous watch page cannot seed a new video search', () => {
  const context = {
    document: { querySelector: () => ({ getAttribute: () => 'A' }) },
    getVideoId: () => 'B',
  };
  load('isYouTubeMetadataCurrent', context);
  load('getVideoTitle', context);
  load('parseYouTubeLocalTracks', context);
  assert.equal(context.getVideoTitle(), '');
  context.parseYouTubeLocalTracks();
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function createHarness(initial = {}, options = {}) {
  const state = structuredClone(initial);
  const listeners = [];
  const context = {
    console,
    crypto: webcrypto,
    TextEncoder,
    setTimeout,
    YtCdHudSettings: null,
    chrome: {
      storage: { local: {
        async get(keys) {
          const wanted = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(wanted.map(key => [key, state[key]]).filter(([, value]) => value !== undefined));
        },
        async set(values) {
          const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
            ? Object.fromEntries(Object.keys(value).sort().map(key => [key, reorder(value[key])])) : value;
          const next = options.reorderStorageKeys ? reorder(structuredClone(values)) : structuredClone(values);
          if (options.corruptSettings && next.ytCdHudSettings) next.ytCdHudSettings.enabled = 'corrupted';
          Object.assign(state, next);
        },
      } },
      runtime: { id: 'test', onMessage: { addListener(listener) { listeners.push(listener); } }, getURL: path => `chrome-extension://test/${path}` },
    },
  };
  vm.runInNewContext(read('extension/shared/settings.js'), context);
  vm.runInNewContext(read('extension/options/live-monitor-composer.js'), context);
  vm.runInNewContext(read('extension/shared/settings-coordinator.js'), context);
  return { context, state, listeners };
}

test('coordinator reads normalized settings and fingerprints unmanaged changes', async () => {
  const { context, state } = createHarness({ ytCdHudSettings: { requestTimeoutMs: 1 } });
  const first = await context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
  assert.equal(first.ok, true);
  assert.equal(first.snapshot.settings.requestTimeoutMs, 5000);
  state.ytCdHudSettings = { ...state.ytCdHudSettings, requestTimeoutMs: 30000 };
  const second = await context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
  assert.notEqual(second.snapshot.revision, first.snapshot.revision);
});

test('coordinator applies atomically, replays idempotently, and rejects stale revisions', async () => {
  const { context, state } = createHarness();
  const before = await context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
  const request = { action: 'apply', operationId: 'op-1', baseRevision: before.snapshot.revision, payload: { settings: { accentColor: '#ABCDEF' } } };
  const stored = await context.YtCdHudSettingsCoordinator.execute(request);
  assert.equal(stored.status, 'STORED');
  assert.equal(stored.snapshot.settings.accentColor, '#abcdef');
  assert.equal(state.ytCdHudSettings.accentColor, '#abcdef');
  const replay = await context.YtCdHudSettingsCoordinator.execute(request);
  assert.equal(replay.ok, true);
  assert.equal(replay.status, 'STORED');
  assert.equal(replay.snapshot.revision, stored.snapshot.revision);
  const conflict = await context.YtCdHudSettingsCoordinator.execute({ ...request, operationId: 'op-2', baseRevision: before.snapshot.revision, payload: { settings: { enabled: false } } });
  assert.equal(conflict.error, 'CONFLICT');
});

test('coordinator denies reused operation ids with different payloads', async () => {
  const { context } = createHarness();
  context.setTimeout = setTimeout;
  const readResult = await context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
  const base = { action: 'apply', operationId: 'same-id', baseRevision: readResult.snapshot.revision, payload: { settings: { enabled: false } } };
  await context.YtCdHudSettingsCoordinator.execute(base);
  const reused = await context.YtCdHudSettingsCoordinator.execute({ ...base, payload: { settings: { enabled: true } } });
  assert.equal(reused.error, 'OPERATION_REUSE_DENIED');
});

test('coordinator rejects omitted base revisions and malformed setting patches', async () => {
  const { context } = createHarness();
  const invalidBase = await context.YtCdHudSettingsCoordinator.execute({ action: 'apply', operationId: 'bad-base', payload: { settings: { enabled: false } } });
  assert.equal(invalidBase.error, 'BASE_REVISION_REQUIRED');
  const current = await context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
  for (const [index, settings] of [{ enabled: 'false' }, { unknown: true }, { requestTimeoutMs: 1 }].entries()) {
    const result = await context.YtCdHudSettingsCoordinator.execute({ action: 'apply', operationId: `bad-${index}`, baseRevision: current.snapshot.revision, payload: { settings } });
    assert.equal(result.error, 'SCHEMA_INVALID');
  }
});

test('queued applies serialize and only one stale writer wins', async () => {
  const { context } = createHarness();
  const current = await context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
  const first = context.YtCdHudSettingsCoordinator.execute({ action: 'apply', operationId: 'queue-1', baseRevision: current.snapshot.revision, payload: { settings: { enabled: false } } });
  const second = context.YtCdHudSettingsCoordinator.execute({ action: 'apply', operationId: 'queue-2', baseRevision: current.snapshot.revision, payload: { settings: { enabled: true } } });
  const results = await Promise.all([first, second]);
  assert.equal(results.filter(result => result.status === 'STORED').length, 1);
  assert.equal(results.filter(result => result.error === 'CONFLICT').length, 1);
});

test('journal survives a coordinator restart and replays the same operation', async () => {
  const first = createHarness();
  const initial = await first.context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
  const request = { action: 'apply', operationId: 'restart-1', baseRevision: initial.snapshot.revision, payload: { settings: { enabled: false } } };
  const stored = await first.context.YtCdHudSettingsCoordinator.execute(request);
  const second = createHarness(first.state);
  const replay = await second.context.YtCdHudSettingsCoordinator.execute(request);
  assert.equal(replay.status, 'STORED');
  assert.equal(replay.snapshot.revision, stored.snapshot.revision);
  const status = await second.context.YtCdHudSettingsCoordinator.execute({ action: 'operation.status', operationId: 'restart-1' });
  assert.equal(status.status, 'STORED');
});

test('pending journal entries and readback mismatches remain incomplete', async () => {
  const pending = createHarness({ ytCdHudSettingsOperationsV1: [{ operationId: 'pending-1', requestDigest: 'unknown', status: 'PENDING', result: null }] });
  const status = await pending.context.YtCdHudSettingsCoordinator.execute({ action: 'operation.status', operationId: 'pending-1' });
  assert.equal(status.error, 'INCOMPLETE');
  const mismatch = createHarness({}, { corruptSettings: true });
  const initial = await mismatch.context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
  const result = await mismatch.context.YtCdHudSettingsCoordinator.execute({ action: 'apply', operationId: 'mismatch-1', baseRevision: initial.snapshot.revision, payload: { settings: { enabled: false } } });
  assert.equal(result.error, 'INCOMPLETE');
  const journal = mismatch.state.ytCdHudSettingsOperationsV1.find(entry => entry.operationId === 'mismatch-1');
  assert.equal(journal.status, 'INCOMPLETE');
});

test('message sender gates reject wrong extension and YouTube settings writes', async () => {
  const { listeners } = createHarness();
  const listener = listeners[0];
  const reply = message => new Promise(resolve => listener(message, { id: 'other', url: 'chrome-extension://test/options/options.html' }, resolve));
  assert.equal((await reply({ type: 'YT_CD_HUD_SETTINGS', action: 'read' })).error, 'SENDER_DENIED');
  const youtubeSettings = await new Promise(resolve => listener(
    { type: 'YT_CD_HUD_SETTINGS', action: 'apply', baseRevision: 'a'.repeat(64), operationId: 'yt-1', payload: { settings: { enabled: false } } },
    { id: 'test', url: 'https://www.youtube.com/watch?v=abc', tab: { id: 3 }, frameId: 0 }, resolve
  ));
  assert.equal(youtubeSettings.error, 'SENDER_DENIED');
  const optionsRead = await new Promise(resolve => listener(
    { type: 'YT_CD_HUD_SETTINGS', action: 'read' },
    { id: 'test', url: 'chrome-extension://test/options/options.html' }, resolve
  ));
  assert.equal(optionsRead.ok, true);
});

test('userscript runtime layout persistence fails closed for an extension without the coordinator', () => {
  const source = read('src/youtube-cd-hud.user.js');
  assert.match(source, /extensionContext && !\(globalThis\.YtCdHudSettingsClient\?\.apply && runtimeStorageRevision !== null\)/);
  assert.match(source, /else if \(!extensionContext && globalThis\.chrome\?\.storage\?\.local\)/);
  assert.match(source, /baseRevision: runtimeLayoutDragRevision \|\| runtimeStorageRevision/);
});

test('runtime acknowledgement can reread coordinator state after apply queue releases', async () => {
  const { context } = createHarness();
  context.setTimeout = setTimeout;
  context.chrome.tabs = {
    async query() { return [{ id: 7 }]; },
    async sendMessage() {
      const snapshot = await context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
      return { status: 'APPLIED', revision: snapshot.snapshot.revision };
    },
  };
  const current = await context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
  const result = await context.YtCdHudSettingsCoordinator.execute({ action: 'apply', operationId: 'ack-1', baseRevision: current.snapshot.revision, payload: { settings: { enabled: false } } });
  assert.equal(result.status, 'STORED');
  assert.equal(result.runtime.status, 'APPLIED');
  assert.equal(result.runtime.acknowledgedTabs, 1);
});

test('coordinator accepts a full snapshot no-op apply and reads it back canonically', async () => {
  const { context } = createHarness();
  const before = await context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
  const result = await context.YtCdHudSettingsCoordinator.execute({
    action: 'apply', operationId: 'noop-full-1', baseRevision: before.snapshot.revision,
    payload: { settings: before.snapshot.settings, layout: before.snapshot.layout },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'STORED');
  const after = await context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
  assert.equal(after.snapshot.revision, result.snapshot.revision);
});



test('full snapshot apply survives storage object-key reordering', async () => {
  const { context } = createHarness({}, { reorderStorageKeys: true });
  const before = await context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
  const result = await context.YtCdHudSettingsCoordinator.execute({
    action: 'apply', operationId: 'reorder-noop-1', baseRevision: before.snapshot.revision,
    payload: { settings: before.snapshot.settings, layout: before.snapshot.layout },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'STORED');
});

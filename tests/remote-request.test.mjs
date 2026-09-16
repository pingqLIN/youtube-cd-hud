import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const bridge = read('extension/content/gm-xmlhttp-request.js');

function harness(extra = {}) {
  const messages = [];
  const runtime = {
    lastError: undefined,
    sendMessage(message, callback) { messages.push({ message, callback }); },
  };
  const context = { URL, chrome: { runtime }, ...extra };
  vm.runInNewContext(bridge, context);
  return { request: context.GM_xmlhttpRequest, messages, runtime };
}

test('rejects malformed, non-HTTPS and credential URLs before messaging', () => {
  const { request, messages } = harness();
  for (const url of ['', '/relative', 'http://example.com', 'javascript:alert(1)', 'file:///tmp/a', 'https://user:pass@example.com']) {
    let error;
    const handle = request({ url, onerror: result => { error = result; } });
    assert.equal(error.phase, 'validation');
    handle.abort();
  }
  assert.equal(messages.length, 0);
});

test('uses native UUID and preserves HTTP error responses as completed loads', () => {
  const { request, messages } = harness({ crypto: { randomUUID: () => 'native-request-id' } });
  for (const status of [200, 404, 500]) {
    const events = [];
    const handle = request({
      url: 'https://example.com',
      onreadystatechange: result => events.push(result.readyState),
      onload: result => events.push(result.status),
      onerror: () => assert.fail('HTTP response is not a transport error'),
    });
    const { message, callback } = messages.at(-1);
    assert.equal(message.requestId, 'native-request-id');
    callback({ ok: true, status, responseText: 'body' });
    callback({ ok: true, status });
    handle.abort();
    assert.deepEqual(events, [4, status]);
  }
  assert.equal(messages.length, 3);
});

test('abort is idempotent, suppresses late replies and preserves frozen caller options', () => {
  const { request, messages, runtime } = harness();
  const events = [];
  const options = Object.freeze({
    url: 'https://example.com',
    onload: () => assert.fail('late load'),
    onerror: () => assert.fail('late error'),
    onabort: result => events.push(result.phase),
  });
  const handle = request(options);
  const reply = messages[0].callback;
  handle.abort();
  handle.abort();
  runtime.lastError = { message: 'late runtime error' };
  reply(undefined);
  reply({ ok: true, status: 200 });
  assert.deepEqual(events, ['cancelled']);
  assert.equal(typeof options.onload, 'function');
  assert.equal(messages.length, 2);
  assert.equal(messages[1].message.requestId, messages[0].message.requestId);
});

test('maps timeout, missing reply and synchronous transport failure exactly once', () => {
  for (const mode of ['timeout', 'missing', 'throw']) {
    const { request, messages, runtime } = harness();
    const events = [];
    if (mode === 'throw') runtime.sendMessage = () => { throw new Error('Invalidated'); };
    const handle = request({
      url: 'https://example.com',
      ontimeout: () => events.push('timeout'),
      onerror: result => events.push(result.phase),
    });
    if (mode !== 'throw') messages[0].callback(mode === 'timeout' ? { ok: false, timedOut: true } : undefined);
    handle.abort();
    assert.deepEqual(events, [mode === 'timeout' ? 'timeout' : 'message']);
  }
});

test('cancellation still runs when a consumer callback throws', () => {
  const { request, messages } = harness();
  const handle = request({ url: 'https://example.com', onabort() { throw new Error('consumer'); } });
  assert.throws(() => handle.abort(), /consumer/);
  assert.equal(messages[1].message.type, 'YT_CD_HUD_CANCEL_REMOTE_REQUEST');
  handle.abort();
  assert.equal(messages.length, 2);
});

test('stale HUD callbacks preserve active handles before any response processing', () => {
  const source = read('src/youtube-cd-hud.user.js');
  const search = source.slice(source.indexOf('    function fetchTracklistFrom1001('), source.indexOf('\n    function ', source.indexOf('    function fetchTracklistFrom1001(') + 1));
  const prefixes = [...search.matchAll(/on(?:load|error|timeout): function \([^)]*\) \{([\s\S]*?active(?:Search|Tracklist)Request = null;)/g)];
  assert.equal(prefixes.length, 6);
  for (const [, prefix] of prefixes) {
    for (const current of [false, true]) {
      const context = { activeSearchRequest: 'new-search', activeTracklistRequest: 'new-tracklist', isCurrentSearch: () => current };
      vm.runInNewContext(`(function () { ${prefix} })()`, context);
      const field = prefix.includes('activeSearchRequest') ? 'activeSearchRequest' : 'activeTracklistRequest';
      assert.equal(context[field], current ? null : field === 'activeSearchRequest' ? 'new-search' : 'new-tracklist');
    }
  }
});

test('synchronous JSON request failure leaves no pending supplemental request', async () => {
  const source = read('src/youtube-cd-hud.user.js');
  const start = source.indexOf('    function requestJson(');
  const implementation = source.slice(start, source.indexOf('\n    function ', start + 1));
  const context = {
    activeSupplementalRequests: new Set(),
    runtimeSettings: { requestTimeoutMs: 15000 },
    GM_xmlhttpRequest(options) {
      options.onerror({ error: 'Invalidated' });
      return { abort() { assert.fail('already settled'); } };
    },
  };
  vm.runInNewContext(implementation, context);
  await assert.rejects(context.requestJson('https://example.com'), /Invalidated/);
  assert.equal(context.activeSupplementalRequests.size, 0);
});

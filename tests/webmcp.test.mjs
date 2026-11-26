import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';

const read = file => fs.readFileSync(new URL('../extension/options/' + file, import.meta.url), 'utf8');
function setup() {
    const context = {};
    vm.runInNewContext(read('options-agent.js'), context);
    const calls = [];
    const service = Object.fromEntries(['read', 'preview', 'validate', 'requestApply', 'requestUndo', 'slot'].map(name => [name, input => {
        calls.push({ name, input });
        return { status: name === 'requestApply' ? 'AWAITING_USER' : 'DRAFT' };
    }]));
    return { api: context.YtCdHudOptionsAgent, service, calls };
}

test('WebMCP feature absence is explicit and does not register any tool', async () => {
    const app = setup();
    await assert.rejects(app.api.register(undefined, app.service, new AbortController().signal), /WEBMCP_UNAVAILABLE/);
    assert.equal(app.calls.length, 0);
});

test('WebMCP registers six constrained tools with lifecycle cancellation and structured output', async () => {
    const app = setup(), registered = [], controller = new AbortController();
    await app.api.register({ async registerTool(tool, options) { registered.push({ tool, options }); } }, app.service, controller.signal);
    assert.equal(registered.length, 6);
    assert.ok(registered.every(({ tool, options }) => options.signal === controller.signal && tool.inputSchema.additionalProperties === false));
    const apply = registered.find(({ tool }) => tool.name === 'panel_apply').tool;
    const result = await apply.execute({ draftId: 'draft-1' });
    assert.equal(result.status, 'AWAITING_USER');
    assert.equal(result.ok, true);
    const count = app.calls.length;
    controller.abort();
    assert.equal((await apply.execute({}, { signal: controller.signal })).error, 'CANCELLED');
    assert.equal(app.calls.length, count);
});

test('WebMCP maps application errors into explicit failure responses', async () => {
    const app = setup();
    app.service.preview = () => { throw new Error('PANEL_LOCKED'); };
    const tool = app.api.definitions(app.service).find(tool => tool.name === 'panel_preview_patch');
    const result = await tool.execute({});
    assert.equal(result.ok, false);
    assert.equal(result.error, 'PANEL_LOCKED');
});

test('Agent assets load after the editor and before options initialization', () => {
    const loader = read('live-monitor-loader.js');
    assert.ok(loader.indexOf('panel-agent.js') > loader.indexOf('live-monitor-bootstrap.js'));
    assert.ok(loader.indexOf('options-agent.js') < loader.indexOf("src: 'options.js'"));
});

test('domain-enabled failures report isolation and loaded manifest without reading domain or browsing data', () => {
    const context = { location: { protocol: 'chrome-extension:' }, isSecureContext: true,
        originAgentCluster: false, crossOriginIsolated: false,
        chrome: { runtime: { getManifest: () => ({ version: '5.14.0',
            cross_origin_opener_policy: { value: 'same-origin' },
            cross_origin_embedder_policy: { value: 'require-corp' } }) } },
    };
    vm.runInNewContext(read('options-agent.js'), context);
    const failure = context.YtCdHudOptionsAgent.connectionFailure({ name: 'SecurityError',
        message: 'document.modelContext cannot be used when document.domain is enabled.' });
    assert.equal(failure.status, 'WEBMCP_ORIGIN_ISOLATION_REQUIRED');
    assert.equal(failure.environment.originAgentCluster, false);
    assert.equal(failure.environment.crossOriginIsolated, false);
    assert.equal(failure.environment.openerPolicy, 'same-origin');
    assert.equal(failure.environment.embedderPolicy, 'require-corp');
    assert.match(failure.nextAction, /重新載入/);
    const unknown = setup().api.connectionFailure(new Error('NATIVE_CLIENT_UNAVAILABLE'));
    assert.equal(unknown.status, 'WEBMCP_CONNECTION_FAILED');
    assert.equal(unknown.environment.originAgentCluster, null);
    assert.equal(unknown.environment.extensionVersion, null);
});

test('settings UI enables tools, invokes native client API and unregisters on disable', async () => {
    const nodes = new Map(), registered = new Map();
    const find = id => {
        if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', checked: false, handlers: {}, style: {},
            addEventListener(name, callback) { this.handlers[name] = callback; }, replaceChildren() {} });
        return nodes.get(id);
    };
    let nativeCalls = 0;
    const context = { crypto: webcrypto, AbortController, document: { getElementById: find,
        modelContext: {
            async registerTool(tool, { signal }) { registered.set(tool.name, tool); signal.addEventListener('abort', () => registered.delete(tool.name)); },
            async getTools() { return [...registered.values()]; },
            async executeTool(tool, input) { nativeCalls++; return tool.execute(input); },
        },
    } };
    for (const file of ['live-monitor-composer.js', 'panel-agent.js', 'options-agent.js']) vm.runInNewContext(read(file), context);
    const composer = context.YtCdHudLiveMonitorComposer;
    let commits = 0;
    context.YtCdHudOptionsAgent.init({ composer, getLayout: () => composer.createDefaultLayout(), getRevision: () => 'r1',
        commit: () => { commits++; }, slots: {} });
    const enable = find('agent-enable'); enable.checked = true;
    await enable.handlers.change({ target: enable });
    assert.equal(registered.size, 6);
    await find('agent-native-check').handlers.click();
    const result = JSON.parse(find('agent-result').textContent);
    assert.equal(result.status, 'NATIVE_READ_COMPLETED');
    assert.equal(result.response.ok, true);
    assert.equal(result.tools.length, 6);
    assert.equal(nativeCalls, 1);
    assert.equal(commits, 0);
    const execute = context.document.modelContext.executeTool;
    context.document.modelContext.executeTool = async () => ({ ok: false, error: 'CONFLICT' });
    await find('agent-native-check').handlers.click();
    assert.match(find('agent-result').textContent, /NATIVE_READ_INVALID_RESPONSE/);
    context.document.modelContext.executeTool = async (tool, input) => JSON.stringify(await execute(tool, input));
    await find('agent-native-check').handlers.click();
    assert.equal(JSON.parse(find('agent-result').textContent).status, 'NATIVE_READ_COMPLETED');
    registered.delete('panel_slot');
    await find('agent-native-check').handlers.click();
    assert.match(find('agent-result').textContent, /TOOLS_INCOMPLETE/);
    enable.checked = false;
    await enable.handlers.change({ target: enable });
    assert.equal(registered.size, 0);
    const registerTool = context.document.modelContext.registerTool;
    context.document.modelContext.registerTool = async (tool, options) => {
        if (registered.size === 1) throw Object.assign(new Error('document.modelContext cannot be used when document.domain is enabled.'), { name: 'SecurityError' });
        return registerTool(tool, options);
    };
    enable.checked = true;
    await enable.handlers.change({ target: enable });
    assert.equal(enable.checked, false);
    assert.equal(registered.size, 0, 'failed registration removes the already registered tool');
    assert.equal(commits, 0);
    assert.equal(JSON.parse(find('agent-result').textContent).status, 'WEBMCP_ORIGIN_ISOLATION_REQUIRED');
    assert.match(find('agent-connection').textContent, /來源隔離/);
    context.document.modelContext.registerTool = registerTool;
    enable.checked = true;
    await enable.handlers.change({ target: enable });
    assert.equal(registered.size, 6, 'a failed attempt does not leave duplicate tools behind');
    enable.checked = false;
    await enable.handlers.change({ target: enable });
    assert.equal(registered.size, 0);
});

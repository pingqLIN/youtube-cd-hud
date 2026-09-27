import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const exported = JSON.parse(read('tests/fixtures/authored-default-panel.json'));
const legacy = JSON.parse(read('tests/fixtures/legacy-panel-layout.json'));
const plain = value => JSON.parse(JSON.stringify(value));

function composerContext() {
    const context = { console };
    vm.runInNewContext(read('extension/options/live-monitor-composer.js'), context);
    return context;
}

function runtime() {
    const context = { console, URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval,
        __YT_CD_HUD_TEST_MODE__: true };
    context.window = context;
    vm.runInNewContext(read('src/youtube-cd-hud.user.js'), context);
    return context.__YT_CD_HUD_TEST_EXPORTS__;
}

test('new and reset defaults preserve every value in the approved panel export', () => {
    const composer = composerContext().YtCdHudLiveMonitorComposer;
    for (const actual of [composer.createDefaultLayout(), composer.normalizeLayout(null), composer.normalizeLayout(undefined)]) {
        assert.deepEqual(plain(actual), exported.layout);
        assert.equal(composer.connectedToBase(actual, composer.getComponent(actual, 'panel-base')), true);
    }
    const edited = composer.createDefaultLayout();
    edited.components[0].style.opacity = 1;
    assert.equal(composer.createDefaultLayout().components[0].style.opacity, 0.2, 'defaults are independent copies');
    assert.match(read('extension/options/options.js'), /reset-button[\s\S]*currentLayout = composer\.createDefaultLayout\(\)/);
});

test('runtime defaults match the approved panel and preserve existing saved layouts', () => {
    const api = runtime();
    const composer = composerContext().YtCdHudLiveMonitorComposer;
    for (const value of [null, undefined]) {
        assert.deepEqual(plain(api.normalizeHudLayout(value)), exported.layout);
    }
    assert.deepEqual(plain(composer.normalizeLayout(legacy)), legacy);
    assert.deepEqual(plain(api.normalizeHudLayout(legacy)), legacy);
    assert.equal(api.normalizeHudLayout(legacy).placement, undefined);
    assert.equal(composer.normalizeLayout({}).placement, undefined);
    assert.equal(api.normalizeHudLayout({}).placement, undefined);
});

test('built-in preset compositions do not inherit the install defaults placement or styling', () => {
    const context = composerContext();
    vm.runInNewContext(read('extension/options/panel-presets.js'), context);
    const composer = context.YtCdHudLiveMonitorComposer;
    for (const preset of context.YtCdHudPanelPack.presets) {
        const layout = context.YtCdHudPanelPack.create(preset.id, composer);
        assert.equal(layout.placement, undefined);
        assert.equal(layout.locked, false);
        assert.equal(layout.components.find(item => item.id === 'track-title').textStyle.font, 'Segoe UI');
    }
});

test('empty Chrome storage reads the authored default without writing or replacing existing layout', async () => {
    const context = composerContext();
    const stored = {};
    let writes = 0;
    Object.assign(context, { crypto: webcrypto, TextEncoder, chrome: { storage: { local: {
        async get(keys) { return Object.fromEntries(keys.map(key => [key, stored[key]])); },
        async set(values) { writes++; Object.assign(stored, values); },
    } } } });
    vm.runInNewContext(read('extension/shared/settings.js'), context);
    vm.runInNewContext(read('extension/shared/settings-coordinator.js'), context);
    const fresh = await context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
    assert.equal(fresh.ok, true);
    assert.deepEqual(plain(fresh.snapshot.layout), exported.layout);
    assert.equal(writes, 0);
    stored.ytCdHudLayoutV2 = plain(legacy);
    const existing = await context.YtCdHudSettingsCoordinator.execute({ action: 'read' });
    assert.deepEqual(plain(existing.snapshot.layout), legacy);
    assert.equal(writes, 0);
});

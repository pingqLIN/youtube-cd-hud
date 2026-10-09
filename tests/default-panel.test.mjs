import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const exported = JSON.parse(read('tests/fixtures/authored-default-panel.json'));
const legacy = JSON.parse(read('tests/fixtures/legacy-panel-layout.json'));
const legacyProjection = value => { const result=JSON.parse(JSON.stringify(value)); for(const role of ['volume-control','agent-tools','system-status']) { const c=result.components?.find(x=>x.id===role); if(c) assert.equal(c.present,false,role+' must remain absent'); } if(result.components) result.components=result.components.filter(x=>!['volume-control','agent-tools','system-status'].includes(x.id)); return result; };
const plain = legacyProjection;

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

test('YtCdHudPanelPack new preset ids satisfy purpose-axis constraints', () => {
    const context = composerContext();
    vm.runInNewContext(read('extension/options/panel-presets.js'), context);
    const composer = context.YtCdHudLiveMonitorComposer;
    const pack = context.YtCdHudPanelPack;

    // All presets (including new ones): baseline contract
    for (const preset of pack.presets) {
        const layout = pack.create(preset.id, composer);
        assert.equal(layout.placement, undefined, preset.id + ' placement');
        assert.equal(layout.locked, false, preset.id + ' locked');
        assert.equal(composer.connectedToBase(layout, composer.getComponent(layout, 'panel-base')), true,
            preset.id + ' connectedToBase');
        assert.equal(composer.getComponent(layout, 'track-title').textStyle.font, 'Segoe UI',
            preset.id + ' track-title font');
    }

    // Purpose A — ambient-quiet: no tracklist-panel, no source-selector; base opacity ≤ 0.45
    for (const id of ['ambient-quiet']) {
        const layout = pack.create(id, composer);
        assert.equal(composer.getComponent(layout, 'tracklist-panel').present, false, id + ' tracklist absent');
        assert.equal(composer.getComponent(layout, 'source-selector').present,    false, id + ' source absent');
        assert.ok(composer.getComponent(layout, 'panel-base').style.opacity <= 0.45,
            id + ' base opacity ≤ 0.45');
    }

    // Purpose B — crate-ledger: tracklist-panel present, source-selector present
    for (const id of ['crate-ledger']) {
        const layout = pack.create(id, composer);
        assert.equal(composer.getComponent(layout, 'tracklist-panel').present, true, id + ' tracklist present');
        assert.equal(composer.getComponent(layout, 'source-selector').present,  true, id + ' source present');
    }

    // Purpose C — shop-poster: disc ≥ 160 px, title fontSize ≥ 28
    for (const id of ['shop-poster']) {
        const layout = pack.create(id, composer);
        const disc  = composer.getComponent(layout, 'disc');
        const title = composer.getComponent(layout, 'track-title');
        assert.ok(disc.present, id + ' disc present');
        assert.ok(disc.geometry.width  >= 160, id + ' disc width ≥ 160 (' + disc.geometry.width + ')');
        assert.ok(disc.geometry.height >= 160, id + ' disc height ≥ 160 (' + disc.geometry.height + ')');
        assert.ok(title.textStyle.fontSize >= 28, id + ' title fontSize ≥ 28 (' + title.textStyle.fontSize + ')');
    }
});

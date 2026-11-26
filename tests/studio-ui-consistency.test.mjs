import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = relative => fs.readFileSync(new URL('../' + relative, import.meta.url), 'utf8');
function makeApis() {
    const context = { console };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('extension/options/live-monitor-composer.js'), context);
    vm.runInContext(read('extension/options/live-monitor-resize-engine.js'), context);
    vm.runInContext(read('extension/options/panel-presets.js'), context);
    return context;
}

test('minimum-sized text stays fixed while another component continues shrinking', () => {
    const c = makeApis();
    const composer = c.YtCdHudLiveMonitorComposer;
    const layout = composer.createDefaultLayout();
    layout.locked = false;
    layout.canvas.alignmentGrid.enabled = false;
    for (const item of layout.components) {
        item.locked = false;
        if (item.id !== 'panel-base') item.present = ['track-title', 'time-readout'].includes(item.id);
    }
    const base = composer.getComponent(layout, 'panel-base');
    base.geometry = { ...base.geometry, x: .5, y: .5, width: 620, height: 320 };
    const title = composer.getComponent(layout, 'track-title');
    title.geometry = { ...title.geometry, x: .40, y: .5, width: 240, height: 48 };
    title.textStyle.fontSize = 9;
    const time = composer.getComponent(layout, 'time-readout');
    time.geometry = { ...time.geometry, x: .58, y: .5, width: 90, height: 24 };
    time.textStyle.fontSize = 9;
    const normalized = composer.normalizeLayout(layout);
    const beforeTime = structuredClone(composer.getComponent(normalized, 'time-readout').geometry);
    const beforeTitle = structuredClone(composer.getComponent(normalized, 'track-title').geometry);
    const result = c.YtCdHudLiveMonitorResizeEngine.scaleGroup(normalized, .7, ['track-title', 'time-readout']);
    assert.equal(result.updated, true, result.reason);
    assert.ok(result.clampedIds.includes('time-readout'));
    assert.ok(result.scaledIds.includes('track-title'));
    assert.deepEqual(structuredClone(composer.getComponent(result.layout, 'time-readout').geometry), beforeTime);
    assert.ok(composer.getComponent(result.layout, 'track-title').geometry.width < beforeTitle.width);
    assert.equal(composer.collisionFor(composer.getComponent(result.layout, 'track-title'), result.layout.components, result.layout.canvas), null);
    assert.ok(composer.connectedToBase(result.layout, composer.getComponent(result.layout, 'panel-base')));
});

test('optional Studio controls honor common layout CSS and accurately distinguish mock from live actions', () => {
    const html = read('extension/options/options.html');
    const css = read('extension/options/options.css');
    for (const role of ['volume-control', 'agent-tools', 'system-status']) {
        assert.match(html, new RegExp('data-lm-component="' + role + '"'));
        assert.ok(html.includes('class="optional-unit-heading"'));
    }
    assert.match(css, /\.preview-optional-control\.preview-volume\s*\{\s*position:\s*absolute/);
    assert.match(html, /尚未連線/);
    assert.match(html, /網路：未驗證/);
    assert.match(html, /預覽不控制 YouTube/);
});

test('panel-wide font scale has a relative range and does not claim to unify different font sizes', () => {
    const html = read('extension/options/options.html');
    const js = read('extension/options/options.js');
    assert.match(html, /id="theme-font-size" type="range" min="50" max="200" step="1" value="100"/);
    assert.match(js, /Math\.round\(baseline \* factor \* 10\)/);
    assert.match(js, /component\.present === false/);
    assert.match(js, /typographySlider\.disabled = false/);
    assert.doesNotMatch(js, /混合字級；調整後統一文字大小/);
});

test('CDJ has an explicit visible user-facing mode name without changing its internal identifier', () => {
    const c = makeApis();
    const entry = c.YtCdHudPanelPack.presets.find(item => item.id === 'cdj-inspired');
    assert.equal(entry.label, '動態唱盤 · CDJ');
    assert.equal(entry.optIn, true);
});

test('all-scope shrink keeps a minimum-width base unchanged and shrinks other eligible elements', () => {
    const c = makeApis();
    const co = c.YtCdHudLiveMonitorComposer;
    const layout = co.createDefaultLayout();
    layout.locked = false;
    layout.canvas.alignmentGrid.enabled = false;
    for (const item of layout.components) {
        item.locked = false;
        if (item.id !== 'panel-base') item.present = ['track-title', 'time-readout'].includes(item.id);
    }
    const base = co.getComponent(layout, 'panel-base');
    base.geometry = { ...base.geometry, x: .5, y: .5, width: 320, height: 280 };
    const title = co.getComponent(layout, 'track-title');
    title.geometry = { ...title.geometry, x: .5, y: .43, width: 220, height: 48 };
    title.textStyle.fontSize = 9;
    const time = co.getComponent(layout, 'time-readout');
    time.geometry = { ...time.geometry, x: .5, y: .58, width: 90, height: 24 };
    time.textStyle.fontSize = 9;
    const original = co.normalizeLayout(layout);
    const beforeBase = structuredClone(co.getComponent(original, 'panel-base').geometry);
    const beforeTime = structuredClone(co.getComponent(original, 'time-readout').geometry);
    const beforeTitle = structuredClone(co.getComponent(original, 'track-title').geometry);
    const result = c.YtCdHudLiveMonitorResizeEngine.scaleGroup(original, .8);
    assert.equal(result.updated, true, result.reason);
    assert.ok(result.clampedIds.includes('panel-base'));
    assert.ok(result.clampedIds.includes('time-readout'));
    assert.ok(result.scaledIds.includes('track-title'));
    assert.deepEqual(structuredClone(co.getComponent(result.layout, 'panel-base').geometry), beforeBase);
    assert.deepEqual(structuredClone(co.getComponent(result.layout, 'time-readout').geometry), beforeTime);
    assert.ok(co.getComponent(result.layout, 'track-title').geometry.width < beforeTitle.width);
});

test('new optional roles inherit the shared Skin palette and typography defaults', () => {
    const c = makeApis();
    const co = c.YtCdHudLiveMonitorComposer;
    for (const id of ['volume-control', 'agent-tools', 'system-status']) {
        const component = co.getComponent(co.createDefaultLayout(), id);
        assert.equal(component.style.backgroundColor, co.PALETTE_DEFAULTS.primaryColor, id);
        assert.equal(component.textStyle.color, co.PALETTE_DEFAULTS.secondaryColor, id);
        assert.equal(component.textStyle.font, 'cascadia-mono', id);
    }
});

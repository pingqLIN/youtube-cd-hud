import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

function mockLayoutHost(composer, storage) {
  return {
    async read() { return { revision:'test-base',layout:storage[composer.STORAGE_KEY] }; },
    async apply({baseRevision,payload}) {
      assert.equal(baseRevision,'test-base');
      storage[composer.STORAGE_KEY]=JSON.parse(JSON.stringify(payload.layout));
      return {ok:true,status:'STORED',snapshot:{revision:'test-next',layout:storage[composer.STORAGE_KEY]}};
    },
  };
}

function loadResizeEngine(composer) {
  const context = { YtCdHudLiveMonitorComposer: composer };
  vm.runInNewContext(read('extension/options/live-monitor-resize-engine.js'), context);
  return context.YtCdHudLiveMonitorResizeEngine;
}

test('scale controls invoke the real editor, undo atomically, and preserve intervening edits', async () => {
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.listeners = {};
      this.classList = { add() {}, toggle() {} }; this.style = { setProperty() {} };
    }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.append(item); return item; }
    replaceChildren(...items) { this.children = items; }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    querySelectorAll() { return []; }
    checkValidity() { return Number(this.value) >= Number(this.min) && Number(this.value) <= Number(this.max); }
    reportValidity() { this.invalidReported = true; }
  }
  const composer = loadComposer();
  const footer = new Element('span');
  const hudFont = { disabled: false };
  const generalControls = ['settings-font-size', 'interface-theme', 'enableYouTube', 'enableCache', 'clear-cache', 'reload-settings', 'save'].map(id => ({ id, disabled: false }));
  const studio = { querySelectorAll: () => [hudFont] };
  const document = { createElement: tag => new Element(tag), getElementById: id => id === 'live-monitor-panel-lock' ? footer : id === 'panel-studio' ? studio : null,
    querySelectorAll() { throw Error('Panel lock must not query controls across the settings page'); }, documentElement: { lang: 'en' } };
  const context = { document, YtCdHudLiveMonitorComposer: composer, YtCdHudLiveMonitorResizeEngine: loadResizeEngine(composer) };
  vm.runInNewContext(read('extension/options/live-monitor-canvas-editor.js'), context);
  const changes = [];
  const onChange = (_layout, reason) => changes.push(reason);
  const editor = context.YtCdHudLiveMonitorCanvasEditor.createEditor({ preview: new Element('div'), layout: legacyLayout(composer), onChange });
  const original = JSON.stringify(editor.getLayout());
  const presets = loadLayoutPresets(composer, { document });
  const controls = presets.createControls({ host: new Element('div'), editor, onChange });
  await controls.render();
  assert.equal(footer.children.length, 1);
  assert.match(footer.children[0].textContent, /LOCK/);
  assert.equal(controls.element.children.includes(footer.children[0]), false);
  footer.children[0].listeners.click(); controls.sync();
  assert.equal(editor.state.layout.locked, true);
  assert.equal(hudFont.disabled, true);
  assert.ok(generalControls.every(control => control.disabled === false));
  footer.children[0].listeners.click(); controls.sync();
  assert.equal(editor.state.layout.locked, false);
  assert.equal(hudFont.disabled, false);

  const extra = controls.element.children.find(element => element.className === 'lm-layout-extra');
  const pack = extra.children.find(element => element.className === 'lm-layout-pack');
  const [scope, scale, apply, undo] = pack.children;
  scope.value = 'all'; scale.value = '110';
  apply.listeners.click();
  assert.equal(changes.at(-1), 'group-scale');
  assert.notEqual(JSON.stringify(editor.getLayout()), original);
  assert.equal(scale.value, '100');
  assert.equal(undo.disabled, false);
  undo.listeners.click();
  assert.equal(changes.at(-1), 'group-scale-undo');
  assert.equal(JSON.stringify(editor.getLayout()), original);
  assert.equal(undo.disabled, true);
  scale.value = '0'; apply.listeners.click();
  assert.equal(scale.invalidReported, true);
  assert.equal(JSON.stringify(editor.getLayout()), original);
  editor.select('track-title'); scope.value = 'selected'; scale.value = '75'; apply.listeners.click();
  assert.equal(editor.state.selected, 'track-title');
  assert.equal(composer.getComponent(editor.state.layout, 'track-title').geometry.height, 36);
  editor.updatePalette({ primaryColor: '#123456' });
  const edited = JSON.stringify(editor.getLayout());
  undo.listeners.click();
  assert.equal(JSON.stringify(editor.getLayout()), edited);
  assert.equal(undo.disabled, true);
  footer.children[0].listeners.click(); controls.sync();
  assert.equal(editor.state.layout.locked, true);
  assert.equal(footer.children[0].dataset.lmLockState, 'true');
  assert.match(footer.children[0].textContent, /UNLOCK/);

  // Collision recovery goes through the same SCALE and UNDO controls.
  const colliding = legacyLayout(composer);
  colliding.canvas.alignmentGrid.enabled = false;
  colliding.components.forEach(item => { if (item.id !== 'panel-base') item.present = ['track-title', 'time-readout'].includes(item.id); });
  const title = composer.getComponent(colliding, 'track-title');
  const time = composer.getComponent(colliding, 'time-readout');
  title.geometry = { ...title.geometry, x: .4, y: .5, width: 200, height: 48 };
  time.geometry = { ...time.geometry, x: .53, y: .5, width: 100, height: 48 };
  time.locked = true;
  editor.setLayout(colliding); editor.select('track-title');
  const beforeCollision = JSON.stringify(editor.getLayout());
  const neighbor = JSON.stringify(composer.getComponent(editor.getLayout(), 'time-readout'));
  let accepted = false;
  const prompts = [];
  context.confirm = message => { prompts.push(message); return accepted; };
  scope.value = 'selected'; scale.value = '120'; apply.listeners.click();
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /Z 軸/);
  assert.equal(JSON.stringify(editor.getLayout()), beforeCollision, 'cancel never changes geometry or layers');
  accepted = true; apply.listeners.click();
  assert.equal(prompts.length, 2);
  const layered = editor.getLayout();
  const enlarged = composer.getComponent(layered, 'track-title');
  assert.equal(enlarged.geometry.width, 240);
  assert.equal(enlarged.layer.enabled, true);
  assert.equal(composer.collisionFor(enlarged, layered.components, layered.canvas), null);
  assert.equal(JSON.stringify(composer.getComponent(layered, 'time-readout')), neighbor, 'locked neighbor is untouched');
  assert.equal(undo.disabled, false);
  undo.listeners.click();
  assert.equal(JSON.stringify(editor.getLayout()), beforeCollision, 'undo restores both scale and Z allocation');
  scale.value = '1'; apply.listeners.click();
  assert.equal(prompts.length, 2, 'size-limit failures do not offer Z allocation');
  assert.equal(JSON.stringify(editor.getLayout()), beforeCollision);
});

test('cross-layer groups retain layer order and selected scaling detects collisions', () => {
  const composer = loadComposer();
  const layout = legacyLayout(composer);
  layout.canvas.alignmentGrid.enabled = false;
  layout.components.forEach(item => { if (item.id !== 'panel-base') item.present = ['track-title', 'time-readout'].includes(item.id); });
  const title = composer.getComponent(layout, 'track-title');
  const time = composer.getComponent(layout, 'time-readout');
  title.geometry = { ...title.geometry, x: .4, y: .5, width: 200, height: 48 };
  time.geometry = { ...time.geometry, x: .53, y: .5, width: 100, height: 48 };
  const engine = loadResizeEngine(composer);
  const failed = engine.scaleGroup(layout, 1.2, ['track-title']);
  assert.equal(failed.updated, false);
  assert.match(failed.reason, /collide/);
  time.geometry.x = .4;
  time.layer.enabled = true;
  time.geometry.z = 1;
  const normalized = composer.normalizeLayout(layout);
  assert.equal(composer.overlapGroupFor(normalized, 'track-title').length, 0);
  const group = composer.overlapGroupFor(normalized, 'track-title', false).map(item => item.id);
  assert.deepEqual(Array.from(group).sort(), ['time-readout', 'track-title']);
  const result = engine.scaleGroup(normalized, 1.1, group);
  assert.equal(result.updated, true, result.reason);
  assert.equal(composer.getComponent(result.layout, 'time-readout').geometry.z, 1);
});

test('new and legacy layouts use fixed pixel controls', () => {
  const composer = loadComposer();
  assert.equal(legacyLayout(composer).canvas.sizingMode, 'absolute');
  assert.equal(legacyLayout(composer).canvas.width, 1280);
  assert.equal(legacyLayout(composer).canvas.height, 720);
  assert.equal(loadRuntimeLayoutNormalizer()(null).canvas.sizingMode, 'absolute');
  const legacy = { version: 2, canvas: { width: 1920, height: 1080, alignmentGrid: { enabled: false } }, components: [{ id: 'track-title', geometry: { x: .5, y: .5, width: 400, height: 50 } }] };
  for (const normalize of [composer.normalizeLayout, loadRuntimeLayoutNormalizer()]) {
    const result = normalize(legacy);
    assert.equal(result.canvas.sizingMode, 'absolute');
    assert.equal(result.components.find(item => item.id === 'track-title').geometry.width, 400);
    assert.equal(result.components.find(item => item.id === 'track-title').geometry.height, 50);
    assert.deepEqual(JSON.parse(JSON.stringify(normalize(result))), JSON.parse(JSON.stringify(result)));
  }
});

test('compact height floors agree between editor and runtime and still contain text', () => {
  const composer = loadComposer();
  const runtime = loadRuntimeLayoutNormalizer();
  for (const [id, height] of Object.entries({ 'panel-base': 24, disc: 24, 'track-title': 24, 'time-readout': 24, 'source-selector': 24, 'transport-controls': 24, 'close-control': 24, 'tracklist-toggle': 24, 'text-size-control': 24, 'tracklist-panel': 48 })) {
    const source = legacyLayout(composer);
    source.canvas.alignmentGrid.enabled = false;
    source.components.forEach(item => { if (item.id !== 'panel-base') item.present = item.id === id; });
    const item = composer.getComponent(source, id);
    if (item.textStyle) item.textStyle.fontSize = 12;
    source.manualBase = true;
    item.geometry = { ...item.geometry, x: .5, y: .5, height };
    const normalized = composer.normalizeLayout(source);
    const actual = composer.getComponent(normalized, id);
    assert.equal(actual.geometry.height, height, id);
    assert.equal(runtime(normalized).components.find(item => item.id === id).geometry.height, height, id + ' runtime');
    if (actual.textStyle) assert.ok(height >= actual.textStyle.fontSize * 1.35 + 4, id + ' text fits');
  }
});

test('group scaling preserves relative centers, aspect ratios, layers and saved geometry', () => {
  const composer = loadComposer();
  const engine = loadResizeEngine(composer);
  const layout = legacyLayout(composer);
  const before = JSON.stringify(layout);
  const result = engine.scaleGroup(layout, 1.1);
  assert.equal(result.updated, true, result.reason);
  assert.equal(JSON.stringify(layout), before, 'input is not mutated');
  assert.equal(result.layout.canvas.alignmentGrid.enabled, false);
  const first = composer.getComponent(layout, 'track-title');
  const firstScaled = composer.getComponent(result.layout, 'track-title');
  for (const component of layout.components.filter(item => item.present && item.id !== 'panel-base')) {
    const scaled = composer.getComponent(result.layout, component.id);
    assert.ok(Math.abs(scaled.geometry.width / component.geometry.width - 1.1) < 1e-9);
    assert.ok(Math.abs(scaled.geometry.height / component.geometry.height - 1.1) < 1e-9);
    assert.ok(Math.abs((scaled.geometry.x - firstScaled.geometry.x) - (component.geometry.x - first.geometry.x) * 1.1) < 1e-9);
    assert.ok(Math.abs((scaled.geometry.y - firstScaled.geometry.y) - (component.geometry.y - first.geometry.y) * 1.1) < 1e-9);
    assert.deepEqual(scaled.layer, component.layer);
    assert.equal(scaled.geometry.z, component.geometry.z);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(composer.normalizeLayout(result.layout))), JSON.parse(JSON.stringify(result.layout)));
  const runtime = loadRuntimeLayoutNormalizer()(result.layout);
  for (const component of result.layout.components) assert.deepEqual(JSON.parse(JSON.stringify(runtime.components.find(item => item.id === component.id).geometry)), JSON.parse(JSON.stringify(component.geometry)), component.id);
});

test('group shrink supports selected units and rejects invalid scales atomically', () => {
  const composer = loadComposer();
  const engine = loadResizeEngine(composer);
  const layout = legacyLayout(composer);
  const result = engine.scaleGroup(layout, .75, ['track-title']);
  assert.equal(result.updated, true, result.reason);
  assert.equal(composer.getComponent(result.layout, 'track-title').geometry.width, composer.getComponent(layout, 'track-title').geometry.width * .75);
  assert.deepEqual(JSON.parse(JSON.stringify(composer.getComponent(result.layout, 'time-readout'))), JSON.parse(JSON.stringify(composer.getComponent(layout, 'time-readout'))));
  for (const factor of [0, -1, NaN, Infinity, 5, .01, 4]) {
    const failed = engine.scaleGroup(layout, factor);
    assert.equal(failed.updated, false, String(factor));
    assert.deepEqual(JSON.parse(JSON.stringify(failed.layout)), JSON.parse(JSON.stringify(layout)));
  }
  assert.equal(engine.scaleGroup(layout, 1.1, []).updated, false);
});

test('split transport positions scale with the group and round trip into runtime', () => {
  const composer = loadComposer();
  const engine = loadResizeEngine(composer);
  const source = legacyLayout(composer);
  source.components.forEach(item => { if (item.id !== 'panel-base') item.present = item.id === 'transport-controls'; });
  const transport = composer.getComponent(source, 'transport-controls');
  transport.arrangement.split = true;
  const layout = composer.normalizeLayout(source);
  const result = engine.scaleGroup(layout, 1.25);
  assert.equal(result.updated, true, result.reason);
  const actual = composer.getComponent(result.layout, 'transport-controls');
  const original = composer.getComponent(layout, 'transport-controls');
  assert.equal(actual.arrangement.split, true);
  assert.equal(actual.arrangement.partSize.width, original.arrangement.partSize.width * 1.25);
  assert.ok(Math.abs((actual.arrangement.positions.next.x - actual.arrangement.positions.previous.x) - (original.arrangement.positions.next.x - original.arrangement.positions.previous.x) * 1.25) < 1e-9);
  const runtime = loadRuntimeLayoutNormalizer()(result.layout).components.find(item => item.id === 'transport-controls');
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.arrangement)), JSON.parse(JSON.stringify(actual.arrangement)));
});

// Geometry and interaction regressions use an explicit legacy fixture, independent of the product preset.
function legacyLayout(composer) {
  return composer.normalizeLayout(JSON.parse(read('tests/fixtures/legacy-panel-layout.json')));
}

function loadComposer() {
  const context = { console, Object, JSON, Number, Math, Set, Map };
  vm.runInNewContext(read('extension/options/live-monitor-composer.js'), context);
  return context.YtCdHudLiveMonitorComposer;
}

function loadRuntimeTestApi(overrides = {}, instrumentGestures = false) {
  const sandbox = {
    URL,
    URLSearchParams,
    Document: class Document { static parseHTML() { return {}; } },
    DOMParser: class DOMParser { parseFromString() { return {}; } },
    __YT_CD_HUD_TEST_MODE__: true,
    clearInterval,
    clearTimeout,
    console,
    setInterval,
    setTimeout,
  };
  Object.assign(sandbox, overrides);
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const source = read('src/youtube-cd-hud.user.js');
  const evaluated = instrumentGestures ? source.replace('            projectHudLayout,', '            projectHudLayout, translateRuntimeAssembly, bindRuntimeLayoutUnitDragging, getRuntimeLayout: () => runtimeLayout, setRuntimeLayout: value => { runtimeLayout = normalizeHudLayout(value); },') : source;
  vm.runInContext(evaluated, sandbox);
  return sandbox.__YT_CD_HUD_TEST_EXPORTS__;
}

function loadRuntimeLayoutNormalizer() {
  return loadRuntimeTestApi().normalizeHudLayout;
}

function loadLayoutPresets(composer, overrides = {}) {
  const state = {};
  const context = {
    console,
    YtCdHudLiveMonitorComposer: composer,
    chrome: { storage: { local: {
      async get(key) { return { [key]: state[key] }; },
      async set(value) { Object.assign(state, value); },
    } } },
    ...overrides,
  };
  vm.runInNewContext(read('extension/options/panel-presets.js'), context);
  vm.runInNewContext(read('extension/options/live-monitor-layout-presets.js'), context);
  return context.YtCdHudLiveMonitorLayoutPresets;
}

test('migrates v1 layouts into the bounded v2 component schema', () => {
  const composer = loadComposer();
  const layout = composer.normalizeLayout({
    version: 1,
    components: [
      { id: 'hud-root', width: 560, height: 150, style: { opacity: .7 } },
      { id: 'track-info', x: .58, y: .5, width: 390, height: 100, style: { color: '#ABCDEF', unknown: 'drop' } },
      { id: 'disc', x: -2, y: 2, scale: 99, style: { opacity: 4, unknown: 'drop' } },
      { id: 'source-badge', x: .67, y: .68, width: 170, height: 28 },
      { id: 'not-real', x: .2 },
    ],
  });
  assert.equal(layout.version, 2);
  assert.equal(composer.STORAGE_KEY, 'ytCdHudLayoutV2');
  assert.equal(composer.LEGACY_STORAGE_KEY, 'ytCdHudLayoutV1');
  assert.deepEqual(JSON.parse(JSON.stringify(layout.components.map(component => component.id))), [
    'panel-base', 'disc', 'track-title', 'time-readout', 'source-selector',
    'tracklist-toggle', 'transport-controls', 'close-control', 'text-size-control', 'tracklist-panel',
  ]);
  const disc = composer.getComponent(layout, 'disc');
  assert.equal(disc.geometry.width, 720);
  assert.equal(disc.geometry.z, 1);
  assert.equal(disc.layer.enabled, true);
  assert.equal('boundary' in disc, false);
  assert.equal(disc.style.opacity, 1);
  assert.equal('unknown' in disc.style, false);
  assert.equal(composer.getComponent(layout, 'track-title').textStyle.color, '#abcdef');
  assert.equal(composer.getComponent(layout, 'tracklist-panel').present, false);
});

test('stores every unit with structured geometry, layer, style, effects, and applicable boundaries', () => {
  const composer = loadComposer();
  const layout = legacyLayout(composer);
  assert.equal(layout.canvas.collisionPolicy, 'no-overlap-closed');
  assert.deepEqual(JSON.parse(JSON.stringify(layout.canvas.alignmentGrid)), { enabled: true, unitWidth: 8, unitHeight: 8, visible: false });
  for (const component of layout.components) {
    assert.equal(typeof component.geometry, 'object');
    assert.equal(typeof component.layer.enabled, 'boolean');
    if (component.id === 'disc') assert.equal('boundary' in component, false);
    else assert.equal(component.boundary.state, 'closed');
    assert.equal(typeof component.style, 'object');
    assert.equal(typeof component.style.borderEnabled, 'boolean');
    assert.equal(typeof component.style.cornerEnabled, 'boolean');
    assert.ok(component.style.cornerRadiusLevel >= 1 && component.style.cornerRadiusLevel <= 10);
    assert.equal(typeof component.style.backgroundBlurEnabled, 'boolean');
    assert.equal(typeof component.effects, 'object');
    assert.equal(Number.isFinite(component.geometry.z), true);
  }
  const base = composer.getComponent(layout, 'panel-base');
  assert.equal(base.boundary.mode, 'dynamic-envelope');
  assert.equal(base.boundary.collision, false);
  assert.equal(base.geometry.z, -1);
  assert.equal(composer.getComponent(layout, 'disc').geometry.z, 1);
  for (const component of layout.components.filter(item => !['panel-base', 'disc'].includes(item.id))) {
    assert.equal(component.layer.enabled, false);
    assert.equal(component.geometry.z, 0);
  }
});

test('snaps moved and resized units to the hidden minimum alignment grid', () => {
  const composer = loadComposer();
  const layout = legacyLayout(composer);
  const title = composer.getComponent(layout, 'track-title');
  const snapped = composer.canPlace(layout, 'track-title', { ...title.geometry, x: .5031, y: .4027, width: 333, height: 37, z: 0 });
  assert.equal(snapped.valid, true);
  assert.equal((snapped.geometry.x * layout.canvas.width) % 8, 0);
  assert.equal((snapped.geometry.y * layout.canvas.height) % 8, 0);
  assert.equal(snapped.geometry.width % 8, 0);
  assert.equal(snapped.geometry.height % 8, 0);
  const free = composer.updateAlignment(layout, false);
  const unsnapped = composer.canPlace(free, 'track-title', { ...composer.getComponent(free, 'track-title').geometry, x: .5031, y: .4027, width: 333, height: 37, z: 0 });
  assert.equal(unsnapped.valid, true);
  assert.notEqual((unsnapped.geometry.x * free.canvas.width) % 8, 0);
  assert.equal(free.canvas.alignmentGrid.visible, false);
});

test('enforces closed-state non-overlap and canvas bounds', () => {
  const composer = loadComposer();
  const layout = legacyLayout(composer);
  const visible = layout.components.filter(component => component.present && component.boundary?.collision);
  for (const component of visible) assert.equal(composer.collisionFor(component, layout.components, layout.canvas), null);
  const disc = composer.getComponent(layout, 'disc');
  const title = composer.getComponent(layout, 'track-title');
  const time = composer.getComponent(layout, 'time-readout');
  assert.equal(composer.canPlace(layout, 'disc', { ...disc.geometry, x: title.geometry.x, y: title.geometry.y }).valid, true);
  const collision = composer.canPlace(layout, 'track-title', { ...title.geometry, x: time.geometry.x, y: time.geometry.y });
  assert.equal(collision.valid, false);
  assert.equal(collision.collisionWith, 'time-readout');
  const layered = composer.updateLayer(layout, 'track-title', { enabled: true, z: 1 });
  assert.equal(layered.updated, true);
  const layeredTitle = composer.getComponent(layered.layout, 'track-title');
  assert.equal(composer.canPlace(layered.layout, 'track-title', { ...layeredTitle.geometry, x: time.geometry.x, y: time.geometry.y }).valid, true);
  assert.deepEqual(JSON.parse(JSON.stringify(composer.clampSize('disc', 1, 9999))), { width: 24, height: 720 });
  const overflowDisc = composer.fitGeometry('disc', { ...disc.geometry, x: -.25, y: 1.25, width: 240, height: 240 }, layout.canvas, disc.layer);
  assert.equal(overflowDisc.x, 0);
  assert.equal(overflowDisc.y, 1);
  assert.ok(composer.componentRect(overflowDisc, layout.canvas).left < 0);
  const boundedTitle = composer.fitGeometry('track-title', { ...title.geometry, x: -.25, y: 1.25 }, layout.canvas, title.layer);
  assert.ok(composer.componentRect(boundedTitle, layout.canvas).left >= 0);
  assert.ok(composer.componentRect(boundedTitle, layout.canvas).bottom <= layout.canvas.height);
});

test('resolves a released drag conflict with layers or removes the complete conflict group', () => {
  const composer = loadComposer();
  const layout = legacyLayout(composer);
  const title = composer.getComponent(layout, 'track-title');
  const time = composer.getComponent(layout, 'time-readout');
  title.geometry = { ...title.geometry, x: time.geometry.x, y: time.geometry.y };
  assert.deepEqual(JSON.parse(JSON.stringify(composer.overlapGroupFor(layout, 'track-title').map(component => component.id).sort())), ['time-readout', 'track-title']);
  const optimized = composer.optimizeOverlapLayers(layout, 'track-title');
  assert.equal(optimized.optimized, true);
  const optimizedTitle = composer.getComponent(optimized.layout, 'track-title');
  const optimizedTime = composer.getComponent(optimized.layout, 'time-readout');
  assert.equal(optimizedTitle.layer.enabled, true);
  assert.equal(optimizedTime.layer.enabled, true);
  assert.ok(optimizedTitle.geometry.z > optimizedTime.geometry.z);
  assert.equal(composer.collisionFor(optimizedTitle, optimized.layout.components, optimized.layout.canvas), null);
  const removed = composer.removeOverlapGroup(layout, 'track-title');
  assert.equal(removed.removed, true);
  assert.equal(composer.getComponent(removed.layout, 'track-title').present, false);
  assert.equal(composer.getComponent(removed.layout, 'time-readout').present, false);
});

test('keeps numbered layouts in local storage and normalizes restored data', async () => {
  const composer = loadComposer();
  const presets = loadLayoutPresets(composer);
  const layout = legacyLayout(composer);
  composer.getComponent(layout, 'track-title').style.opacity = .55;
  await presets.writeSlots({ '7': layout, ignored: layout });
  const slots = await presets.readSlots();
  assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(slots))), ['0', '1', '2', '3', '7']);
  assert.equal(composer.getComponent(slots['7'], 'track-title').style.opacity, .55);
  assert.equal(presets.STORAGE_KEY, 'ytCdHudLayoutSlotsV2');
});

test('ships three fresh built-in panels without relying on session slots', async () => {
  const composer = loadComposer();
  const presets = loadLayoutPresets(composer);
  assert.deepEqual([...presets.BUNDLED_PRESETS].map(preset => preset.id), ['full', 'compact', 'invisible']);
  assert.deepEqual(Object.keys(await presets.readSlots()), ['0', '1', '2', '3']);
  assert.equal(presets.createBundledLayout('unknown'), null);
  const compact = presets.createBundledLayout('compact');
  const reader = presets.createBundledLayout('full');
  assert.equal(composer.getComponent(compact, 'tracklist-panel').present, false);
  assert.equal(composer.getComponent(reader, 'tracklist-panel').present, true);
  assert.ok(composer.getComponent(compact, 'panel-base').geometry.width < composer.getComponent(reader, 'panel-base').geometry.width);
  assert.ok(composer.getComponent(reader, 'track-title').textStyle.fontSize > composer.getComponent(compact, 'track-title').textStyle.fontSize);
  composer.getComponent(compact, 'track-title').textStyle.fontSize = 99;
  await presets.writeSlots({ '7': compact });
  assert.equal(composer.getComponent(presets.createBundledLayout('compact'), 'track-title').textStyle.fontSize, 18);
  const nextSession = loadLayoutPresets(composer);
  assert.deepEqual(Object.keys(await nextSession.readSlots()), ['0', '1', '2', '3']);
  assert.deepEqual(JSON.parse(JSON.stringify(nextSession.createBundledLayout('full'))), JSON.parse(JSON.stringify(reader)));
});

test('built-in panels survive storage and runtime normalization with usable geometry', async () => {
  const composer = loadComposer();
  const presets = loadLayoutPresets(composer);
  const runtimeNormalize = loadRuntimeLayoutNormalizer();
  const storage = {};
  const context = { crypto:{randomUUID}, YtCdHudOptionsHost:mockLayoutHost(composer,storage), console, YtCdHudLiveMonitorComposer: composer, chrome: { storage: { local: {
    async get() { return JSON.parse(JSON.stringify(storage)); },
    async set(value) { Object.assign(storage, JSON.parse(JSON.stringify(value))); },
  } } } };
  vm.runInNewContext(read('extension/options/live-monitor-layout-store.js'), context);
  const store = context.YtCdHudLiveMonitorLayoutStore;
  for (const preset of presets.BUNDLED_PRESETS) {
    const layout = presets.createBundledLayout(preset.id);
    for (const id of ['panel-base', 'track-title', 'time-readout', ...(preset.id === 'invisible' ? [] : ['transport-controls']), ...(preset.id === 'full' ? ['disc', 'source-selector', 'close-control', 'tracklist-panel'] : [])]) {
      assert.equal(composer.getComponent(layout, id).present, true, preset.id + ': ' + id);
    }
    for (const component of layout.components.filter(item => item.present && item.boundary?.collision)) {
      assert.equal(composer.collisionFor(component, layout.components, layout.canvas), null);
      const rect = composer.componentRect(component.geometry, layout.canvas);
      assert.ok(rect.left >= 0 && rect.top >= 0 && rect.right <= layout.canvas.width && rect.bottom <= layout.canvas.height);
    }
    await store.save(layout,'test-base');
    const prepared = composer.prepareForSave(layout);
    assert.deepEqual(JSON.parse(JSON.stringify(await store.load())), JSON.parse(JSON.stringify(prepared)));
    const runtime = runtimeNormalize(storage[composer.STORAGE_KEY]);
    for (const component of prepared.components) {
      const restored = runtime.components.find(item => item.id === component.id);
      assert.equal(restored.present, component.present);
      assert.deepEqual(JSON.parse(JSON.stringify(restored.geometry)), JSON.parse(JSON.stringify(component.geometry)));
    }
  }
});

test('preserves every approved A/B layout value without recentering or restyling', () => {
  const composer = loadComposer();
  const presets = loadLayoutPresets(composer);
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  // Digests of the independently supplied slot exports, with sorted object keys.
  const expected = {
    'compact-playback': '6c25b5098d1e999ec41bd343c199a65ffeadaad09dcd4e1974cb798562d3ed0c',
    'tracklist-reader': '17aa57587f3beec75da26aeed7b447fe311ec289db57d360cba28bc0cafc3588',
  };
  for (const [id, digest] of Object.entries(expected)) {
    const layout = presets.createBundledLayout(id);
    const raw = JSON.parse(read('extension/options/live-monitor-layout-presets.js').match(/const BUNDLED_LAYOUTS = ([\s\S]*?);/)[1])[id];
    assert.equal(createHash('sha256').update(JSON.stringify(canonical(raw))).digest('hex'), digest, id);
    for (const item of layout.components.filter(item => item.id !== 'panel-base')) assert.deepEqual(JSON.parse(JSON.stringify(item.geometry)), raw.components.find(source => source.id === item.id).geometry);
    const normalized = composer.normalizeLayout(layout);
    assert.deepEqual(JSON.parse(JSON.stringify(normalized)), JSON.parse(JSON.stringify(layout)));
  }
});

test('split controls retain 24px height through normalization and panel code', () => {
  const composer = loadComposer();
  const layout = legacyLayout(composer);
  const unit = composer.getComponent(layout, 'transport-controls');
  unit.textStyle.fontSize = 12;
  unit.arrangement.split = true;
  unit.arrangement.partSize.height = 24;
  const restored = composer.importCode(composer.exportCode(layout));
  assert.equal(composer.getComponent(restored, unit.id).arrangement.partSize.height, 24);
  assert.equal(loadRuntimeLayoutNormalizer()(restored).components.find(item => item.id === unit.id).arrangement.partSize.height, 24);
});

test('lower height floors preserve previously saved large text heights', () => {
  const composer = loadComposer();
  const source = legacyLayout(composer);
  source.canvas.alignmentGrid.enabled = true;
  const title = composer.getComponent(source, 'track-title');
  title.textStyle.fontSize = 192;
  title.geometry.height = 272;
  assert.equal(composer.getComponent(composer.normalizeLayout(source), title.id).geometry.height, 272);
  assert.equal(loadRuntimeLayoutNormalizer()(source).components.find(item => item.id === title.id).geometry.height, 272);
});

test('font weights survive panel code and runtime normalization with bounded input and legacy defaults', () => {
  const composer = loadComposer();
  const runtime = loadRuntimeLayoutNormalizer();
  const source = legacyLayout(composer);
  for (const [value, expected] of [[100, 100], [450, 450], [900, 900], [0, 100], [1000, 900], ['invalid', 700]]) {
    composer.getComponent(source, 'track-title').textStyle.fontWeight = value;
    const normalized = composer.normalizeLayout(source);
    const restored = composer.importCode(composer.exportCode(normalized));
    const actual = composer.getComponent(restored, 'track-title');
    assert.equal(actual.textStyle.fontWeight, expected);
    assert.equal(runtime(source).components.find(item => item.id === actual.id).textStyle.fontWeight, expected);
    assert.equal(composer.toCss(actual, restored)['--lm-font-weight'], String(expected));
  }
  for (const unit of legacyLayout(composer).components.filter(item => item.textStyle)) {
    assert.equal(unit.textStyle.fontWeight, undefined, 'legacy layouts keep implicit defaults');
    assert.equal(composer.toCss(unit)['--lm-font-weight'], String(composer.defaultFontWeight(unit.id)));
  }
});

test('authored slate presets retain surfaces and typography through export, save and runtime loading', async () => {
  const composer = loadComposer();
  const presets = loadLayoutPresets(composer);
  const runtimeNormalize = loadRuntimeLayoutNormalizer();
  const plain = value => JSON.parse(JSON.stringify(value));
  const saved = {};
  const context = { crypto:{randomUUID}, YtCdHudOptionsHost:mockLayoutHost(composer,saved), YtCdHudLiveMonitorComposer: composer, chrome: { storage: { local: {
    async get() { return saved; }, async set(value) { Object.assign(saved, plain(value)); },
  } } } };
  vm.runInNewContext(read('extension/options/live-monitor-layout-store.js'), context);
  for (const preset of presets.BUNDLED_PRESETS) {
    const layout = presets.createBundledLayout(preset.id);
    const base = composer.getComponent(layout, 'panel-base');
    assert.equal(base.style.backgroundColor, '#404549');
    assert.equal(base.style.opacity, preset.id === 'invisible' ? 0 : 1);
    assert.equal(composer.getComponent(layout, 'track-title').style.backgroundEnabled !== false, preset.id !== 'invisible');
    if (preset.id !== 'invisible') {
      assert.equal(composer.getComponent(layout, 'track-title').style.backgroundColor, '#4a4e52');
      assert.equal(composer.getComponent(layout, 'transport-controls').style.backgroundColor, '#2d3135');
    }
    assert.equal(composer.getComponent(layout, 'time-readout').textStyle.color, '#c5ee65');
    layout.locked = true;
    const imported = composer.importCode(composer.exportCode(layout));
    await context.YtCdHudLiveMonitorLayoutStore.save(imported,'test-base');
    const runtime = runtimeNormalize(saved[composer.STORAGE_KEY]);
    for (const component of layout.components.filter(item => item.present)) {
      const actual = runtime.components.find(item => item.id === component.id);
      assert.deepEqual(plain(actual.style), plain(component.style), preset.id + ': ' + component.id);
      if (component.textStyle) assert.deepEqual(plain(actual.textStyle), plain(component.textStyle));
    }
  }
});

test('locking and saving preserve rendered component colors without inserting shade nodes', () => {
  const composer = loadComposer();
  const layout = loadLayoutPresets(composer).createBundledLayout('full');
  const node = id => ({
    dataset: { lmComponent: id }, values: {},
    style: { setProperty(key, value) { this.owner.values[key] = value; } },
    classList: { add() {}, toggle() {} }, setAttribute() {}, querySelectorAll() { return []; },
  });
  const units = layout.components.map(component => node(component.id));
  units.forEach(item => { item.style.owner = item; });
  const preview = node('preview'); preview.style.owner = preview;
  preview.querySelectorAll = () => units;
  const context = { YtCdHudLiveMonitorComposer: composer, document: {
    createElement() { throw new Error('Locking must not append an appearance overlay.'); },
  } };
  vm.runInNewContext(read('extension/options/live-monitor-canvas-editor.js'), context);
  const editor = context.YtCdHudLiveMonitorCanvasEditor.createEditor({ preview, layout });
  editor.render();
  const before = JSON.stringify(units.map(item => item.values));
  editor.setLocked(true);
  assert.equal(JSON.stringify(units.map(item => item.values)), before);
  editor.setLayout(composer.importCode(composer.exportCode(editor.getLayout())));
  assert.equal(JSON.stringify(units.map(item => item.values)), before);
  editor.setLocked(false);
  assert.equal(JSON.stringify(units.map(item => item.values)), before);
});

test('ignores coordinate roundoff at touching edges while detecting real overlaps', () => {
  const composer = loadComposer();
  const first = { left: 0, right: 100 + 1e-12, top: 0, bottom: 48 };
  assert.equal(composer.rectsOverlap(first, { left: 100, right: 200, top: 0, bottom: 48 }), false);
  assert.equal(composer.rectsOverlap(first, { left: 99.9, right: 200, top: 0, bottom: 48 }), true);
});

test('numbered slot controls load built-in panels without writing storage', async () => {
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.listeners = {}; }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.append(item); return item; }
    replaceChildren(...items) { this.children = items; }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
  }
  const composer = loadComposer();
  const storedLayout = legacyLayout(composer);
  composer.getComponent(storedLayout, 'track-title').textStyle.fontSize = 31;
  let writes = 0;
  const presets = loadLayoutPresets(composer, {
    document: { createElement: tag => new Element(tag), getElementById: () => null, documentElement: { lang: 'en' } },
    chrome: { storage: { local: {
      async get(key) { return { [key]: { '4': storedLayout } }; },
      async set() { writes += 1; },
    } } },
  });
  const changes = [];
  const editor = {
    state: { layout: composer.normalizeLayout(storedLayout) },
    setLayout(layout) { this.state.layout = composer.normalizeLayout(layout); },
  };
  const controls = presets.createControls({ host: new Element('div'), editor, onChange: (layout, reason) => changes.push(reason) });
  await controls.render();
  assert.equal(composer.getComponent(editor.state.layout, 'track-title').textStyle.fontSize, 31);
  const descendants = element => [element, ...element.children.flatMap(descendants)];
  const buttons = descendants(controls.element).filter(element => element.className === 'lm-layout-slot');
  assert.equal(buttons.length, 10);
  const loadButton = descendants(controls.element).find(element => element.textContent === '讀取');
  for (const name of ['1', '2', '3']) {
    buttons.find(button => button.textContent === name).listeners.click();
    await controls.render();
    loadButton.listeners.click();
    assert.equal(editor.state.layout.canvas.sizingMode, 'absolute');
    assert.ok(composer.connectedToBase(editor.state.layout, composer.getComponent(editor.state.layout, 'panel-base')));
  }
  assert.deepEqual(changes, ['slot-load', 'slot-load', 'slot-load']);
  assert.equal(writes, 0);
  assert.equal(composer.getComponent((await controls.readSlots())['4'], 'track-title').textStyle.fontSize, 31);

});

test('defers drag collision handling until pointer release and presents the layer decision', () => {
  const editor = read('extension/options/live-monitor-canvas-editor.js');
  assert.match(editor, /composer\.fitInteractionGeometry/);
  assert.match(editor, /composer\.applyInteractionGeometry/);
  assert.match(editor, /globalThis\.confirm/);
  assert.match(editor, /composer\.optimizeOverlapLayers/);
  assert.match(editor, /composer\.removeOverlapGroup/);
});

test('component library contains only units that are not on the panel', () => {
  const composer = loadComposer();
  const initial = legacyLayout(composer);
  assert.deepEqual([...composer.availableComponents(initial)].map(rule => rule.type), ['tracklist-panel']);
  const removed = composer.removeComponent(initial, 'disc');
  assert.equal(removed.removed, true);
  assert.deepEqual([...composer.availableComponents(removed.layout)].map(rule => rule.type), ['disc', 'tracklist-panel']);
  const restored = composer.addComponent(removed.layout, 'disc');
  assert.equal(restored.added, true);
  assert.deepEqual([...composer.availableComponents(restored.layout)].map(rule => rule.type), ['tracklist-panel']);
  assert.equal(composer.collisionFor(composer.getComponent(restored.layout, 'disc'), restored.layout.components, restored.layout.canvas), null);
  assert.equal(composer.removeComponent(restored.layout, 'panel-base').removed, false);
  const withTracklist = composer.addComponent(restored.layout, 'tracklist-panel');
  assert.equal(withTracklist.added, true);
  assert.equal(composer.getComponent(withTracklist.layout, 'tracklist-panel').present, true);
  assert.equal(composer.availableComponents(withTracklist.layout).length, 0);
});

test('legacy typography buttons retire and persistent tracklists replace their toggle in editor and runtime', () => {
  const composer = loadComposer();
  const legacy = legacyLayout(composer);
  composer.getComponent(legacy, 'text-size-control').present = true;
  composer.getComponent(legacy, 'tracklist-panel').present = true;
  composer.getComponent(legacy, 'tracklist-toggle').present = true;
  const migrated = composer.normalizeLayout(legacy);
  assert.equal(composer.getComponent(migrated, 'text-size-control').present, false);
  assert.equal(composer.getComponent(migrated, 'tracklist-toggle').present, false);
  assert.equal(composer.getComponent(migrated, 'tracklist-panel').present, true);
  assert.equal(composer.availableComponents(migrated).some(rule => ['text-size-control', 'tracklist-toggle'].includes(rule.type)), false);
  assert.equal(composer.addComponent(migrated, 'text-size-control').added, false);
  assert.equal(composer.addComponent(migrated, 'tracklist-toggle').added, false);
  const roundTrip = composer.importCode(composer.exportCode(migrated));
  const runtime = loadRuntimeLayoutNormalizer()(legacy);
  for (const id of ['text-size-control', 'tracklist-toggle']) {
    assert.equal(composer.getComponent(roundTrip, id).present, false);
    assert.equal(runtime.components.find(component => component.id === id).present, false);
  }
  const removed = composer.removeComponent(migrated, 'tracklist-panel');
  assert.equal(removed.removed, true);
  assert.equal(composer.availableComponents(removed.layout).some(rule => rule.type === 'tracklist-toggle'), true);
  const hidden = composer.normalizeLayout({ ...legacy, components: legacy.components.map(component =>
    component.id === 'tracklist-panel' ? { ...component, hidden: true } : component) });
  assert.equal(composer.getComponent(hidden, 'tracklist-toggle').present, true,
    'a hidden tracklist still needs an accessible toggle');
});

test('dynamic panel base encloses bounded units, ignores the disc, and stays below every layer', () => {
  const composer = loadComposer();
  const layout = legacyLayout(composer);
  const base = composer.getComponent(layout, 'panel-base');
  const baseRect = composer.componentRect(base, layout.canvas);
  for (const component of layout.components.filter(item => item.present && item.boundary?.collision)) {
    const rect = composer.componentRect(component, layout.canvas);
    assert.ok(baseRect.left <= rect.left);
    assert.ok(baseRect.right >= rect.right);
    assert.ok(baseRect.top <= rect.top);
    assert.ok(baseRect.bottom >= rect.bottom);
  }
  for (const component of layout.components.filter(item => item.present && item.id !== 'panel-base')) assert.ok(base.geometry.z < composer.effectiveZ(component));
  assert.equal('boundary' in composer.getComponent(layout, 'disc'), false);
});

test('projects canonical nested component state into canvas CSS variables', () => {
  const composer = loadComposer();
  const layout = composer.normalizeLayout({
    components: [{ id: 'track-title', geometry: { x: .8, y: .8, width: 320, height: 40 }, style: { color: '#ABCDEF', opacity: .5, fontSize: 18, textAlign: 'justify' } }],
  });
  const component = composer.getComponent(layout, 'track-title');
  const css = composer.toCss(component, layout);
  assert.equal(css['--lm-width'], '25%');
  assert.equal(css['--lm-color'], '#abcdef');
  assert.equal(css['--lm-opacity'], '0.5');
  assert.equal(css['--lm-text-align'], 'justify');
  assert.equal(css['--lm-border-width'], '1px');
  assert.equal(css['--lm-border-radius'], '0px');
  assert.equal(css['--lm-backdrop-filter'], 'none');
  assert.equal(css['--lm-surface-shadow-alpha'], '0.175');
});

test('splits track controls into independent positions while sharing size and appearance', () => {
  const composer = loadComposer();
  const initial = legacyLayout(composer);
  const joined = composer.getComponent(initial, 'transport-controls');
  assert.equal(joined.arrangement.split, false);
  assert.equal(composer.componentRects(joined, initial.canvas).length, 1);
  const splitResult = composer.updateSplit(initial, 'transport-controls', true);
  assert.equal(splitResult.updated, true);
  const transport = composer.getComponent(splitResult.layout, 'transport-controls');
  assert.equal(transport.arrangement.split, true);
  assert.equal(composer.componentRects(transport, splitResult.layout.canvas).length, 2);
  const nextBefore = { ...transport.arrangement.positions.next };
  const previous = composer.interactionGeometry(transport, 'previous');
  const moved = composer.fitInteractionGeometry(splitResult.layout, 'transport-controls', 'previous', { ...previous, x: .2, y: .25 });
  composer.applyInteractionGeometry(transport, 'previous', moved);
  assert.deepEqual(JSON.parse(JSON.stringify(transport.arrangement.positions.next)), nextBefore);
  const resized = { ...composer.interactionGeometry(transport, 'previous'), width: 80, height: 40 };
  composer.applyInteractionGeometry(transport, 'previous', resized);
  assert.equal(composer.interactionGeometry(transport, 'next').width, 80);
  assert.equal(composer.interactionGeometry(transport, 'next').height, 40);
  assert.equal('style' in transport.arrangement, false);
});

test('options page exposes the component library and all atomic preview units', () => {
  const html = read('extension/options/options.html');
  const ids = [...html.matchAll(/data-lm-component="([^"]+)"/g)].map(match => match[1]);
  assert.match(html, /id="live-monitor-library"/);
  assert.match(html, /id="live-monitor-layout-controls"/);
  assert.match(html, /data-lm-part="previous"/);
  assert.match(html, /data-lm-part="next"/);
  assert.deepEqual(ids, [
    'panel-base', 'disc', 'track-title', 'time-readout', 'source-selector',
    'tracklist-toggle', 'transport-controls', 'close-control', 'tracklist-panel',
  ]);
  assert.doesNotMatch(html, /data-lm-component="track-info"/);
  assert.doesNotMatch(html, /data-lm-component="source-badge"/);
});

test('options page uses the deterministic module order including the component library and temporary presets', () => {
  const html = read('extension/options/options.html');
  const loader = read('extension/options/live-monitor-loader.js');
  const bootstrap = read('extension/options/live-monitor-bootstrap.js');
  assert.match(html, /live-monitor-loader\.js/);
  assert.match(html, /id="live-monitor-properties"/);
  assert.ok(html.indexOf('class="preview-stage"') < html.indexOf('id="live-monitor-properties"'));
  assert.ok(html.indexOf('id="live-monitor-properties"') < html.indexOf('class="scope-list"'));
  assert.doesNotMatch(html, /<script[^>]+src="options\.js"/);
  assert.match(bootstrap, /getElementById\('live-monitor-library'\)/);
  assert.match(bootstrap, /getElementById\('live-monitor-layout-controls'\)/);
  assert.match(loader, /live-monitor-component-library\.js/);
  assert.match(loader, /live-monitor-component-library\.css/);
  assert.match(loader, /live-monitor-layout-presets\.js/);
  assert.match(loader, /live-monitor-layout-presets\.css/);
  assert.ok(loader.indexOf('live-monitor-composer.js') < loader.indexOf('live-monitor-layout-store.js'));
  assert.ok(loader.indexOf('live-monitor-property-toolbar.js') < loader.indexOf('live-monitor-component-library.js'));
  assert.ok(loader.indexOf('live-monitor-component-library.js') < loader.indexOf('live-monitor-bootstrap.js'));
  assert.ok(loader.indexOf('live-monitor-layout-presets.js') < loader.indexOf('live-monitor-bootstrap.js'));
});

test('keeps the live preview large, widescreen, and responsive', () => {
  const css = read('extension/options/options.css');
  assert.match(css, /width:\s*min\(1680px,\s*calc\(100% - 48px\)\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(360px,\s*\.8fr\)\s+minmax\(560px,\s*1\.2fr\)/);
  assert.match(css, /\.preview-stage\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/s);
  assert.match(css, /@media\s*\(max-width:\s*980px\)/);
  assert.match(css, /radial-gradient\(circle at 1px 1px/);
  assert.match(css, /background-size:\s*24px 24px, 96px 96px, 96px 96px/);
  assert.match(css, /\.preview-workbench\s*\{[^}]*position:\s*sticky[^}]*top:\s*24px/s);
  assert.match(css, /\.preview-properties\s*\{[^}]*margin-top:\s*-1px/s);
});

test('exposes RESET and three explicit temporary style slots', () => {
  const presets = read('extension/options/live-monitor-layout-presets.js');
  assert.match(presets, /reset\.textContent\s*=\s*'RESET'/);
  assert.match(presets, /length: 10/);
  assert.match(presets, /chrome\?\.storage\?\.session/);
  assert.match(presets, /'SAVE'/);
  assert.match(presets, /'LOAD'/);
  assert.match(presets, /align\.textContent\s*=\s*'AUTO ALIGN'/);
  assert.match(presets, /editor\.updateAlignment\(enabled\)/);
});

test('package check covers every shipped live monitor script', () => {
  const packageJson = JSON.parse(read('package.json'));
  const check = packageJson.scripts.check;
  for (const file of [
    'live-monitor-composer.js',
    'panel-presets.js',
    'live-monitor-layout-store.js',
    'live-monitor-resize-engine.js',
    'live-monitor-canvas-editor.js',
    'live-monitor-property-toolbar.js',
    'live-monitor-component-library.js',
    'live-monitor-layout-presets.js',
    'live-monitor-bootstrap.js',
    'live-monitor-loader.js',
  ]) assert.match(check, new RegExp(file.replaceAll('.', '\\.'), 'u'));
});

test('keeps v2 layout migration and every atomic unit on the real HUD path', () => {
  const source = read('src/youtube-cd-hud.user.js');
  assert.match(source, /HUD_LAYOUT_STORAGE_KEY\s*=\s*'ytCdHudLayoutV2'/);
  assert.match(source, /HUD_LAYOUT_LEGACY_STORAGE_KEY\s*=\s*'ytCdHudLayoutV1'/);
  assert.match(source, /async function prepareExtensionLayout/);
  assert.match(source, /function applyRuntimeLayout/);
  for (const id of [
    'panel-base', 'disc', 'track-title', 'time-readout', 'source-selector',
    'tracklist-toggle', 'transport-controls', 'close-control', 'text-size-control', 'tracklist-panel',
  ]) assert.match(source, new RegExp("'" + id + "'", 'u'));
  assert.match(source, /dataset\.ytcdLayoutUnit/);
  assert.match(source, /dataset\.ytcdLayoutPart/);
  assert.match(source, /ytcd-transport-split/);
  assert.match(source, /--ytcd-unit-text-align/);
  assert.match(source, /await prepareExtensionLayout\(\)/);
});

test('content runtime normalizes the composer schema without losing unit parameters', () => {
  const composer = loadComposer();
  const normalizeRuntime = loadRuntimeLayoutNormalizer();
  const layout = legacyLayout(composer);
  const runtime = normalizeRuntime(layout);
  assert.equal(runtime.version, 2);
  assert.equal(runtime.canvas.collisionPolicy, 'no-overlap-closed');
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.canvas.alignmentGrid)), { enabled: true, unitWidth: 8, unitHeight: 8, visible: false });
  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.components.map(component => component.id))),
    JSON.parse(JSON.stringify(layout.components.map(component => component.id))),
  );
  const title = runtime.components.find(component => component.id === 'track-title');
  assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(title))), ['id', 'type', 'present', 'geometry', 'locked', 'layer', 'boundary', 'style', 'textStyle', 'effects']);
  assert.equal(title.boundary.state, 'closed');
  assert.equal(title.effects.marquee, true);
  assert.equal(title.textStyle.textAlign, 'left');
  assert.equal(title.textStyle.opacity, 1);
  const transport = runtime.components.find(component => component.id === 'transport-controls');
  assert.equal(transport.arrangement.split, false);
  assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(transport.arrangement.positions))), ['previous', 'next']);
  const disc = runtime.components.find(component => component.id === 'disc');
  assert.equal(disc.geometry.z, 1);
  assert.equal(disc.layer.enabled, true);
  assert.equal('boundary' in disc, false);
  assert.equal(runtime.components.find(component => component.id === 'panel-base').style.opacity, .85);
  assert.equal(normalizeRuntime({ components: [{ id: 'panel-base', style: { opacity: 0 } }] }).components[0].style.opacity, 0);
  assert.equal(runtime.components.find(component => component.id === 'tracklist-panel').present, false);
});

test('projects the editor canvas onto the YouTube player without moving any unit', () => {
  const composer = loadComposer();
  const runtimeApi = loadRuntimeTestApi();
  const editorLayout = legacyLayout(composer);
  const runtimeDefaults = runtimeApi.normalizeHudLayout(editorLayout);
  const runtimeLayout = runtimeApi.normalizeHudLayout(editorLayout);

  assert.deepEqual(
    JSON.parse(JSON.stringify(runtimeDefaults.components.map(component => component.geometry))),
    JSON.parse(JSON.stringify(editorLayout.components.map(component => component.geometry))),
  );

  const projection = runtimeApi.projectHudLayout(runtimeLayout, { width: 960, height: 540 });
  assert.equal(projection.scale, 1);
  assert.equal(projection.canvas.width, 1280);
  assert.equal(projection.canvas.height, 720);

  for (const component of runtimeLayout.components.filter(component => component.id !== 'panel-base')) {
    const projected = runtimeApi.projectHudGeometry(component.geometry, projection);
    const actualCenterX = projection.root.left + projected.x / 100 * projection.root.width;
    const actualCenterY = projection.root.top + projected.y / 100 * projection.root.height;
    assert.ok(Math.abs(actualCenterX - (projection.canvas.left + component.geometry.x * 1280)) < 1e-9, `${component.id} x drifted`);
    assert.ok(Math.abs(actualCenterY - (projection.canvas.top + component.geometry.y * 720)) < 1e-9, `${component.id} y drifted`);
    assert.ok(Math.abs(projected.width / 100 * projection.root.width - component.geometry.width) < 1e-9, `${component.id} width drifted`);
    assert.ok(Math.abs(projected.height / 100 * projection.root.height - component.geometry.height) < 1e-9, `${component.id} height drifted`);
  }

  const tracklist = runtimeLayout.components.find(component => component.id === 'tracklist-panel');
  const canvasTracklist = runtimeApi.projectCanvasGeometry(tracklist.geometry, projection);
  assert.deepEqual(JSON.parse(JSON.stringify(canvasTracklist)), { left: projection.canvas.left + 932, top: projection.canvas.top + 32, width: 280, height: 256 });

  const source = read('src/youtube-cd-hud.user.js');
  assert.match(source, /hud\.style\.left = `\$\{projection\.root\.left\}px`/);
  assert.match(source, /#yt-cd-hud\.ytcd-layout-v2\s*\{[^}]*padding:\s*0/s);
  assert.match(source, /#yt-cd-hud\.ytcd-layout-v2 \.hud-panel-surface\s*\{[^}]*left:\s*var\(--ytcd-unit-x\)[^}]*top:\s*var\(--ytcd-unit-y\)/s);
  assert.match(source, /id === 'disc'[\s\S]*removeProperty\('width'\)[\s\S]*removeProperty\('height'\)/);
  assert.match(source, /id === 'track-title'[\s\S]*removeProperty\('max-width'\)[\s\S]*removeProperty\('font-size'\)/);
  assert.match(source, /button\.style\.setProperty\('height', `\$\{buttonHeight\}px`, 'important'\)/);
  assert.match(source, /\.hud-source-selector > :where\([^}]+height:\s*100%/s);
  assert.match(source, /#yt-cd-hud\.ytcd-layout-v2 \.resize-handle \{ display: none; \}/);
});

test('wires every component property to an auditable control and keeps component values authoritative', () => {
  const composer = loadComposer();
  const toolbar = read('extension/options/live-monitor-property-toolbar.js');
  const options = read('extension/options/options.js');
  const css = read('extension/options/options.css');
  const declared = new Set([...toolbar.matchAll(/dataset\.lmProperty\s*=\s*'([^']+)'/g)].map(match => match[1]));
  declared.add('color');
  declared.add('backgroundColor');
  declared.add('borderColor');
  declared.add('borderEnabled');
  declared.add('cornerEnabled');
  declared.add('cornerRadiusLevel');
  declared.add('backgroundBlurEnabled');
  assert.match(toolbar, /input\.dataset\.lmProperty = property/);
  for (const rule of Object.values(composer.registry)) {
    for (const property of rule.supportedProperties) assert.ok(declared.has(property), `${rule.type}.${property} has no toolbar control`);
  }
  const declaredText = new Set([...toolbar.matchAll(/dataset\.lmTextProperty\s*=\s*'([^']+)'/g)].map(match => match[1]));
  declaredText.add('color');
  assert.match(toolbar, /input\.dataset\.lmTextProperty = property/);
  for (const rule of Object.values(composer.registry)) {
    for (const property of rule.supportedTextProperties) assert.ok(declaredText.has(property), `${rule.type}.textStyle.${property} has no toolbar control`);
  }
  assert.match(toolbar, /input\.min = '0'/);
  assert.equal(composer.normalizeLayout({ components: [{ id: 'panel-base', style: { opacity: 0 } }] }).components[0].style.opacity, 0);
  assert.equal(composer.registry.disc.maxSize.width, 720);
  assert.equal(composer.registry.disc.allowCanvasOverflow, true);
  assert.deepEqual([...composer.DISC_TEXTURES], ['classic', 'gold', 'transparent-grooves']);
  assert.doesNotMatch(options, /preview-title-text'\)\.style\.fontSize/);
  assert.match(css, /\.preview-title \{ --lm-font-size: var\(--preview-title-font-size, 14px\); \}/);
});

test('stores tracklist panel surface and text appearance independently while fixing its border to secondary', () => {
  const composer = loadComposer();
  const layout = composer.normalizeLayout({ components: [{
    id: 'tracklist-panel', present: true,
    style: { backgroundColor: '#112233', borderColor: '#445566', opacity: .7 },
    textStyle: { color: '#abcdef', font: 'consolas', fontSize: 19, textAlign: 'center' },
  }] });
  const panel = composer.getComponent(layout, 'tracklist-panel');
  assert.deepEqual(JSON.parse(JSON.stringify(panel.style)), {
    backgroundColor: '#112233', borderColor: '#63b3ed', opacity: .7,
    borderEnabled: true, cornerEnabled: false, cornerRadiusLevel: 1, backgroundBlurEnabled: false,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(panel.textStyle)), { color: '#abcdef', opacity: 1, font: 'consolas', fontSize: 19, textAlign: 'center' });
  const css = composer.toCss(panel, layout);
  assert.equal(css['--lm-background-color'], '#112233');
  assert.equal(css['--lm-color'], '#abcdef');
  assert.equal(css['--lm-font-size'], String(19 / layout.canvas.width * 100) + 'cqw');
  const previewCss = read('extension/options/options.css');
  const runtime = read('src/youtube-cd-hud.user.js');
  assert.match(previewCss, /\.preview-tracklist-panel\s*\{[\s\S]*?text-align:\s*var\(--lm-text-align, left\)/);
  assert.match(runtime, /\.yt-tracklist-panel\.ytcd-layout-tracklist\s*\{[\s\S]*?text-align:\s*var\(--ytcd-unit-text-align, left\)/);
});

test('gives every text-bearing unit independent text color and opacity', () => {
  const composer = loadComposer();
  const textUnits = ['track-title', 'time-readout', 'source-selector', 'tracklist-toggle', 'transport-controls', 'close-control', 'text-size-control', 'tracklist-panel'];
  for (const id of textUnits) {
    const rule = composer.registry[id];
    assert.ok(rule.supportedTextProperties.includes('color'), `${id} is missing text color`);
    assert.ok(rule.supportedTextProperties.includes('opacity'), `${id} is missing text opacity`);
  }
  const layout = composer.normalizeLayout({ components: [{ id: 'track-title', style: { opacity: .6 }, textStyle: { color: '#123456', opacity: .25 } }] });
  const title = composer.getComponent(layout, 'track-title');
  assert.equal(title.style.opacity, .6);
  assert.equal(title.textStyle.color, '#123456');
  assert.equal(title.textStyle.opacity, .25);
  const css = composer.toCss(title, layout);
  assert.equal(css['--lm-opacity'], '0.6');
  assert.equal(css['--lm-text-opacity'], '0.25');
});

test('normalizes per-unit border, corner, blur, and expanded text-size controls identically for preview and runtime', () => {
  const composer = loadComposer();
  const normalizeRuntime = loadRuntimeLayoutNormalizer();
  const layout = composer.normalizeLayout({ components: [{
    id: 'track-title',
    geometry: { x: .5, y: .96, width: 480, height: 48 },
    style: { borderEnabled: false, cornerEnabled: true, cornerRadiusLevel: 99, backgroundBlurEnabled: true, opacity: .4 },
    textStyle: { fontSize: 999 },
  }] });
  const title = composer.getComponent(layout, 'track-title');
  assert.equal(composer.TEXT_SIZE_MAXIMUM, 192);
  assert.deepEqual(JSON.parse(JSON.stringify(composer.textSizeLimits(layout.canvas))), { minimum: 8, maximum: 192 });
  assert.equal(title.style.borderEnabled, false);
  assert.equal(title.style.cornerEnabled, true);
  assert.equal(title.style.cornerRadiusLevel, 10);
  assert.equal(title.style.backgroundBlurEnabled, true);
  assert.equal(title.textStyle.fontSize, 192);
  assert.equal(title.geometry.height, 264);
  assert.ok(composer.componentRect(title, layout.canvas).bottom <= layout.canvas.height);
  const css = composer.toCss(title, layout);
  assert.equal(css['--lm-border-width'], '0px');
  assert.equal(css['--lm-border-radius'], '20px');
  assert.equal(css['--lm-backdrop-filter'], 'blur(8px) saturate(.86)');

  const runtimeTitle = normalizeRuntime(layout).components.find(component => component.id === 'track-title');
  assert.deepEqual(JSON.parse(JSON.stringify(runtimeTitle.style)), JSON.parse(JSON.stringify(title.style)));
  assert.equal(runtimeTitle.textStyle.fontSize, title.textStyle.fontSize);
  assert.equal(runtimeTitle.geometry.height, title.geometry.height);

  const previewCss = read('extension/options/options.css');
  const runtimeCss = read('src/youtube-cd-hud.user.js');
  assert.match(previewCss, /\.preview-title,[\s\S]*?display:\s*grid;[\s\S]*?align-content:\s*center;[\s\S]*?border:\s*var\(--lm-border-width\)/);
  assert.match(previewCss, /\.preview-source-selector > span,[\s\S]*?border-left:\s*var\(--lm-border-width\)/);
  assert.match(runtimeCss, /:where\(\.hud-chapter, \.hud-time\)\s*\{[\s\S]*?display:\s*grid;[\s\S]*?align-content:\s*center;/);
  assert.match(runtimeCss, /\.hud-source-selector > :where\([^)]+\)\s*\{[\s\S]*?border-left:\s*var\(--ytcd-unit-border-width\)/);
  assert.match(runtimeCss, /\.hud-transport-controls \.hud-control-button\s*\{[\s\S]*?border-left:\s*var\(--ytcd-unit-border-width\)/);

  const defaults = legacyLayout(composer);
  for (const component of defaults.components) {
    assert.equal(component.style.borderEnabled, true, `${component.id} border must default on`);
    assert.equal(component.style.backgroundBlurEnabled, false, `${component.id} blur must default off`);
  }
  const disc = composer.getComponent(defaults, 'disc');
  assert.equal(disc.style.cornerEnabled, true);
  assert.equal(composer.registry.disc.supportedProperties.includes('cornerEnabled'), false);
  assert.equal(composer.registry.disc.supportedProperties.includes('cornerRadiusLevel'), false);
});

test('removes surface haze when the background is fully transparent and blur is disabled', () => {
  const composer = loadComposer();
  const layout = composer.normalizeLayout({ components: [{
    id: 'panel-base',
    style: { opacity: 0, backgroundBlurEnabled: false },
    effects: { shadow: true, accentRail: true },
  }] });
  const panel = composer.getComponent(layout, 'panel-base');
  const css = composer.toCss(panel, layout);
  assert.equal(css['--lm-unit-opacity'], '0');
  assert.equal(css['--lm-backdrop-filter'], 'none');
  assert.equal(css['--lm-surface-shadow-alpha'], '0');

  const previewCss = read('extension/options/options.css');
  const runtime = read('src/youtube-cd-hud.user.js');
  assert.match(previewCss, /\.preview-panel-base\.lm-effect-shadow\s*\{\s*box-shadow:\s*0 9px 30px rgba\(0, 0, 0, var\(--lm-surface-shadow-alpha\)\)/);
  assert.match(runtime, /--ytcd-unit-shadow-alpha/);
  assert.match(runtime, /\.hud-panel-surface\.ytcd-effect-shadow\s*\{[\s\S]*?rgba\(0, 0, 0, var\(--ytcd-unit-shadow-alpha\)\)/);
});

test('keeps split transport text containment and unit appearance on both atomic buttons', () => {
  const composer = loadComposer();
  const layout = composer.normalizeLayout({ components: [{
    id: 'transport-controls',
    arrangement: { split: true },
    textStyle: { fontSize: 192 },
    style: { cornerEnabled: true, cornerRadiusLevel: 4, backgroundBlurEnabled: true },
  }] });
  const transport = composer.getComponent(layout, 'transport-controls');
  assert.equal(transport.arrangement.partSize.height, 264);
  for (const part of Object.values(transport.arrangement.positions)) {
    const rect = composer.componentRect({ ...part, ...transport.arrangement.partSize }, layout.canvas);
    assert.ok(rect.top >= 0);
    assert.ok(rect.bottom <= layout.canvas.height);
  }
  const previewCss = read('extension/options/options.css');
  assert.match(previewCss, /\.preview-transport\.lm-transport-split > b\s*\{[\s\S]*?border:\s*var\(--lm-border-width\)[\s\S]*?border-radius:\s*var\(--lm-border-radius\)[\s\S]*?backdrop-filter:\s*var\(--lm-backdrop-filter\)/);
});

test('offers three deterministic disc textures in preview and runtime', () => {
  const composer = loadComposer();
  const previewHtml = read('extension/options/options.html');
  const previewCss = read('extension/options/options.css');
  const runtime = read('src/youtube-cd-hud.user.js');
  const editor = read('extension/options/live-monitor-canvas-editor.js');
  const gold = composer.normalizeLayout({ components: [{ id: 'disc', style: { texture: 'gold' } }] });
  assert.equal(composer.getComponent(gold, 'disc').style.texture, 'gold');
  const invalid = composer.normalizeLayout({ components: [{ id: 'disc', style: { texture: 'invalid' } }] });
  assert.equal(composer.getComponent(invalid, 'disc').style.texture, 'classic');
  assert.match(editor, /dataset\.lmTexture = component\.style\.texture/);
  assert.match(previewCss, /data-lm-texture="gold"/);
  assert.match(previewCss, /data-lm-texture="transparent-grooves"/);
  assert.match(previewCss, /\.preview-disc-art\s*\{/);
  assert.match(previewHtml, /class="preview-disc-art"/);
  assert.match(previewCss, /\.preview-disc\[data-lm-texture="gold"\]:after/);
  assert.match(previewCss, /\.preview-disc\[data-lm-texture="transparent-grooves"\]:after/);
  assert.match(runtime, /data-ytcd-texture="gold"/);
  assert.match(runtime, /data-ytcd-texture="transparent-grooves"/);
  assert.match(runtime, /\.cd-disc-wrapper\[data-ytcd-texture\] \.cd-art\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?filter:\s*none;/);
  assert.doesNotMatch(runtime, /data-ytcd-texture="(?:gold|transparent-grooves)"\][^\n]*\.cd-art[^\n]*opacity:\s*\.(?:2|28)/);
});

test('keeps grid-aligned control minimums reachable and the dynamic base above its declared floor', () => {
  const composer = loadComposer();
  assert.equal(composer.registry['tracklist-toggle'].minSize.width, 48);
  assert.equal(composer.registry['text-size-control'].minSize.width, 64);
  for (const rule of Object.values(composer.registry).filter(rule => rule.supportedTextProperties.length)) {
    const layout = composer.normalizeLayout({ components: [{ id: rule.type, textStyle: { fontSize: composer.TEXT_SIZE_MAXIMUM } }] });
    const component = composer.getComponent(layout, rule.type);
    assert.ok(component.geometry.height >= 264, `${rule.type} cannot contain the 192px maximum text line`);
  }
  const layout = legacyLayout(composer);
  layout.components.forEach(component => {
    if (!['panel-base', 'close-control'].includes(component.id)) component.present = false;
  });
  composer.refreshBase(layout);
  const base = composer.getComponent(layout, 'panel-base');
  assert.ok(base.geometry.width >= composer.registry['panel-base'].minSize.width);
  assert.ok(base.geometry.height >= composer.registry['panel-base'].minSize.height);
});

test('applies global primary and secondary colors before allowing component overrides', () => {
  const composer = loadComposer();
  const initial = legacyLayout(composer);
  const themed = composer.applyPalette(initial, { primaryColor: '#102030', secondaryColor: '#aabbcc' });
  assert.deepEqual(JSON.parse(JSON.stringify(themed.palette)), { primaryColor: '#102030', secondaryColor: '#aabbcc' });
  for (const component of themed.components) {
    assert.equal(component.style.backgroundColor, '#102030', `${component.id} did not receive primary`);
    assert.equal(component.style.borderColor, '#aabbcc', `${component.id} border is not fixed to secondary`);
    if (component.textStyle) assert.equal(component.textStyle.color, '#aabbcc', `${component.id} text did not receive secondary`);
  }
  const title = composer.getComponent(themed, 'track-title');
  title.style.backgroundColor = '#223344';
  title.textStyle.color = '#ddeeff';
  const overridden = composer.normalizeLayout(themed);
  assert.equal(composer.getComponent(overridden, 'track-title').style.backgroundColor, '#223344');
  assert.equal(composer.getComponent(overridden, 'track-title').textStyle.color, '#ddeeff');
  assert.equal(composer.getComponent(overridden, 'track-title').style.borderColor, '#aabbcc');
});

test('viewport changes preserve pixel sizes and distances between units', () => {
  const composer = loadComposer();
  const initial = legacyLayout(composer);
  const title = composer.getComponent(initial, 'track-title');
  for (const preset of composer.VIEWPORT_PRESETS) {
    const result = composer.updateViewport(initial, preset.width, preset.height);
    const next = composer.getComponent(result, 'track-title');
    assert.equal(result.canvas.sizingMode, 'absolute');
    assert.equal(next.geometry.width, title.geometry.width);
    assert.equal(next.textStyle.fontSize, title.textStyle.fontSize);
    assert.ok(Math.abs(next.geometry.x * result.canvas.width - title.geometry.x * initial.canvas.width) < 1e-7);
    assert.equal(composer.connectedToBase(result, composer.getComponent(result, 'panel-base')), true);
  }
});

test('exposes the foundation palette, viewport, sizing mode, and English alignment abbreviations', () => {
  const presets = read('extension/options/live-monitor-layout-presets.js');
  const toolbar = read('extension/options/live-monitor-property-toolbar.js');
  const css = read('extension/options/options.css');
  assert.match(presets, /dataset\.lmPalette = 'primaryColor'/);
  assert.match(presets, /dataset\.lmPalette = 'secondaryColor'/);
  assert.match(presets, /dataset\.lmCanvasPreset = 'true'/);
  assert.doesNotMatch(presets, /SIZE MODE|REL · %/);
  assert.match(toolbar, /left: 'LFT', right: 'RGT', center: 'CTR', justify: 'JST'/);
  assert.doesNotMatch(toolbar, /左對齊|右對齊|置中|平均分散/);
  assert.match(css, /text-shadow:\s*0 0 6px color-mix\(in srgb, var\(--lm-secondary-color\)/);
  assert.match(css, /background:\s*color-mix\(in srgb, var\(--lm-background-color\) calc\(var\(--lm-unit-opacity\) \* 100%\), transparent\)/);
  assert.match(read('extension/options/live-monitor-canvas-editor.css'), /\.preview-disc\s*\{[\s\S]*?opacity:\s*var\(--lm-disc-opacity, 1\)/);
  assert.match(read('src/youtube-cd-hud.user.js'), /\.cd-disc-wrapper\s*\{[\s\S]*?opacity:\s*var\(--ytcd-disc-opacity, 1\)/);
  assert.match(toolbar, /fontSizeFromSlider/);
  assert.match(toolbar, /Text size · PX/);
  assert.match(toolbar, /SHOW BORDER/);
  assert.match(toolbar, /ROUND CORNERS/);
  assert.match(toolbar, /Corner radius · 1–10/);
  assert.match(toolbar, /BG BLUR/);
  assert.match(toolbar, /input\.max = '1000'/);
  assert.match(read('extension/options/live-monitor-canvas-editor.css'), /border-width:\s*var\(--lm-border-width\)/);
  assert.match(read('extension/options/live-monitor-canvas-editor.css'), /backdrop-filter:\s*var\(--lm-backdrop-filter\)/);
  assert.match(read('src/youtube-cd-hud.user.js'), /--ytcd-unit-border-width/);
  assert.match(read('src/youtube-cd-hud.user.js'), /--ytcd-unit-border-radius/);
  assert.match(read('src/youtube-cd-hud.user.js'), /--ytcd-unit-backdrop-filter/);
  assert.match(read('src/youtube-cd-hud.user.js'), /#yt-cd-hud\.ytcd-layout-v2 \.hud-transport-controls\s*\{[\s\S]*?border:\s*var\(--ytcd-unit-border-width\) solid var\(--ytcd-secondary-color\)/);
});

test('connects the advertised title marquee effect to preview and runtime CSS', () => {
  const previewCss = read('extension/options/options.css');
  const runtime = read('src/youtube-cd-hud.user.js');
  const optionsHtml = read('extension/options/options.html');
  assert.match(previewCss, /\.preview-title\.lm-effect-marquee[\s\S]*?\.lm-marquee-track\s*\{\s*animation:\s*lm-preview-title-marquee 12s linear infinite/);
  assert.match(runtime, /\.hud-chapter\.ytcd-effect-marquee[\s\S]*?\.ytcd-marquee-track\s*\{\s*animation:\s*ytcd-title-marquee 12s linear infinite/);
  assert.doesNotMatch(previewCss, /\.preview-title\.lm-effect-marquee:hover/);
  assert.doesNotMatch(runtime, /\.hud-chapter\.ytcd-effect-marquee:hover/);
  assert.match(optionsHtml, /lm-marquee-label lm-marquee-copy/);
  assert.match(previewCss, /transform:\s*translateX\(-50%\)/);
  assert.match(runtime, /transform:\s*translateX\(-50%\)/);
});

test('moves the runtime assembly and persists its canonical layout without lock controls', () => {
  const source = read('src/youtube-cd-hud.user.js');
  assert.doesNotMatch(source, /function bindRuntimePanelLock/);
  assert.match(source, /const draggable = component.present && !component.hidden;/);
  assert.match(source, /function bindRuntimeLayoutUnitDragging/);
  assert.match(source, /Math\.hypot\(dx, dy\) <= 3/);
  assert.match(source, /translateRuntimeAssembly\(gesture.originalLayout/);
  assert.match(source, /chrome\.storage\.local\.set\(\{ \[HUD_LAYOUT_STORAGE_KEY\]: runtimeLayout \}\)/);
  assert.match(source, /if \(hud\.classList\.contains\('ytcd-layout-v2'\)\) return/);
  assert.doesNotMatch(source, /\['disc', 'source-selector'/);
});

test('keeps standalone HUD labels and v2 visibility rules aligned with the extension preview', () => {
  const runtimeApi = loadRuntimeTestApi();
  const i18n = runtimeApi.createUserScriptI18n();
  assert.equal(i18n.translate('hud.fullTrackSet', 'en'), 'Full track set');
  assert.equal(i18n.translate('hud.fullTrackSet', 'zh-TW'), '完整曲目集');

  const source = read('src/youtube-cd-hud.user.js');
  assert.match(source, /ytcd-hide-transport \.hud-transport-controls \{ display: none !important; \}/);
  assert.match(source, /ytcd-hide-1001 \.hud-status-button \{ display: none !important; \}/);
});


test('panel JSON round trips locks, geometry, local fonts and zero opacity without executing code', () => {
  const composer = loadComposer();
  const layout = legacyLayout(composer);
  layout.locked = true;
  const title = composer.getComponent(layout, 'track-title');
  title.locked = true;
  title.style.opacity = 0;
  title.textStyle.font = 'Noto Sans TC';
  const normalized = composer.normalizeLayout(layout);
  const restored = composer.importCode(composer.exportCode(normalized));
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), JSON.parse(JSON.stringify(normalized)));
  const runtime = loadRuntimeLayoutNormalizer()(restored);
  assert.equal(runtime.locked, true);
  const runtimeTitle = runtime.components.find(item => item.id === 'track-title');
  assert.equal(runtimeTitle.locked, true);
  assert.equal(runtimeTitle.style.opacity, 0);
  assert.equal(runtimeTitle.textStyle.font, 'Noto Sans TC');
  assert.throws(() => composer.importCode('<script>alert(1)</script>'));
  assert.throws(() => composer.importCode(JSON.stringify({ format: 'youtube-cd-hud-panel', version: 99, layout })));
  const invalid = JSON.parse(composer.exportCode(layout));
  invalid.layout.components[1].id = 'panel-base';
  assert.throws(() => composer.importCode(JSON.stringify(invalid)), /元件/);
  assert.throws(() => composer.importCode(' '.repeat(100001)), /100 KB/);
  assert.equal(composer.fontStack('x"; url(https://example.com)'), composer.FONT_STACKS['cascadia-mono']);
});

test('permanent base retains manual size and rejects detached units or base removal', () => {
  const composer = loadComposer();
  const layout = legacyLayout(composer);
  layout.canvas.alignmentGrid.enabled = false;
  const base = composer.getComponent(layout, 'panel-base');
  const original = { ...base.geometry };
  composer.getComponent(layout, 'track-title').geometry.x += .001;
  composer.refreshBase(layout);
  assert.deepEqual(JSON.parse(JSON.stringify(base.geometry)), original);
  const larger = composer.canPlaceInteraction(layout, 'panel-base', null, { ...original, height: original.height + 10 });
  assert.equal(larger.valid, true);
  assert.equal(composer.removeComponent(layout, 'panel-base').removed, false);
  const title = composer.getComponent(layout, 'track-title');
  assert.equal(composer.canPlaceInteraction(layout, title.id, null, { ...title.geometry, y: .95 }).valid, false);
  const invalid = JSON.parse(composer.exportCode(layout));
  invalid.layout.components.find(item => item.id === title.id).geometry.y = .95;
  assert.throws(() => composer.importCode(JSON.stringify(invalid)), /底座/);
  title.locked = true;
  assert.equal(composer.removeComponent(layout, title.id).removed, false);
  assert.equal(composer.canPlaceInteraction(layout, title.id, null, title.geometry).valid, false);
  const engine = loadResizeEngine(composer);
  assert.equal(engine.scaleGroup(layout, 1.1).updated, false);
});

test('keyboard nudges by one pixel, preserves edits through reload, and obeys unit and panel locks', () => {
  const composer = loadComposer();
  const listeners = {};
  const focus = { tagName: 'DIV' };
  const document = { activeElement: focus, addEventListener(name, fn) { listeners[name] = fn; } };
  const preview = {
    classList: { add() {}, toggle() {} }, dataset: {}, style: { setProperty() {} },
    querySelectorAll() { return []; }, addEventListener() {}, contains(node) { return node === focus; },
    parentElement: { clientWidth: 640, clientHeight: 480 },
  };
  const context = { document, YtCdHudLiveMonitorComposer: composer, YtCdHudLiveMonitorResizeEngine: loadResizeEngine(composer) };
  vm.runInNewContext(read('extension/options/live-monitor-canvas-editor.js'), context);
  const editor = context.YtCdHudLiveMonitorCanvasEditor.createEditor({ preview, layout: legacyLayout(composer) }).init();
  const press = (key, extra = {}) => listeners.keydown({ key, preventDefault() {}, ...extra });
  editor.select('track-title');
  const before = composer.getComponent(editor.state.layout, 'track-title').geometry.x;
  press('ArrowRight');
  const after = composer.getComponent(editor.getLayout(), 'track-title').geometry.x;
  assert.ok(Math.abs((after - before) * 1280 - 1) < 1e-7);
  press('Enter');
  press('ArrowLeft'); press('Delete');
  assert.equal(composer.getComponent(editor.getLayout(), 'track-title').geometry.x, after);
  assert.equal(composer.getComponent(editor.getLayout(), 'track-title').present, true);
  press('Enter');
  editor.setLocked(true);
  press('ArrowLeft'); press('Enter'); press('Delete');
  assert.equal(composer.getComponent(editor.getLayout(), 'track-title').geometry.x, after);
  editor.setLocked(false);
  document.activeElement = { tagName: 'TEXTAREA' };
  press('Delete');
  assert.equal(composer.getComponent(editor.getLayout(), 'track-title').present, true);
  document.activeElement = focus;
  press('Delete');
  assert.equal(composer.getComponent(editor.getLayout(), 'track-title').present, false);
});

test('Ctrl+Z restores successive panel edits, leaves text editing native, and respects reload boundaries', () => {
  const composer = loadComposer();
  const listeners = {};
  const document = { activeElement: { tagName: 'DIV' }, addEventListener(name, fn) { listeners[name] = fn; } };
  const preview = { classList: { add() {}, toggle() {} }, dataset: {}, style: { setProperty() {} },
    querySelectorAll() { return []; }, addEventListener() {}, contains() { return false; } };
  const changes = [];
  const context = { document, YtCdHudLiveMonitorComposer: composer, YtCdHudLiveMonitorResizeEngine: loadResizeEngine(composer) };
  vm.runInNewContext(read('extension/options/live-monitor-canvas-editor.js'), context);
  const editor = context.YtCdHudLiveMonitorCanvasEditor.createEditor({ preview, layout: legacyLayout(composer), onChange: (_layout, reason) => changes.push(reason) }).init();
  let prevented = 0;
  const undoKey = extra => listeners.keydown({ key: 'z', ctrlKey: true, preventDefault() { prevented++; }, ...extra });
  const initial = JSON.stringify(editor.getLayout());
  editor.updatePalette({ primaryColor: '#123456' });
  const colored = JSON.stringify(editor.getLayout());
  editor.setLocked(true);
  undoKey(); assert.equal(JSON.stringify(editor.getLayout()), colored, 'undo works while the panel is locked');
  document.activeElement = { tagName: 'TEXTAREA' };
  undoKey(); assert.equal(JSON.stringify(editor.getLayout()), colored); assert.equal(prevented, 1);
  document.activeElement = { tagName: 'INPUT', type: 'range' };
  undoKey(); assert.equal(JSON.stringify(editor.getLayout()), initial); assert.equal(prevented, 2);
  assert.equal(changes.at(-1), 'undo', 'undo notifies the ordinary save/auto-sync path');
  const replacement = composer.createDefaultLayout();
  editor.setLayout(replacement);
  undoKey({ ctrlKey: false, metaKey: true });
  assert.equal(JSON.stringify(editor.getLayout()), initial, 'preset/import replacement is undoable');
  composer.getComponent(editor.state.layout, 'track-title').textStyle.color = '#abcdef';
  editor.recordHistory();
  undoKey(); assert.equal(JSON.stringify(editor.getLayout()), initial, 'toolbar property commits are undoable');
  editor.updatePalette({ primaryColor: '#123456' });
  editor.setLayout(replacement, { resetHistory: true });
  assert.equal(editor.undo(), false, 'reading Chrome settings begins a new editing history');
  assert.equal(JSON.stringify(editor.getLayout()), JSON.stringify(composer.normalizeLayout(replacement)));
});

test('successful group scaling changes fixed pixel geometry in editor and runtime', () => {
  const composer = loadComposer();
  const layout = legacyLayout(composer);
  const result = loadResizeEngine(composer).scaleGroup(layout, 1.1);
  assert.equal(result.updated, true, result.reason);
  const runtimeApi = loadRuntimeTestApi();
  const runtime = runtimeApi.normalizeHudLayout(result.layout);
  for (const viewport of [{ width: 960, height: 540 }, { width: 1920, height: 1080 }]) {
    const projection = runtimeApi.projectHudLayout(runtime, viewport);
    assert.equal(projection.scale, 1);
    for (const item of result.layout.components.filter(item => item.present)) {
      const original = composer.getComponent(layout, item.id);
      assert.ok(Math.abs(item.geometry.width - original.geometry.width * 1.1) < 1e-7);
      const saved = runtime.components.find(unit => unit.id === item.id);
      assert.ok(Math.abs(saved.geometry.width - item.geometry.width) < 1e-7);
    }
  }
});


test('enabling alignment preserves the exact position of a locked unit', () => {
  const composer = loadComposer();
  const layout = legacyLayout(composer);
  layout.canvas.alignmentGrid.enabled = false;
  const title = composer.getComponent(layout, 'track-title');
  title.geometry.x += 1 / layout.canvas.width;
  title.locked = true;
  const result = composer.updateAlignment(layout, true);
  assert.deepEqual(JSON.parse(JSON.stringify(composer.getComponent(result, title.id).geometry)), JSON.parse(JSON.stringify(title.geometry)));
});


test('hidden is independent of every color alpha and persists across panel code and runtime', () => {
  const composer = loadComposer();
  const layout = composer.applyPalette(legacyLayout(composer), { primaryOpacity: .25, secondaryOpacity: .4 });
  for (const item of layout.components) { item.hidden = true; item.style.opacity = 0; }
  const restored = composer.importCode(composer.exportCode(layout));
  const runtime = loadRuntimeLayoutNormalizer()(restored);
  for (const item of restored.components) {
    assert.equal(item.hidden, true);
    assert.equal(item.style.opacity, 0);
    assert.equal(item.style.secondaryOpacity, .4);
    assert.equal(runtime.components.find(unit => unit.id === item.id).hidden, true);
  }
  restored.components.forEach(item => { item.hidden = false; });
  const shown = composer.normalizeLayout(restored);
  assert.equal(shown.components.some(item => item.hidden), false);
  assert.equal(shown.components.every(item => item.style.opacity === 0), true);
  assert.equal(composer.toCss(shown.components[0], shown)['--lm-secondary-color'], 'color-mix(in srgb, #63b3ed 40%, transparent)');
  assert.equal(runtime.palette.primaryOpacity, .25);
  assert.equal(runtime.palette.secondaryOpacity, .4);
});

test('font sliders devote their first half to 8–32px and round trip every whole font size', () => {
  const composer = loadComposer();
  assert.equal(composer.fontSizeFromSlider(0), 8);
  assert.equal(composer.fontSizeFromSlider(250), 20);
  assert.equal(composer.fontSizeFromSlider(500), 32);
  assert.equal(composer.fontSizeFromSlider(1000), 192);
  for (let size = 8; size <= 192; size++) assert.equal(composer.fontSizeFromSlider(composer.fontSizeToSlider(size)), size);
});

test('editor edges drag directly, Alt resizes, and editor locks still prevent editing', () => {
  const composer = loadComposer();
  const listeners = {}, timers = new Map(); let nextTimer = 0;
  const document = { activeElement: null, addEventListener() {} };
  const preview = { classList: { add() {}, toggle() {} }, dataset: {}, style: { setProperty() {} },
    parentElement: { clientWidth: 640, clientHeight: 480 }, querySelectorAll() { return []; },
    addEventListener(name, fn) { listeners[name] = fn; }, contains() { return true; },
    getBoundingClientRect() { return { width: 1280, height: 720 }; } };
  const context = { document, YtCdHudLiveMonitorComposer: composer, YtCdHudLiveMonitorResizeEngine: loadResizeEngine(composer),
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
  vm.runInNewContext(read('extension/options/live-monitor-canvas-editor.js'), context);
  const editor = context.YtCdHudLiveMonitorCanvasEditor.createEditor({ preview, layout: legacyLayout(composer) }).init();
  editor.state.layout.canvas.alignmentGrid.enabled = false;
  const disc = () => composer.getComponent(editor.state.layout, 'disc');
  const node = { dataset: { lmComponent: 'disc' }, focus() { document.activeElement = node; }, setPointerCapture() {},
    getBoundingClientRect() { return { left: 108, right: 212, top: 308, bottom: 412, width: 104, height: 104 }; },
    closest(selector) { return selector === '[data-lm-component]' ? node : null; } };
  const event = (x, y) => ({ target: node, clientX: x, clientY: y, button: 0, pointerId: 1, preventDefault() {} });
  const before = JSON.stringify(disc().geometry);
  listeners.pointerdown({ ...event(212, 360), altKey: true });
  listeners.pointermove(event(228, 360));
  assert.equal(disc().geometry.width, 120);
  assert.equal(timers.size, 0);
  listeners.pointercancel(event(228, 360));
  assert.equal(JSON.stringify(disc().geometry), before);
  listeners.pointerdown(event(212, 360));
  for (const [id, fn] of timers) { timers.delete(id); fn(); }
  listeners.pointermove(event(220, 360));
  assert.equal(disc().geometry.width, 104);
  assert.ok(Math.abs(disc().geometry.x * 1280 - 168) < 1e-7);
  listeners.pointerup(event(220, 360));
  editor.setLocked(true);
  const locked = JSON.stringify(editor.getLayout());
  listeners.pointerdown(event(212, 360)); listeners.pointermove(event(250, 360)); listeners.pointerup(event(250, 360));
  assert.equal(JSON.stringify(editor.getLayout()), locked);
  assert.equal(timers.size, 0);
});


test('formal HUD edge drags move every unit together despite editor locks and suppress playback clicks', async () => {
  let writes = 0;
  class Node {
    constructor(rect) { this.rect=rect; this.listeners={}; this.classList={ add() {}, remove() {} }; }
    addEventListener(type, fn) { this.listeners[type]=fn; }
    getBoundingClientRect() { return this.rect; }
    closest() { return null; }
    setPointerCapture() {}
  }
  const api=loadRuntimeTestApi({ document:{ getElementById() {return null;} }, GM_setValue() {writes++;} },true);
  const composer=loadComposer();
  const initial=loadLayoutPresets(composer).createBundledLayout('full');
  initial.locked=true; initial.components.forEach(item=>{item.locked=true;});
  const player={clientWidth:1280,clientHeight:720};
  for(const id of initial.components.filter(item=>item.present).map(item=>item.id)) {
    api.setRuntimeLayout(initial);
    const before=JSON.parse(JSON.stringify(api.getRuntimeLayout()));
    const bounds=composer.componentRect(before.components.find(item=>item.id===id).geometry,before.canvas);
    const unit=new Node({...bounds,width:bounds.right-bounds.left,height:bounds.bottom-bounds.top});
    api.bindRuntimeLayoutUnitDragging(unit,player,id);
    const event=(x,y)=>({target:unit,clientX:x,clientY:y,button:0,pointerId:1,preventDefault(){},stopImmediatePropagation(){}});
    const x=bounds.right-1,y=(bounds.top+bounds.bottom)/2;
    unit.listeners.pointerdown(event(x,y));unit.listeners.pointermove(event(x+16,y+8));unit.listeners.pointerup(event(x+16,y+8));
    const after=api.getRuntimeLayout();
    assert.equal(after.locked,true);
    for(const previous of before.components.filter(item=>item.present)) {
      const actual=after.components.find(item=>item.id===previous.id);
      assert.deepEqual(JSON.parse(JSON.stringify(actual.geometry)),previous.geometry,id+': preserves '+previous.id);
      assert.equal(actual.geometry.width,previous.geometry.width);assert.equal(actual.geometry.height,previous.geometry.height);
      assert.equal(actual.locked,true);
    }
    const beforeRoot=api.projectHudLayout(before,{width:1280,height:720}).root;
    const afterRoot=api.projectHudLayout(after,{width:1280,height:720}).root;
    assert.ok(Math.abs(afterRoot.left-beforeRoot.left-16)<1e-7);
    assert.ok(Math.abs(afterRoot.top-beforeRoot.top-8)<1e-7);
    let suppressed=false;unit.listeners.click({preventDefault(){suppressed=true;},stopImmediatePropagation(){}});assert.equal(suppressed,true);
    const saved=JSON.stringify(after);
    unit.listeners.pointerdown(event(x,y));unit.listeners.pointermove(event(x+24,y+16));unit.listeners.pointercancel(event(x+24,y+16));
    assert.equal(JSON.stringify(api.getRuntimeLayout()),saved,'cancel restores entire assembly');
    const center=event((bounds.left+bounds.right)/2,y);
    if(id!=='panel-base') {
      unit.listeners.pointerdown(center);unit.listeners.pointermove({...center,clientX:center.clientX+16});unit.listeners.pointerup(center);
      assert.equal(JSON.stringify(api.getRuntimeLayout()),saved,'center retains control interaction');
      let blocked = false;
      unit.listeners.click({preventDefault(){blocked=true;},stopImmediatePropagation(){}});
      assert.equal(blocked,false,'a cancelled drag must not swallow the next playback click');
    }
    const menu=event(x,y);menu.target={closest:selector=>selector==='.hud-1001-menu'?{}:null};
    unit.listeners.pointerdown(menu);unit.listeners.pointermove(event(x+16,y));unit.listeners.pointerup(event(x+16,y));
    assert.equal(JSON.stringify(api.getRuntimeLayout()),saved,'menu never starts assembly drag');
    if(id==='panel-base') {
      unit.listeners.pointerdown(center);unit.listeners.pointermove({...center,clientX:center.clientX+16});unit.listeners.pointerup(center);
      assert.notEqual(JSON.stringify(api.getRuntimeLayout()),saved,'exposed base center also drags the assembly');
      assert.equal(JSON.stringify(api.getRuntimeLayout().components),JSON.stringify(after.components));
    }
  }
  assert.ok(writes >= initial.components.filter(item => item.present).length,
    'every remaining visible component persists an assembly drag');
});

test('assembly translation preserves split controls and starts from the visible clamped position',()=>{
  const composer=loadComposer();const api=loadRuntimeTestApi({},true);
  const layout=loadLayoutPresets(composer).createBundledLayout('full');
  const transport=composer.getComponent(layout,'transport-controls');
  transport.arrangement.split=true;
  transport.arrangement.partSize={width:72,height:48};
  transport.arrangement.positions={previous:{x:.4,y:.5},next:{x:.47,y:.5}};
  layout.locked=true;
  const before=api.normalizeHudLayout(layout),viewport={width:900,height:600};
  const moved=api.translateRuntimeAssembly(before,16,8,viewport);
  assert.ok(moved);
  const first=api.projectHudLayout(before,viewport),second=api.projectHudLayout(moved,viewport);
  assert.ok(Math.abs(second.root.left-first.root.left-16)<1e-7);
  assert.ok(Math.abs(second.root.top-first.root.top-8)<1e-7);
  const a=before.components.find(item=>item.id===transport.id),b=moved.components.find(item=>item.id===transport.id);
  for(const part of ['previous','next'])assert.ok(Math.abs((b.arrangement.positions[part].x-a.arrangement.positions[part].x)-(b.geometry.x-a.geometry.x))<1e-7);
  const clamped=api.translateRuntimeAssembly(before,-9999,-9999,viewport);
  assert.ok(clamped);assert.ok(Math.abs(api.projectHudLayout(clamped,viewport).root.left)<1e-7);assert.ok(Math.abs(api.projectHudLayout(clamped,viewport).root.top)<1e-7);
});

test('disc opacity persists independently of its background and hidden state',()=>{
  const composer=loadComposer(),runtime=loadRuntimeLayoutNormalizer();
  const source=legacyLayout(composer);const disc=composer.getComponent(source,'disc');
  disc.style.opacity=.75;
  for(const [value,expected] of [[0,0],[.35,.35],[1,1],[-1,0],[2,1],['invalid',1]]){
    disc.style.discOpacity=value;
    const restored=composer.importCode(composer.exportCode(source));
    const actual=composer.getComponent(restored,'disc');
    assert.equal(actual.style.discOpacity,expected);
    assert.equal(actual.style.opacity,.75);assert.notEqual(actual.hidden,true);
    assert.equal(runtime(restored).components.find(item=>item.id==='disc').style.discOpacity,expected);
    assert.equal(composer.toCss(actual,restored)['--lm-disc-opacity'],String(expected));
  }
  delete disc.style.discOpacity;
  assert.equal(composer.toCss(composer.getComponent(composer.normalizeLayout(source),'disc'))['--lm-disc-opacity'],'1');
});

test('studio viewport resizing retains actual pixel sizes and view origin without scrollbars',()=>{
  const composer=loadComposer();let resized;
  const host={clientWidth:640,clientHeight:360};
  const preview={parentElement:host,style:{setProperty(){}},dataset:{},classList:{add(){},toggle(){}},querySelectorAll(){return[];},addEventListener(){}};
  const context={YtCdHudLiveMonitorComposer:composer,document:{addEventListener(){}},ResizeObserver:class{constructor(callback){resized=callback;}observe(target){assert.equal(target,host);}}};
  vm.runInNewContext(read('extension/options/live-monitor-canvas-editor.js'),context);
  const editor=context.YtCdHudLiveMonitorCanvasEditor.createEditor({preview,layout:legacyLayout(composer)}).init();
  const before=JSON.stringify(editor.getLayout());
  assert.equal(preview.style.transform,'none');
  const origin=[preview.style.left,preview.style.top];
  host.clientWidth=960;host.clientHeight=720;resized();
  assert.equal(preview.style.transform,'none');
  assert.deepEqual([preview.style.left,preview.style.top],origin);
  assert.equal(preview.style.width,'1280px'); assert.equal(preview.style.height,'720px');
  assert.equal(JSON.stringify(editor.getLayout()),before);
  const css=read('extension/options/options.css');
  assert.match(css,/\.preview-stage\s*\{[^}]*overflow:\s*hidden;[^}]*resize:\s*both;/);
  assert.doesNotMatch(css,/\.preview-stage\s*\{[^}]*overflow:\s*auto/);
});

test('dragging the editor base moves its assembly at preview scale and cancellation restores all units',()=>{
  const composer=loadComposer(),listeners={};
  const layout=loadLayoutPresets(composer).createBundledLayout('full');
  composer.getComponent(layout,'disc').locked=true;
  const document={activeElement:null,addEventListener(){}};
  const preview={parentElement:{clientWidth:640,clientHeight:360},style:{setProperty(){}},dataset:{},classList:{add(){},toggle(){}},
    querySelectorAll(){return[];},addEventListener(name,fn){listeners[name]=fn;},contains(){return true;},getBoundingClientRect(){return{width:640,height:360};}};
  const context={document,YtCdHudLiveMonitorComposer:composer};
  vm.runInNewContext(read('extension/options/live-monitor-canvas-editor.js'),context);
  let selectedComponent;
  const editor=context.YtCdHudLiveMonitorCanvasEditor.createEditor({preview,layout,onSelect(_id,component){selectedComponent=component;}}).init();
  const before=JSON.parse(JSON.stringify(editor.getLayout()));
  const node={dataset:{lmComponent:'panel-base'},focus(){},setPointerCapture(){},
    closest(selector){return selector==='[data-lm-component]'?node:null;},getBoundingClientRect(){return{left:160,right:480,top:100,bottom:260,width:320,height:160};}};
  const event=(x,y)=>({target:node,clientX:x,clientY:y,button:0,pointerId:1,preventDefault(){}});
  listeners.pointerdown(event(479,180));listeners.pointermove(event(487,184));
  for(const unit of before.components.filter(item=>item.present)){
    const moved=composer.getComponent(editor.state.layout,unit.id);
    assert.ok(Math.abs((moved.geometry.x-unit.geometry.x)*1280-16)<1e-7);
    assert.ok(Math.abs((moved.geometry.y-unit.geometry.y)*720-8)<1e-7);
    assert.equal(moved.geometry.width,unit.geometry.width);
  }
  assert.equal(composer.getComponent(editor.state.layout,'disc').locked,true);
  listeners.pointercancel(event(487,184));
  assert.deepEqual(JSON.parse(JSON.stringify(editor.getLayout())),before);
  assert.equal(selectedComponent,composer.getComponent(editor.state.layout,'panel-base'),'cancellation refreshes toolbar references');
  listeners.pointerdown(event(479,180));listeners.pointermove(event(486,185));listeners.pointerup(event(486,185));
  assert.equal(selectedComponent,composer.getComponent(editor.state.layout,'panel-base'),'completed assembly movement refreshes toolbar references');
  const stored=editor.getLayout();
  for(const unit of editor.state.layout.components.filter(item=>item.present)) {
    const saved=composer.getComponent(stored,unit.id).geometry;
    for(const key of ['x','y','width','height','z']) {
      assert.ok(Math.abs(saved[key]-unit.geometry[key])<1e-9,'saving must preserve the displayed '+unit.id+' '+key);
    }
  }
});

test('DB menu has independent width limits and wrapping labels',()=>{
  const source=read('src/youtube-cd-hud.user.js');
  assert.match(source,/\.hud-1001-menu\s*\{[^}]*width:\s*max-content;[^}]*min-width:\s*min\(240px, calc\(100vw - 24px\)\);/);
  assert.match(source,/#yt-cd-hud \.hud-1001-menu :where\([^}]+white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/);
});

test('saving raises menu owners, preserves locks and positions, and is stable at the layer ceiling', async()=>{
  const composer=loadComposer();
  for(const z of [0,20,99]) {
    const layout=loadLayoutPresets(composer).createBundledLayout('full');
    layout.locked=true; layout.components.forEach(item=>{item.locked=true;});
    const list=composer.getComponent(layout,'tracklist-panel');list.layer.enabled=true;list.geometry.z=z;
    const before=JSON.stringify(layout);
    const prepared=composer.prepareForSave(layout);
    const menu=composer.getComponent(prepared,'source-selector');
    assert.ok(prepared.components.filter(i=>i.present&&i.id!==menu.id).every(i=>i.geometry.z<menu.geometry.z));
    assert.equal(JSON.stringify(layout),before,'does not mutate caller');
    assert.equal(JSON.stringify(composer.prepareForSave(prepared)),JSON.stringify(prepared));
    for(const item of prepared.components) {
      const original=composer.getComponent(layout,item.id);
      assert.equal(item.locked,true);
      for(const key of ['x','y','width','height'])assert.equal(item.geometry[key],original.geometry[key]);
    }
    let saved;
    const context={crypto:{randomUUID},YtCdHudOptionsHost:{async apply({baseRevision,payload}){assert.equal(baseRevision,'test-base');saved=payload.layout;return {status:'STORED',snapshot:{layout:saved}};}},YtCdHudLiveMonitorComposer:composer};
    vm.runInNewContext(read('extension/options/live-monitor-layout-store.js'),context);
    await context.YtCdHudLiveMonitorLayoutStore.save(layout,'test-base');
    assert.equal(JSON.stringify(saved),JSON.stringify(prepared));
    const runtime=loadRuntimeLayoutNormalizer()(saved);
    assert.equal(runtime.components.find(i=>i.id===menu.id).geometry.z,menu.geometry.z);
  }
  const source=read('src/youtube-cd-hud.user.js');
  assert.match(source,/\.hud-source-selector\.ytcd-menu-open\s*\{\s*z-index:\s*1000/);
  assert.match(source,/classList\.toggle\('ytcd-menu-open', expanded\)/);
});

test('assembly anchors reach a large player boundary without altering any component geometry',()=>{
  const composer=loadComposer(),api=loadRuntimeTestApi({},true);
  const original=api.normalizeHudLayout(loadLayoutPresets(composer).createBundledLayout('full'));
  const viewport={width:2560,height:1440};
  const moved=api.translateRuntimeAssembly(original,9999,9999,viewport);
  assert.deepEqual(moved.components,original.components);
  assert.equal(moved.placement.x,1);assert.equal(moved.placement.y,1);
  const root=api.projectHudLayout(moved,viewport).root;
  assert.equal(root.left+root.width,2560);assert.equal(root.top+root.height,1440);
  const restored=api.normalizeHudLayout(composer.importCode(composer.exportCode(moved)));
  assert.deepEqual(restored.placement,moved.placement);
  const back=api.translateRuntimeAssembly(restored,-16,-8,viewport);
  const backRoot=api.projectHudLayout(back,viewport).root;
  assert.equal(backRoot.left,root.left-16);assert.equal(backRoot.top,root.top-8);
  assert.deepEqual(back.components,original.components);
});

test('panning the studio changes only the view and remains available while the panel is locked',()=>{
  const composer=loadComposer(),listeners={};
  const host={clientWidth:640,clientHeight:360,classList:{add(){},remove(){}},setPointerCapture(){},
    addEventListener(name,fn){listeners[name]=fn;},getBoundingClientRect(){return{right:640,bottom:360};}};
  const preview={parentElement:host,style:{setProperty(){}},dataset:{},classList:{add(){},toggle(){}},querySelectorAll(){return[];},addEventListener(){}};
  const context={YtCdHudLiveMonitorComposer:composer,document:{addEventListener(){}}};
  vm.runInNewContext(read('extension/options/live-monitor-canvas-editor.js'),context);
  const editor=context.YtCdHudLiveMonitorCanvasEditor.createEditor({preview,layout:legacyLayout(composer)}).init();
  editor.setLocked(true);
  const before=JSON.stringify(editor.getLayout()),x=parseFloat(preview.style.left),y=parseFloat(preview.style.top);
  const event=(clientX,clientY)=>({clientX,clientY,pointerId:1,button:0,target:{closest(){return null;}},preventDefault(){}});
  listeners.pointerdown(event(100,100));listeners.pointermove(event(140,120));listeners.pointerup(event(140,120));
  assert.equal(parseFloat(preview.style.left),x+40);assert.equal(parseFloat(preview.style.top),y+20);
  assert.equal(JSON.stringify(editor.getLayout()),before);
  listeners.pointerdown(event(100,100));listeners.pointermove(event(200,200));listeners.pointercancel(event(200,200));
  assert.equal(parseFloat(preview.style.left),x+40);assert.equal(parseFloat(preview.style.top),y+20);
  listeners.pointerdown(event(635,355));listeners.pointermove(event(630,340));
  assert.equal(parseFloat(preview.style.left),x+40,'native resize corner does not pan');
  const rect=context.YtCdHudLiveMonitorCanvasEditor.referencePlayerRect(editor.state.layout.canvas);
  assert.equal(x,host.clientWidth/2-rect.left-rect.width/2);
  assert.equal(y,host.clientHeight/2-rect.top-rect.height/2);
  editor.centerView();
  assert.equal(JSON.stringify(editor.getLayout()),before);
  for (const [width,height] of [[1280,720],[1920,1080],[3840,2160]]) {
    editor.updateViewport(width,height);
    const player=context.YtCdHudLiveMonitorCanvasEditor.referencePlayerRect(editor.state.layout.canvas);
    assert.equal(parseFloat(preview.style.left)+player.left+player.width/2,host.clientWidth/2);
    assert.equal(parseFloat(preview.style.top)+player.top+player.height/2,host.clientHeight/2);
    assert.equal(preview.style.width,width+'px');
    assert.equal(preview.style.transform,'none');
  }
});

test('dimension number inputs ceil fractional pixels and retain that size on save', () => {
  const composer = loadComposer();
  const layout = legacyLayout(composer);
  const disc = composer.getComponent(layout, 'disc');
  const placement = composer.sizeFromInput(layout, 'disc', null, 'width', '120.2');
  assert.equal(placement.valid, true);
  assert.equal(placement.geometry.width, 121);
  layout.canvas.alignmentGrid.enabled = false;
  composer.applyInteractionGeometry(disc, null, placement.geometry);
  assert.equal(composer.getComponent(composer.normalizeLayout(layout), 'disc').geometry.width, 121);
  assert.equal(composer.sizeFromInput(layout, 'disc', null, 'height', '120').geometry.height, 120);
  for (const value of ['', 'NaN', '-3', '99999']) assert.equal(composer.sizeFromInput(layout, 'disc', null, 'width', value).valid, false);
  disc.locked = true;
  assert.equal(composer.sizeFromInput(layout, 'disc', null, 'width', '130.5').valid, false);
});


test('numbered slots persist across instances, migrate legacy slots and reset only 0–3', async () => {
  const composer = loadComposer();
  const legacy = composer.createDefaultLayout();
  legacy.palette.primaryColor = '#123456';
  const state = {};
  const chrome = { storage: {
    local: { async get(key) { return { [key]: state[key] }; }, async set(value) { Object.assign(state, structuredClone(value)); } },
    session: { async get(key) { return { [key]: { A: legacy } }; } },
  } };
  const first = loadLayoutPresets(composer, { chrome });
  const initial = await first.readSlots();
  assert.equal(initial['4'].palette.primaryColor, '#123456');
  assert.ok(state[first.STORAGE_KEY]);
  const customized = { ...initial, '0': legacy, '1': legacy, '9': legacy };
  await first.writeSlots(customized);
  const second = loadLayoutPresets(composer, { chrome });
  assert.equal((await second.readSlots())['9'].palette.primaryColor, '#123456');
  await second.resetSlots();
  const restored = await first.readSlots();
  assert.equal(JSON.stringify(restored['0']), JSON.stringify(composer.createDefaultLayout()));
  for (const [index, id] of ['full', 'compact', 'invisible'].entries()) {
    assert.equal(JSON.stringify(restored[String(index + 1)]), JSON.stringify(first.createBundledLayout(id)));
  }
  assert.equal(restored['4'].palette.primaryColor, '#123456');
  assert.equal(restored['9'].palette.primaryColor, '#123456');
});

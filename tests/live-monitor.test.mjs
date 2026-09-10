import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

function loadComposer() {
  const context = { console, Object, JSON, Number, Math, Set, Map };
  vm.runInNewContext(read('extension/options/live-monitor-composer.js'), context);
  return context.YtCdHudLiveMonitorComposer;
}

function loadRuntimeTestApi() {
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
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('src/youtube-cd-hud.user.js'), sandbox);
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
    chrome: { storage: { session: {
      async get(key) { return { [key]: state[key] }; },
      async set(value) { Object.assign(state, value); },
    } } },
    ...overrides,
  };
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
  const layout = composer.createDefaultLayout();
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
  const layout = composer.createDefaultLayout();
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
  const layout = composer.createDefaultLayout();
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
  assert.deepEqual(JSON.parse(JSON.stringify(composer.clampSize('disc', 1, 9999))), { width: 60, height: 720 });
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
  const layout = composer.createDefaultLayout();
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

test('keeps A/B/C layouts in browser-session storage and normalizes restored data', async () => {
  const composer = loadComposer();
  const presets = loadLayoutPresets(composer);
  const layout = composer.createDefaultLayout();
  composer.getComponent(layout, 'track-title').style.opacity = .55;
  await presets.writeSlots({ A: layout, ignored: layout });
  const slots = await presets.readSlots();
  assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(slots))), ['A']);
  assert.equal(composer.getComponent(slots.A, 'track-title').style.opacity, .55);
  assert.equal(presets.STORAGE_KEY, 'ytCdHudLayoutSlotsV1');
});

test('ships two fresh built-in panels without relying on session slots', async () => {
  const composer = loadComposer();
  const presets = loadLayoutPresets(composer);
  assert.deepEqual([...presets.BUNDLED_PRESETS].map(preset => preset.id), ['compact-playback', 'tracklist-reader']);
  assert.deepEqual(Object.keys(await presets.readSlots()), []);
  assert.equal(presets.createBundledLayout('unknown'), null);
  const compact = presets.createBundledLayout('compact-playback');
  const reader = presets.createBundledLayout('tracklist-reader');
  assert.equal(composer.getComponent(compact, 'tracklist-panel').present, false);
  assert.equal(composer.getComponent(reader, 'tracklist-panel').present, true);
  assert.ok(composer.getComponent(compact, 'panel-base').geometry.width < composer.getComponent(reader, 'panel-base').geometry.width);
  assert.ok(composer.getComponent(reader, 'track-title').textStyle.fontSize > composer.getComponent(compact, 'track-title').textStyle.fontSize);
  composer.getComponent(compact, 'track-title').textStyle.fontSize = 99;
  await presets.writeSlots({ A: compact });
  assert.equal(composer.getComponent(presets.createBundledLayout('compact-playback'), 'track-title').textStyle.fontSize, 18);
  const nextSession = loadLayoutPresets(composer);
  assert.deepEqual(Object.keys(await nextSession.readSlots()), []);
  assert.deepEqual(JSON.parse(JSON.stringify(nextSession.createBundledLayout('tracklist-reader'))), JSON.parse(JSON.stringify(reader)));
});

test('built-in panels survive storage and runtime normalization with usable geometry', async () => {
  const composer = loadComposer();
  const presets = loadLayoutPresets(composer);
  const runtimeNormalize = loadRuntimeLayoutNormalizer();
  const storage = {};
  const context = { console, YtCdHudLiveMonitorComposer: composer, chrome: { storage: { local: {
    async get() { return JSON.parse(JSON.stringify(storage)); },
    async set(value) { Object.assign(storage, JSON.parse(JSON.stringify(value))); },
  } } } };
  vm.runInNewContext(read('extension/options/live-monitor-layout-store.js'), context);
  const store = context.YtCdHudLiveMonitorLayoutStore;
  for (const preset of presets.BUNDLED_PRESETS) {
    const layout = presets.createBundledLayout(preset.id);
    for (const id of ['panel-base', 'disc', 'track-title', 'time-readout', 'source-selector', 'transport-controls', 'tracklist-toggle', 'close-control']) {
      assert.equal(composer.getComponent(layout, id).present, true, preset.id + ': ' + id);
    }
    for (const component of layout.components.filter(item => item.present && item.boundary?.collision)) {
      assert.equal(composer.collisionFor(component, layout.components, layout.canvas), null);
      const rect = composer.componentRect(component.geometry, layout.canvas);
      assert.ok(rect.left >= 0 && rect.top >= 0 && rect.right <= layout.canvas.width && rect.bottom <= layout.canvas.height);
    }
    await store.save(layout);
    assert.deepEqual(JSON.parse(JSON.stringify(await store.load())), JSON.parse(JSON.stringify(layout)));
    const runtime = runtimeNormalize(storage[composer.STORAGE_KEY]);
    for (const component of layout.components) {
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
    assert.equal(createHash('sha256').update(JSON.stringify(canonical(layout))).digest('hex'), digest, id);
    const normalized = composer.normalizeLayout(layout);
    assert.equal(createHash('sha256').update(JSON.stringify(canonical(normalized))).digest('hex'), digest, id + ' after reload');
  }
});

test('ignores coordinate roundoff at touching edges while detecting real overlaps', () => {
  const composer = loadComposer();
  const first = { left: 0, right: 100 + 1e-12, top: 0, bottom: 48 };
  assert.equal(composer.rectsOverlap(first, { left: 100, right: 200, top: 0, bottom: 48 }), false);
  assert.equal(composer.rectsOverlap(first, { left: 99.9, right: 200, top: 0, bottom: 48 }), true);
});

test('loading a built-in panel previews it and leaves storage untouched until explicit save', async () => {
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.listeners = {}; }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.append(item); return item; }
    replaceChildren(...items) { this.children = items; }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
  }
  const composer = loadComposer();
  const storedLayout = composer.createDefaultLayout();
  composer.getComponent(storedLayout, 'track-title').textStyle.fontSize = 31;
  let writes = 0;
  const presets = loadLayoutPresets(composer, {
    document: { createElement: tag => new Element(tag), getElementById: () => null, documentElement: { lang: 'en' } },
    chrome: { storage: { session: {
      async get(key) { return { [key]: { A: storedLayout } }; },
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
  const buttons = descendants(controls.element).filter(element => element.dataset.lmBundledPreset);
  assert.equal(buttons.length, 2);
  for (const button of buttons) {
    button.listeners.click();
    assert.deepEqual(JSON.parse(JSON.stringify(editor.state.layout)), JSON.parse(JSON.stringify(presets.createBundledLayout(button.dataset.lmBundledPreset))));
  }
  assert.deepEqual(changes, ['bundled-preset-load', 'bundled-preset-load']);
  assert.equal(writes, 0);
  assert.equal(composer.getComponent((await controls.readSlots()).A, 'track-title').textStyle.fontSize, 31);
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
  const initial = composer.createDefaultLayout();
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

test('dynamic panel base encloses bounded units, ignores the disc, and stays below every layer', () => {
  const composer = loadComposer();
  const layout = composer.createDefaultLayout();
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
  const initial = composer.createDefaultLayout();
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
    'tracklist-toggle', 'transport-controls', 'close-control', 'text-size-control', 'tracklist-panel',
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
  assert.match(presets, /Object\.freeze\(\['A', 'B', 'C'\]\)/);
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
  const layout = composer.createDefaultLayout();
  const runtime = normalizeRuntime(layout);
  assert.equal(runtime.version, 2);
  assert.equal(runtime.canvas.collisionPolicy, 'no-overlap-closed');
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.canvas.alignmentGrid)), { enabled: true, unitWidth: 8, unitHeight: 8, visible: false });
  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.components.map(component => component.id))),
    JSON.parse(JSON.stringify(layout.components.map(component => component.id))),
  );
  const title = runtime.components.find(component => component.id === 'track-title');
  assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(title))), ['id', 'type', 'present', 'geometry', 'layer', 'boundary', 'style', 'textStyle', 'effects']);
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
  const editorLayout = composer.createDefaultLayout();
  const runtimeDefaults = runtimeApi.normalizeHudLayout(null);
  const runtimeLayout = runtimeApi.normalizeHudLayout(editorLayout);

  assert.deepEqual(
    JSON.parse(JSON.stringify(runtimeDefaults.components.map(component => component.geometry))),
    JSON.parse(JSON.stringify(editorLayout.components.map(component => component.geometry))),
  );

  const projection = runtimeApi.projectHudLayout(runtimeLayout, { width: 960, height: 540 });
  assert.equal(projection.scale, 0.75);
  assert.deepEqual(JSON.parse(JSON.stringify(projection.canvas)), { left: 0, top: 0, width: 960, height: 540 });

  for (const component of runtimeLayout.components.filter(component => component.id !== 'panel-base')) {
    const projected = runtimeApi.projectHudGeometry(component.geometry, projection);
    const actualCenterX = projection.root.left + projected.x / 100 * projection.root.width;
    const actualCenterY = projection.root.top + projected.y / 100 * projection.root.height;
    assert.ok(Math.abs(actualCenterX - component.geometry.x * 960) < 1e-9, `${component.id} x drifted`);
    assert.ok(Math.abs(actualCenterY - component.geometry.y * 540) < 1e-9, `${component.id} y drifted`);
    assert.ok(Math.abs(projected.width / 100 * projection.root.width - component.geometry.width * 0.75) < 1e-9, `${component.id} width drifted`);
    assert.ok(Math.abs(projected.height / 100 * projection.root.height - component.geometry.height * 0.75) < 1e-9, `${component.id} height drifted`);
  }

  const tracklist = runtimeLayout.components.find(component => component.id === 'tracklist-panel');
  const canvasTracklist = runtimeApi.projectCanvasGeometry(tracklist.geometry, projection);
  assert.deepEqual(JSON.parse(JSON.stringify(canvasTracklist)), { left: 699, top: 24, width: 210, height: 192 });

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
  assert.match(toolbar, /input\.min = String\(rule\.opacityMinimum \?\? \.2\)/);
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
  assert.equal(title.geometry.height, 272);
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

  const defaults = composer.createDefaultLayout();
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
  assert.equal(transport.arrangement.partSize.height, 272);
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
    assert.ok(component.geometry.height >= 272, `${rule.type} cannot contain the 192px maximum text line`);
  }
  const layout = composer.createDefaultLayout();
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
  const initial = composer.createDefaultLayout();
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

test('switches 16:9 viewport presets with distinct absolute and relative size semantics', () => {
  const composer = loadComposer();
  assert.deepEqual(JSON.parse(JSON.stringify(composer.VIEWPORT_PRESETS.map(({ width, height }) => [width, height]))), [[1280, 720], [1920, 1080], [3840, 2160]]);
  const initial = composer.createDefaultLayout();
  const initialTitle = composer.getComponent(initial, 'track-title');
  const absolute = composer.updateViewport(initial, 1920, 1080);
  assert.equal(absolute.canvas.sizingMode, 'absolute');
  assert.equal(composer.getComponent(absolute, 'track-title').geometry.width, initialTitle.geometry.width);
  assert.ok(composer.getComponent(absolute, 'track-title').geometry.width / absolute.canvas.width < initialTitle.geometry.width / initial.canvas.width);

  const relative = composer.updateViewport(composer.updateSizingMode(initial, 'relative'), 1920, 1080);
  assert.equal(relative.canvas.sizingMode, 'relative');
  assert.equal(composer.getComponent(relative, 'track-title').geometry.width, initialTitle.geometry.width * 1.5);
  assert.equal(composer.getComponent(relative, 'track-title').textStyle.fontSize, initialTitle.textStyle.fontSize * 1.5);
  assert.equal(composer.getComponent(relative, 'track-title').geometry.width / relative.canvas.width, initialTitle.geometry.width / initial.canvas.width);
  assert.equal(composer.getComponent(relative, 'track-title').geometry.x, initialTitle.geometry.x);
  assert.equal(composer.getComponent(relative, 'track-title').geometry.y, initialTitle.geometry.y);
  assert.deepEqual(JSON.parse(JSON.stringify(relative.canvas.alignmentGrid)), { enabled: true, unitWidth: 12, unitHeight: 12, visible: false });
  const uhd = composer.updateViewport(relative, 3840, 2160);
  assert.equal(composer.getComponent(uhd, 'track-title').geometry.width, initialTitle.geometry.width * 3);
  assert.equal(composer.getComponent(uhd, 'track-title').geometry.height, initialTitle.geometry.height * 3);
  assert.equal(composer.getComponent(uhd, 'track-title').textStyle.fontSize, initialTitle.textStyle.fontSize * 3);
  assert.deepEqual(JSON.parse(JSON.stringify(uhd.canvas.alignmentGrid)), { enabled: true, unitWidth: 24, unitHeight: 24, visible: false });
});

test('exposes the foundation palette, viewport, sizing mode, and English alignment abbreviations', () => {
  const presets = read('extension/options/live-monitor-layout-presets.js');
  const toolbar = read('extension/options/live-monitor-property-toolbar.js');
  const css = read('extension/options/options.css');
  assert.match(presets, /dataset\.lmPalette = 'primaryColor'/);
  assert.match(presets, /dataset\.lmPalette = 'secondaryColor'/);
  assert.match(presets, /dataset\.lmCanvasPreset = 'true'/);
  assert.match(presets, /\['absolute', 'ABS · PX'\]/);
  assert.match(presets, /\['relative', 'REL · %'\]/);
  assert.match(toolbar, /left: 'LFT', right: 'RGT', center: 'CTR', justify: 'JST'/);
  assert.doesNotMatch(toolbar, /左對齊|右對齊|置中|平均分散/);
  assert.match(css, /text-shadow:\s*0 0 6px color-mix\(in srgb, var\(--lm-secondary-color\)/);
  assert.match(css, /background:\s*color-mix\(in srgb, var\(--lm-background-color\) calc\(var\(--lm-unit-opacity\) \* 100%\), transparent\)/);
  assert.match(read('extension/options/live-monitor-canvas-editor.css'), /\.preview-disc\s*\{[\s\S]*?opacity:\s*var\(--lm-unit-opacity\)/);
  assert.match(read('src/youtube-cd-hud.user.js'), /\.cd-disc-wrapper\s*\{[\s\S]*?opacity:\s*var\(--ytcd-unit-opacity\)/);
  assert.match(toolbar, /Text size · REL/);
  assert.match(toolbar, /Text size · PX/);
  assert.match(toolbar, /SHOW BORDER/);
  assert.match(toolbar, /ROUND CORNERS/);
  assert.match(toolbar, /Corner radius · 1–10/);
  assert.match(toolbar, /BG BLUR/);
  assert.match(toolbar, /input\.max = String\(textLimits\.maximum\)/);
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
  assert.match(previewCss, /\.preview-title\.lm-effect-marquee:hover[\s\S]*?animation:\s*lm-preview-title-marquee/);
  assert.match(runtime, /\.hud-chapter\.ytcd-effect-marquee:hover[\s\S]*?animation:\s*ytcd-title-marquee/);
});

test('enables bounded runtime dragging for non-button units and persists the canonical layout', () => {
  const source = read('src/youtube-cd-hud.user.js');
  assert.match(source, /\['track-title', 'time-readout', 'tracklist-panel'\]\.includes\(id\)/);
  assert.match(source, /function bindRuntimeLayoutUnitDragging/);
  assert.match(source, /Math\.hypot\(deltaX, deltaY\) < 3/);
  assert.match(source, /runtimeOverlapGroup\(componentId\)/);
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

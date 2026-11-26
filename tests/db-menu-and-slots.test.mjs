import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function makeRuntimeContext() {
    const c = {
        navigator: { languages: ['zh-TW'], language: 'zh-TW' },
        __YT_CD_HUD_TEST_MODE__: true,
        console, setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams,
    };
    c.window = c;
    c.globalThis = c;
    vm.createContext(c);
    vm.runInContext(read('extension/options/live-monitor-composer.js'), c);
    vm.runInContext(read('src/youtube-cd-hud.user.js'), c);
    return c;
}

function makeFakeDom() {
    const byId = new Map();
    const doc = {
        documentElement: { lang: 'zh-TW' },
        body: null,
        getElementById: id => byId.get(id) || null,
        querySelector: () => null,
        addEventListener() {},
        removeEventListener() {},
        createElement(tag) {
            const el = {
                tagName: tag.toUpperCase(),
                children: [],
                dataset: {},
                style: { setProperty() {}, removeProperty() {} },
                attributes: {},
                handlers: {},
                value: '',
                textContent: '',
                title: '',
                disabled: false,
                className: '',
                classList: { add() {}, remove() {}, toggle() {} },
                appendChild(n) { el.children.push(n); n.parentNode = el; return n; },
                append(...ns) { ns.forEach(n => el.appendChild(n)); },
                replaceChildren() { el.children = []; },
                setAttribute(k, v) { el.attributes[k] = String(v); },
                getAttribute(k) { return el.attributes[k] ?? null; },
                addEventListener(k, fn) { el.handlers[k] = fn; },
                remove() {},
                focus() {},
                querySelectorAll(sel) {
                    const all = el.children.flatMap(n => [n, ...n.querySelectorAll(sel)]);
                    if (sel === '*') return all;
                    return all.filter(n => n.tagName.toLowerCase() === sel.toLowerCase() || (sel.startsWith('.') && n.className.split(/\s+/).includes(sel.slice(1))));
                },
                querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
                checkValidity() { return true; },
                reportValidity() {},
            };
            Object.defineProperty(el, 'innerHTML', { set() {} });
            return el;
        },
    };
    doc.body = doc.createElement('body');
    return doc;
}

test('db-menu is an independently designable role across Skin, Composer, Studio HTML and runtime', () => {
    const c = makeRuntimeContext();
    const co = c.YtCdHudLiveMonitorComposer;
    const layout = co.createDefaultLayout();
    const dbMenu = co.getComponent(layout, 'db-menu');
    assert.ok(dbMenu, 'db-menu component must exist');
    assert.equal(dbMenu.present, false, 'db-menu defaults to absent until customized');
    dbMenu.present = true;
    dbMenu.style.backgroundColor = '#112233';
    dbMenu.style.opacity = 0.85;
    dbMenu.textStyle.fontSize = 15;
    co.refreshSkin(layout);
    const normalized = c.__YT_CD_HUD_TEST_EXPORTS__.normalizeHudLayout(layout);
    const rtDbMenu = normalized.components.find(x => x.id === 'db-menu');
    assert.equal(rtDbMenu.present, true);
    assert.equal(rtDbMenu.style.backgroundColor, '#112233');
    assert.equal(rtDbMenu.textStyle.fontSize, 15);
    assert.match(read('extension/options/options.html'), /data-lm-component="db-menu"/);
    assert.match(read('extension/options/options.css'), /\.preview-db-menu\s*\{/);
});

test('computeDbMenuPosition avoids viewport overflow, anchor overlap, and visible HUD obstacles', () => {
    const { computeDbMenuPosition } = makeRuntimeContext().__YT_CD_HUD_TEST_EXPORTS__;
    // Near bottom-right edge with tracklist below: should flip left/above and stay within viewport margins.
    const posEdge = computeDbMenuPosition({
        anchorRect: { left: 1180, top: 650, right: 1260, bottom: 680 },
        menuSize: { width: 260, height: 220 },
        viewport: { width: 1280, height: 720 },
        obstacles: [],
    });
    assert.ok(posEdge.left >= 12 && posEdge.left + 260 <= 1280 - 12);
    assert.ok(posEdge.top >= 12 && posEdge.top + 220 <= 720 - 12);
    assert.ok(posEdge.top + 220 <= 650 || posEdge.left + 260 <= 1180, 'must not overlap anchor');

    // Tracklist sits directly below the DB button: menu should open to the right instead of covering the tracklist.
    const tracklistRect = { left: 180, top: 140, right: 560, bottom: 520 };
    const posAvoid = computeDbMenuPosition({
        anchorRect: { left: 480, top: 96, right: 560, bottom: 128 },
        menuSize: { width: 240, height: 220 },
        viewport: { width: 1280, height: 720 },
        obstacles: [tracklistRect],
    });
    const overlapX = Math.max(0, Math.min(posAvoid.left + 240, tracklistRect.right) - Math.max(posAvoid.left, tracklistRect.left));
    const overlapY = Math.max(0, Math.min(posAvoid.top + 220, tracklistRect.bottom) - Math.max(posAvoid.top, tracklistRect.top));
    assert.equal(overlapX * overlapY, 0, 'menu should avoid overlapping the tracklist');
});

test('DB menu supports mouse drag-to-move with drag header and click suppression', () => {
    const src = read('src/youtube-cd-hud.user.js');
    assert.match(src, /function bindDbMenuDragging\(menu\)/);
    assert.match(src, /hud-1001-menu-header/);
    assert.match(src, /ytcd-menu-dragging/);
    assert.match(src, /suppressNextClick/);
});

test('slot controls use 寫入/讀取 with conflict & dirty-load prompts and omit header CDJ button', async () => {
    const doc = makeFakeDom();
    let stored = {};
    const c = {
        console,
        document: doc,
        chrome: {
            storage: {
                local: {
                    async get() { return { ytCdHudLayoutSlotsV2: structuredClone(stored) }; },
                    async set(v) { stored = structuredClone(v.ytCdHudLayoutSlotsV2); },
                },
            },
        },
    };
    c.globalThis = c;
    vm.createContext(c);
    vm.runInContext(read('extension/options/live-monitor-composer.js'), c);
    vm.runInContext(read('extension/options/panel-presets.js'), c);
    vm.runInContext(read('extension/options/live-monitor-layout-presets.js'), c);

    const co = c.YtCdHudLiveMonitorComposer;
    const presetsApi = c.YtCdHudLiveMonitorLayoutPresets;
    let activeLayout = co.createDefaultLayout();
    const editor = {
        state: { layout: activeLayout, selected: null },
        getLayout: () => structuredClone(activeLayout),
        setLayout: next => { activeLayout = co.normalizeLayout(next); editor.state.layout = activeLayout; },
        updatePalette() {},
        updateViewport() {},
        updateAlignment() {},
        centerView() {},
        select() {},
        setLocked() {},
        scaleGroup() { return { updated: false }; },
    };

    const prompts = [];
    let nextChoice = null;
    const host = doc.createElement('div');
    const controls = presetsApi.createControls({
        host,
        editor,
        promptDialog: async opts => { prompts.push(opts); return nextChoice; },
    });
    await controls.render();

    const buttons = host.querySelectorAll('button');
    // Requirement 4: CDJ button must not exist in header slot bar
    assert.equal(buttons.some(b => /動態唱盤/.test(b.textContent)), false, 'CDJ button must be removed from header slot bar');

    const writeBtn = buttons.find(b => b.textContent === '寫入');
    const loadBtn = buttons.find(b => b.textContent === '讀取');
    assert.ok(writeBtn, '寫入 button must exist');
    assert.ok(loadBtn, '讀取 button must exist');

    // Requirement 3a: Writing to occupied slot 0 prompts conflict and allows writing to empty slot 7
    nextChoice = { action: 'write-empty', emptySlot: '7' };
    await writeBtn.handlers.click();
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].kind, 'write-conflict');
    assert.deepEqual([...prompts[0].emptySlots], ['7', '8', '9']);
    assert.ok(stored['7'], 'empty slot 7 should be written');

    // Requirement 3b: Modifying editor makes it dirty; loading prompts and allows saving to empty slot 8 before loading
    activeLayout.palette.primaryColor = '#123456';
    assert.equal(controls.isEditorDirty(), true);
    // Select slot 1 to load
    const slot1 = host.querySelectorAll('button').find(b => b.textContent === '1');
    slot1.handlers.click();
    await new Promise(r => setTimeout(r, 0));
    nextChoice = { action: 'save-empty-and-load', emptySlot: '8' };
    await loadBtn.handlers.click();
    assert.equal(prompts.length, 2);
    assert.equal(prompts[1].kind, 'load-dirty');
    assert.deepEqual([...prompts[1].emptySlots], ['8', '9']);
    assert.equal(stored['8'].palette.primaryColor, '#123456', 'dirty editor should be saved to empty slot 8');
    assert.equal(controls.isEditorDirty(), false, 'dirty state resets after load');
});

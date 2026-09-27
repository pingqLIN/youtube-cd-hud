import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const source = read('extension/options/options-appearance.js');

function setup(storage) {
    const handlers = {};
    const select = { addEventListener(name, fn) { handlers[name] = fn; } };
    const document = { documentElement: { dataset: {} }, readyState: 'loading',
        getElementById: id => id === 'interface-theme' ? select : null, addEventListener(name, fn) { handlers[name] = fn; } };
    vm.runInNewContext(source, { document, localStorage: storage });
    return { document, select, handlers };
}

test('interface theme restores before binding and persists independently of HUD settings', () => {
    const saved = new Map([['ytCdHudOptionsTheme', 'light'], ['ytCdHudSettings', 'unchanged']]);
    const app = setup({ getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) });
    assert.equal(app.document.documentElement.dataset.theme, 'light');
    app.handlers.DOMContentLoaded();
    assert.equal(app.select.value, 'light');
    app.select.value = 'dark'; app.handlers.change();
    assert.equal(app.document.documentElement.dataset.theme, 'dark');
    assert.equal(saved.get('ytCdHudOptionsTheme'), 'dark');
    assert.equal(saved.get('ytCdHudSettings'), 'unchanged');
});

test('appearance controls remain usable if local preference storage is unavailable', () => {
    const app = setup({ getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); } });
    app.handlers.DOMContentLoaded();
    assert.equal(app.select.value, 'dark');
    app.select.value = 'light'; app.handlers.change();
    assert.equal(app.document.documentElement.dataset.theme, 'light');
    const html = read('extension/options/options.html');
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    assert.match(header, /id="settings-font-size"/);
    assert.doesNotMatch(header, /id="theme-font-size"/);
    assert.match(header, /id="interface-theme"/);
    assert.equal((html.match(/id="theme-font-size"/g) || []).length, 1);
});


test('settings font scale persists separately from HUD font controls', () => {
    const stored = new Map([['ytCdHudOptionsFontScale', '120']]);
    const values = {}, handlers = {};
    const font = { addEventListener(name, fn) { handlers[name] = fn; } };
    const output = {};
    const document = { readyState: 'complete', documentElement: { dataset: {}, style: { setProperty(key,value) { values[key] = value; } } },
        getElementById(id) { return id === 'settings-font-size' ? font : id === 'settings-font-size-output' ? output : null; } };
    vm.runInNewContext(source, { document, localStorage: { getItem: key => stored.get(key), setItem: (key,value) => stored.set(key,value) } });
    assert.equal(values['--settings-font-scale'], '1.2');
    font.value = '150'; handlers.input();
    assert.equal(values['--settings-font-scale'], '1.5');
    assert.equal(output.textContent, '150%');
    assert.equal(stored.get('ytCdHudOptionsFontScale'), '150');
    assert.equal(stored.has('ytCdHudSettings'), false);
});

test('quick-settings merges into header with pre-folded drawer for secondary options', () => {
    const html = read('extension/options/options.html');
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));

    // quick-settings is inside console-header, not inside main
    assert.match(header, /class="quick-settings"/);
    assert.doesNotMatch(main, /class="quick-settings"/);

    // Master strip is in header bar
    assert.match(header, /class="master-strip"/);
    assert.match(header, /id="enabled"/);

    // Primary quick-action controls in header bar
    assert.match(header, /class="persistent-font-controls"/);
    assert.match(header, /id="settings-font-decrease"/);
    assert.match(header, /id="settings-font-increase"/);
    assert.match(header, /id="settings-font-size"/);
    assert.match(header, /id="interface-theme"/);
    assert.match(header, /class="theme-toggle-btn"/);

    // Pre-folded drawer uses native details without open attribute by default
    assert.match(header, /<details\s+class="quick-drawer"\s+id="quick-drawer">/);
    assert.doesNotMatch(header, /<details[^>]*\bopen\b[^>]*id="quick-drawer"/);

    // Drawer houses secondary options (language and metadata)
    const drawer = header.slice(header.indexOf('<details'), header.indexOf('</details>'));
    assert.match(drawer, /class="language-strip"/);
    assert.match(drawer, /id="language"/);

    // nav.page-tabs is arranged inside quick-settings-bar between brand and actions (red box area)
    const bar = header.slice(header.indexOf('class="quick-settings-bar"'), header.indexOf('class="quick-drawer"'));
    assert.match(bar, /class="header-brand"/);
    assert.match(bar, /class="page-tabs"/);
    assert.match(bar, /class="quick-settings-actions"/);
    assert.doesNotMatch(main, /class="page-tabs"/);

    // Form wraps the header and main
    assert.ok(html.indexOf('<form id="settings-form"') < html.indexOf('<header class="console-header"'));
    assert.ok(html.indexOf('</header>') < html.indexOf('<main>'));
    assert.ok(html.indexOf('</main>') < html.indexOf('</form>'));
});

test('opening appearance controls does not write preferences before user input', () => {
    const writes = [];
    const app = setup({ getItem: () => null, setItem: (...args) => writes.push(args) });
    app.handlers.DOMContentLoaded();
    assert.deepEqual(writes, []);
});

test('invalid legacy theme selections fall back to dark', () => {
    const app = setup({ getItem: () => null, setItem() {} });
    app.handlers.DOMContentLoaded();
    app.select.value = 'unsupported-theme';
    app.handlers.change();
    assert.equal(app.document.documentElement.dataset.theme, 'dark');
});

test('header buttons toggle theme and clamp font scale without submitting settings', () => {
    const saved = new Map(), controls = {};
    for (const id of ['interface-theme', 'settings-font-decrease', 'settings-font-increase', 'settings-font-size', 'settings-font-size-output']) {
        controls[id] = { tagName: 'BUTTON', handlers: {}, setAttribute() {},
            addEventListener(name, fn) { this.handlers[name] = fn; } };
    }
    const document = { readyState: 'complete', documentElement: { dataset: {}, style: { setProperty() {} } },
        getElementById: id => controls[id] || null };
    vm.runInNewContext(source, { document, localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) } });
    assert.equal(saved.size, 0);
    controls['interface-theme'].handlers.click();
    assert.equal(document.documentElement.dataset.theme, 'light');
    controls['interface-theme'].handlers.click();
    assert.equal(document.documentElement.dataset.theme, 'dark');
    for (let i = 0; i < 20; i++) controls['settings-font-decrease'].handlers.click();
    assert.equal(saved.get('ytCdHudOptionsFontScale'), '80');
    assert.equal(controls['settings-font-decrease'].disabled, true);
    for (let i = 0; i < 20; i++) controls['settings-font-increase'].handlers.click();
    assert.equal(saved.get('ytCdHudOptionsFontScale'), '150');
    assert.equal(controls['settings-font-increase'].disabled, true);
    assert.equal(controls['settings-font-decrease'].disabled, false);
    assert.equal(saved.has('ytCdHudSettings'), false);
});

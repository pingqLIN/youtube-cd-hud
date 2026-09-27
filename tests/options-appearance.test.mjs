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

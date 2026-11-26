import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const manager = require('../extension/options/studio-window-manager.js');

test('studio manager owns distinct panels without duplicating settings sources', () => {
    const ids = manager.SPECS.map(p => p.id);
    assert.deepEqual(ids, ['properties', 'layout', 'theme', 'library', 'agent', 'code']);
    assert.equal(new Set(manager.SPECS.map(p => p.selector)).size, ids.length);
    assert.equal(manager.SPECS.filter(p => p.visible).length, 4);
    assert.ok(manager.SPECS.every(p => p.docked === true));
});

test('floating window geometry remains bounded for malformed and restored state', () => {
    const spec = manager.SPECS.find(p => p.id === 'theme');
    const v = manager.normalizeState({ x: Infinity, y: -999, width: 9e9, height: -10,
        visible: true, docked: false, collapsed: true }, spec, { width: 900, height: 600 });
    assert.equal(v.visible, true);
    assert.equal(v.docked, false);
    assert.equal(v.collapsed, true);
    assert.equal(v.x, 48);
    assert.equal(v.y, 48);
    assert.equal(v.width, 900);
    assert.equal(v.height, 80);
    assert.deepEqual(Object.keys(v), ['visible', 'docked', 'collapsed', 'x', 'y', 'width', 'height']);
});

test('storage failures or non-versioned content do not prevent the Studio from opening', () => {
    assert.deepEqual(manager.loadSaved({ getItem: () => { throw Error('storage denied'); } }), {});
    assert.deepEqual(manager.loadSaved({ getItem: () => '{oops' }), {});
    assert.deepEqual(manager.loadSaved({ getItem: () => '{"version":1,"panels":{"theme":{"x":30}}}' }), {});
    assert.deepEqual(manager.loadSaved({ getItem: () => '{"version":2,"panels":{"theme":{"x":30}}}' }), { theme: { x: 30 } });
});

test('options view loads floating manager before dependent asynchronous controls', () => {
    const html = fs.readFileSync(path.join(root, 'extension/options/options.html'), 'utf8');
    const stylesheet = html.indexOf('href="studio-window-manager.css"');
    const script = html.indexOf('src="studio-window-manager.js"');
    const loader = html.indexOf('src="live-monitor-loader.js');
    assert.ok(stylesheet > 0);
    assert.ok(script > stylesheet && script < loader);
    for (const spec of manager.SPECS) {
        assert.ok(html.includes(spec.selector.replace(/^[.#]/, '')) || spec.id === 'properties',
            spec.id + ' must have an existing source');
    }
    const css = fs.readFileSync(path.join(root, 'extension/options/studio-window-manager.css'), 'utf8');
    assert.match(css, /\.studio-window-dock\s*\{/);
    assert.match(css, /\.studio-window-overlay\s*\{/);
    assert.match(css, /@media \(max-width: 720px\)/);
});

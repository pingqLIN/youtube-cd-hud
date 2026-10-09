import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = 'extension/options/';
const files = ['unit', 'appearance', 'text', 'effects'];
function harness() {
    const ctx = { globalThis: null };
    vm.createContext(ctx);
    ctx.globalThis = ctx;
    function load(name) {
        vm.runInContext(fs.readFileSync(path.join(root, base + name), 'utf8'), ctx, { filename: name });
    }
    load('property-section-registry.js');
    return { ctx, registry: ctx.YtCdHudPropertySections, load };
}
test('property module registry refuses missing, unknown and duplicate modules', () => {
    const { registry, load } = harness();
    assert.throws(() => registry.validate(), /Missing property sections/);
    for (const id of files) load('property-sections/' + id + '.js');
    assert.equal(registry.validate(), true);
    assert.deepEqual(Array.from(registry.list(), x => x.id), files);
    assert.ok(registry.list().every(x => x.registered));
    assert.throws(() => registry.register('unknown', () => {}), /Invalid or duplicate/);
    assert.throws(() => registry.register('unit', () => {}), /Invalid or duplicate/);
    assert.throws(() => registry.render('unknown', {}), /Unregistered property section/);
});
test('effect controls render through their own module using injected context', () => {
    const { registry, load } = harness();
    load('property-sections/effects.js');
    const effects = [];
    const component = { id: 'disc' };
    registry.render('effects', {
        rule: { supportedEffects: ['glow'] },
        component,
        addEffect: (name, item) => effects.push({ name, id: item.id }),
    });
    assert.deepEqual(effects, [{ name: 'glow', id: 'disc' }]);
});
test('all property sections are loaded before the toolbar with no storage side effects', () => {
    const loader = fs.readFileSync(path.join(root,base+'live-monitor-loader.js'),'utf8');
    const toolbarPos = loader.indexOf("src: 'live-monitor-property-toolbar.js'");
    assert.ok(toolbarPos > 0);
    for (const id of files) {
        const name = 'property-sections/' + id + '.js';
        assert.ok(loader.indexOf("src: '" + name + "'") > 0);
        assert.ok(loader.indexOf("src: '" + name + "'") < toolbarPos);
        const source = fs.readFileSync(path.join(root,base+name),'utf8');
        assert.doesNotMatch(source, /chrome\.storage|localStorage|sessionStorage|eval\(/);
    }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const manager = require('../extension/options/studio-window-manager.js');
const read = file => fs.readFileSync(new URL('../extension/options/' + file, import.meta.url), 'utf8');

test('properties inspector starts visible, docked, expanded, with usable width and height', () => {
  const spec = manager.SPECS.find(entry => entry.id === 'properties');
  assert.ok(spec);
  assert.equal(spec.visible, true);
  assert.equal(spec.docked, true);
  assert.equal(spec.collapsed, false);
  const start = manager.normalizeState(null, spec, { width: 1400, height: 900 });
  assert.equal(start.width, 520);
  assert.equal(start.height, 560);
  assert.equal(start.collapsed, false);
  const legacy = manager.normalizeState({ width: 340, height: 300 }, spec, { width: 1400, height: 900 });
  assert.equal(legacy.width, 440);
  assert.equal(legacy.height, 420);
  assert.match(read('studio-window-manager.js'), /spec\.id === 'properties' && persisted \? \{ \.\.\.persisted, collapsed: false \}/);
});

test('property toolbar gives width and height a permanent basic-geometry group', () => {
  const source = read('live-monitor-property-toolbar.js');
  assert.match(source, /className = 'lm-property-basic'/);
  assert.match(source, /className = 'lm-property-basic-grid'/);
  assert.match(source, /基本設定 · 顯示、鎖定、寬度與高度/);
  assert.match(source, /for \(const dimension of \['width', 'height'\]\)/);
  assert.match(source, /className = 'lm-unit-detail-body'/);
  assert.match(source, /Array\.from\(toolbar\.children\)\.slice\(1\)/);
  assert.match(source, /jog: '動態唱盤 · CDJ'/);
});

test('properties use responsive two-column controls and a scrollable full detail sheet', () => {
  const css = read('studio-window-manager.css');
  assert.match(css, /data-studio-id="properties"/);
  assert.match(css, /\.lm-property-basic-grid,/);
  assert.match(css, /\.lm-unit-detail-body \{/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /@media \(max-width: 430px\)/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const extension = path => fs.readFileSync(new URL('../extension/' + path, import.meta.url), 'utf8');
function getSchema() {
  const ctx = {};
  vm.runInNewContext(extension('shared/webmcp-settings-schema.js'), ctx);
  return ctx.YtCdHudWebMcpSettings;
}
test('WebMCP allows bounded settings and read-only requests', () => {
  const api = getSchema();
  const baseRevision = 'a'.repeat(64);
  assert.equal(api.validInput('panel_read', {}), true);
  assert.equal(api.validInput('panel_read', {payload:'page-data'}), false);
  assert.equal(api.validInput('settings_read', {}), true);
  assert.equal(api.validInput('settings_apply', {baseRevision,settings:{enabled:false,accentColor:'#00aabb'}}), true);
  assert.equal(api.validInput('settings_apply', {baseRevision,settings:{customCSS:'body{}'}}), false);
  assert.equal(api.validInput('settings_apply', {baseRevision,settings:{requestTimeoutMs:Infinity}}), false);
  assert.equal(api.validInput('settings_apply', {baseRevision:'bad',settings:{enabled:true}}), false);
  assert.equal(api.validInput('settings_status', {operationId:'request-42'}), true);
  assert.equal(api.validInput('settings_status', {operationId:'../secret'}), false);
  assert.equal(api.validInput('unknown', {}), false);
});
test('WebMCP excludes custom CSS and credentials from projection', () => {
  const result = getSchema().project({enabled:true,accentColor:'#ffaa00',customCSS:'x',apiKey:'secret',maxCandidates:100});
  assert.equal(result.enabled,true);
  assert.equal(result.accentColor,'#ffaa00');
  assert.equal(Object.hasOwn(result,'customCSS'),false);
  assert.equal(Object.hasOwn(result,'apiKey'),false);
  assert.equal(Object.hasOwn(result,'maxCandidates'),false);
});
test('recovered WebMCP modules stay unloaded until integration is explicitly tested', () => {
  const manifest = JSON.parse(extension('manifest.json'));
  const scripts = manifest.content_scripts.flatMap(item=>item.js);
  assert.equal(scripts.includes('content/hud-webmcp.js'), false);
  assert.equal(scripts.includes('content/hud-webmcp-main.js'), false);
  assert.equal(scripts.includes('shared/webmcp-settings-schema.js'), false);
});

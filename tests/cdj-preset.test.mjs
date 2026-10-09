import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
const legacyProjection = value => { const result=JSON.parse(JSON.stringify(value)); for(const role of ['volume-control','agent-tools','system-status']) { const c=result.components?.find(x=>x.id===role); if(c) assert.equal(c.present,false,role+' must remain absent'); } if(result.components) result.components=result.components.filter(x=>!['volume-control','agent-tools','system-status'].includes(x.id)); return result; };
function setup(){const c={console};for(const f of ['live-monitor-composer.js','panel-presets.js'])vm.runInNewContext(read('extension/options/'+f),c);return c;}
test('CDJ preset is opt-in and maps only real registered controls into a connected portrait deck',()=>{
 const c=setup(),co=c.YtCdHudLiveMonitorComposer,pack=c.YtCdHudPanelPack;
 const meta=pack.presets.find(p=>p.id==='cdj-inspired');assert.ok(meta);assert.equal(meta.optIn,true);
 const layout=pack.create(meta.id,co),base=co.getComponent(layout,'panel-base'),disc=co.getComponent(layout,'disc');
 assert.equal(base.geometry.width,448);assert.equal(base.geometry.height,640);assert.ok(disc.geometry.width>=280);
 assert.deepEqual(plain(layout.components.map(x=>x.type).sort()),Object.keys(co.registry).sort());
 assert.deepEqual(Array.from(layout.components.filter(x=>x.present),x=>x.type).sort(),['panel-base','disc','track-title','time-readout','source-selector','transport-controls','close-control','tracklist-panel'].sort());
 assert.equal(co.connectedToBase(layout,base),true);
 for(const item of layout.components.filter(x=>x.present))assert.equal(co.collisionFor(item,layout.components,layout.canvas),null,item.id);
 const transport=co.getComponent(layout,'transport-controls');assert.equal(transport.arrangement.split,true);assert.ok(transport.arrangement.partSize.width>=64);
 assert.equal(disc.style.texture,'jog');assert.ok(layout.skin);assert.deepEqual(plain(co.importCode(co.exportCode(layout))),plain(layout));
 const saved=co.prepareForSave(layout),source=co.getComponent(saved,'source-selector');
 assert.ok(source.geometry.z>Math.max(...saved.components.filter(x=>x.present&&x.id!==source.id).map(co.effectiveZ)));
});
test('adding the optional CDJ preset preserves prior presets and leaves every saved slot untouched',async()=>{
 const c=setup(),co=c.YtCdHudLiveMonitorComposer,before=JSON.parse(read('tests/fixtures/preset-appearance-before-skin.json'));
 for(const [id,expected]of Object.entries(before)){const value=plain(c.YtCdHudPanelPack.create(id,co));delete value.skin;assert.deepEqual(legacyProjection(value),expected,id);}
 let writes=0;const saved={'7':co.createDefaultLayout()};saved['7'].placement={x:.12,y:.34};
 c.chrome={storage:{local:{async get(){return {ytCdHudLayoutSlotsV2:saved};},async set(){writes++;}}}};
 vm.runInNewContext(read('extension/options/live-monitor-layout-presets.js'),c);
 const slots=await c.YtCdHudLiveMonitorLayoutPresets.readSlots();
 assert.deepEqual(Object.keys(slots).sort(),['0','1','2','3','4','5','6','7']);assert.equal(writes,0);
 assert.deepEqual(plain(slots['7']),plain(saved['7']));
 assert.equal(c.YtCdHudLiveMonitorLayoutPresets.createBundledLayout('cdj-inspired').skin.roles.disc.surface.texture,'jog');
});
test('jog texture survives shared Skin, Studio and standalone runtime without new controls',()=>{
 const c=setup(),co=c.YtCdHudLiveMonitorComposer;assert.ok(co.DISC_TEXTURES.includes('jog'));
 const layout=co.createDefaultLayout();layout.components.find(x=>x.type==='disc').style.texture='jog';co.refreshSkin(layout);
 const rt={console,URL,URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval,__YT_CD_HUD_TEST_MODE__:true};rt.window=rt;
 vm.runInNewContext(read('src/youtube-cd-hud.user.js'),rt);
 assert.equal(rt.__YT_CD_HUD_TEST_EXPORTS__.normalizeHudLayout(layout).components.find(x=>x.type==='disc').style.texture,'jog');
 for(const file of ['extension/options/options.css','src/youtube-cd-hud.user.js'])assert.match(read(file),/texture="jog"/);
});
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
function setup(){const c={};vm.runInNewContext(read('extension/options/live-monitor-composer.js'),c);return c;}
test('Skin pure contract preserves all legacy presentation and all functional fields',()=>{
 const c=setup(),api=c.YtCdHudSkin,layout=c.YtCdHudLiveMonitorComposer.createDefaultLayout();
 assert.ok(api,'shared Skin API');
 const skin=api.extractSkin(layout); assert.equal(skin.format,'youtube-cd-hud-skin');
 const next=api.applySkinToLayout(layout,skin);delete next.skin;
 assert.deepEqual(plain(next),plain(layout));
 skin.roles['track-title'].text.color='#123456';
 const changed=api.applySkinToLayout(layout,skin);
 assert.equal(changed.components.find(x=>x.type==='track-title').textStyle.color,'#123456');
 for(let i=0;i<layout.components.length;i++){const strip=x=>{const y=plain(x);delete y.style;delete y.textStyle;delete y.effects;return y;};assert.deepEqual(strip(changed.components[i]),strip(layout.components[i]));}
 assert.deepEqual(plain(layout),plain(c.YtCdHudLiveMonitorComposer.createDefaultLayout()));
});
test('Skin rejects geometry, unknown roles, executable values and unsupported effects',()=>{
 const api=setup().YtCdHudSkin;assert.ok(api);
 for(const roles of {bad:{unknown:{surface:{opacity:1}}},geometry:{disc:{geometry:{x:1}}},css:{disc:{surface:{backgroundColor:'url(https://evil)'}}},effect:{disc:{effects:{marquee:true}}},font:{'track-title':{text:{font:'x; color:red'}}},range:{disc:{surface:{opacity:2}}}} ? Object.values({bad:{unknown:{surface:{opacity:1}}},geometry:{disc:{geometry:{x:1}}},css:{disc:{surface:{backgroundColor:'url(https://evil)'}}},effect:{disc:{effects:{marquee:true}}},font:{'track-title':{text:{font:'x; color:red'}}},range:{disc:{surface:{opacity:2}}}}):[]){
  assert.ok(api.normalizeSkin({format:'youtube-cd-hud-skin',schemaVersion:1,tokens:{},roles}).warnings.length);
 }
 const good=api.normalizeSkin({format:'youtube-cd-hud-skin',schemaVersion:1,tokens:{},roles:{'track-title':{text:{font:'台灣 Font 1',fontSize:18},effects:{marquee:false}}}});
 assert.deepEqual(plain(good.warnings),[]);
});
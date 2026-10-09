import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
function context(){const c={navigator:{languages:['en'],language:'en'},__YT_CD_HUD_TEST_MODE__:true,console,setTimeout,clearTimeout,setInterval,clearInterval,URL,URLSearchParams};c.window=c;c.globalThis=c;vm.createContext(c);vm.runInContext(read('extension/options/live-monitor-composer.js'),c);vm.runInContext(read('src/youtube-cd-hud.user.js'),c);return c;}
const roles=['volume-control','agent-tools','system-status'];
test('old complete ten-role panels migrate with three absent roles and unchanged original values',()=>{
 const c=context(),api=c.YtCdHudLiveMonitorComposer;
 const legacy=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-cdj-panel.json',import.meta.url),'utf8'));
 const before=legacy.layout.components;
 const migrated=api.importCode(JSON.stringify(legacy));
 for(const role of roles) assert.equal(api.getComponent(migrated,role)?.present,false,role);
 for(const old of before) assert.deepEqual(JSON.parse(JSON.stringify(api.getComponent(migrated,old.id))),old);
 const roundtrip=api.importCode(api.exportCode(migrated));
 assert.deepEqual(JSON.parse(JSON.stringify(api.importCode(api.exportCode(roundtrip)))),JSON.parse(JSON.stringify(roundtrip)));
 const broken=structuredClone(legacy);broken.layout.components.pop();assert.throws(()=>api.importCode(JSON.stringify(broken)));
});
test('optional controls are library items, and volume presentation is a strict role-scoped enum',()=>{
 const c=context(),api=c.YtCdHudLiveMonitorComposer,layout=api.createDefaultLayout();
 for(const role of roles) assert.ok(api.availableComponents(layout).some(x=>x.type===role));
 const volume=api.getComponent(layout,'volume-control');assert.equal(volume.style.volumeStyle,'fader');
 volume.style.volumeStyle='knob';api.refreshSkin(layout);assert.equal(api.normalizeLayout(layout).components.find(x=>x.id==='volume-control').style.volumeStyle,'knob');
 const skin=c.YtCdHudSkin.extractSkin(layout);skin.roles['volume-control'].surface.volumeStyle='javascript';assert.throws(()=>c.YtCdHudSkin.requireSkin(skin));
});
function fakeDocument(){const doc={activeElement:null};doc.createElement=tag=>({tagName:tag,children:[],dataset:{},style:{setProperty(){}},attributes:{},handlers:{},value:'',textContent:'',hidden:false,append(...ns){this.children.push(...ns);},setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k]??null;},removeAttribute(k){delete this.attributes[k];},addEventListener(k,fn){this.handlers[k]=fn;},focus(){doc.activeElement=this;},setPointerCapture(){},releasePointerCapture(){}});return doc;}
function video(volume=.4,muted=false){return {volume,muted,handlers:new Map(),addEventListener(k,f){this.handlers.set(k,f);},removeEventListener(k,f){if(this.handlers.get(k)===f)this.handlers.delete(k);}};}
test('volume control reads on mount, writes only user actions, follows external changes and cleans replacement video',()=>{
 const c=context(),api=c.__YT_CD_HUD_TEST_EXPORTS__,ui=api.createVolumeControl(fakeDocument()),a=video(.4,true),b=video(.8);
 ui.setVideo(a);assert.equal(a.volume,.4);assert.equal(a.muted,true);assert.equal(ui.range.value,'40');assert.match(ui.output.textContent,/40%.*Muted/);
 ui.range.value='75';ui.range.handlers.input();assert.equal(a.volume,.75);assert.equal(a.muted,false);
 a.volume=.3;a.muted=true;a.handlers.get('volumechange')();assert.equal(ui.range.value,'30');
 ui.setVideo(b);assert.equal(a.handlers.size,0);assert.equal(b.volume,.8);assert.equal(ui.range.value,'80');
 ui.range.value='200';ui.range.handlers.input();assert.equal(b.volume,1);
 ui.mute.handlers.click();assert.equal(b.muted,true);
 ui.setVideo(null);assert.equal(b.handlers.size,0);assert.equal(ui.range.disabled,true);
});
test('system status separates browser hint, actual request state and unknown cache metadata',()=>{
 const f=context().__YT_CD_HUD_TEST_EXPORTS__.getSystemStatusText;
 const text=f({online:true,request:'error',detail:'TIDAL unavailable',source:'youtube',cache:false});
 assert.match(text,/瀏覽器.*線上提示/);assert.match(text,/服務連線.*未驗證/);assert.match(text,/error.*TIDAL unavailable/);assert.match(text,/快取.*未命中/);assert.match(text,/時間.*未知/);assert.doesNotMatch(text,/0ms|100%|健康/);
 assert.match(f({online:false,request:'searching',source:'1001',cache:true}),/離線提示/);
});

function studioDocument(){
 const doc=fakeDocument(),base=doc.createElement;
 doc.createElement=tag=>{const e=base(tag);e.classList={add(){},toggle(){},remove(){}};e.appendChild=n=>{if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(x=>x!==n);e.children.push(n);n.parentNode=e;return n;};e.append=(...ns)=>ns.forEach(e.appendChild);e.replaceChildren=()=>{e.children=[];};
 const descendants=()=>e.children.flatMap(n=>[n,...n.querySelectorAll('*')]);
 e.querySelectorAll=selector=>descendants().filter(n=>selector==='*'||selector.split(',').includes(n.tagName));
 e.querySelector=selector=>e.querySelectorAll(selector)[0]||null;
 Object.defineProperty(e,'innerHTML',{set(value){e.replaceChildren();for(const match of value.matchAll(/<(span|strong)\b/g))e.append(doc.createElement(match[1]));}});
 return e;};return doc;
}
test('actual Studio toolbar switches fader and knob with Skin roundtrip; optional library dispatch adds real roles',()=>{
 const c=context(),doc=studioDocument();c.document=doc;
 vm.runInContext(read('extension/options/live-monitor-property-toolbar.js'),c);vm.runInContext(read('extension/options/live-monitor-component-library.js'),c);
 const co=c.YtCdHudLiveMonitorComposer,layout=co.createDefaultLayout();layout.locked=false;
 const volume=co.getComponent(layout,'volume-control');volume.present=true;
 const editor={state:{layout},render(){},recordHistory(){},add(id){this.added=id;}};
 const toolbar=c.YtCdHudLiveMonitorPropertyToolbar.createToolbar({host:doc.createElement('div'),editor});toolbar.update(volume.id,volume);
 const style=toolbar.element.querySelectorAll('*').find(n=>n.dataset.lmProperty==='volumeStyle');assert.ok(style);assert.equal(style.children.length,2);
 style.value='knob';style.handlers.change();assert.equal(volume.style.volumeStyle,'knob');assert.equal(co.normalizeLayout(layout).skin.roles['volume-control'].surface.volumeStyle,'knob');
 style.value='fader';style.handlers.change();assert.equal(volume.style.volumeStyle,'fader');
 volume.present=false;const host=doc.createElement('div');c.YtCdHudLiveMonitorComponentLibrary.createLibrary({host,editor});
 for(const role of roles){const button=host.children.find(n=>n.dataset.lmAdd===role);assert.ok(button);button.handlers.click();assert.equal(editor.added,role);}
});
test('knob drag clamps the same volume and leaves native keyboard range semantics available',()=>{
 const ui=context().__YT_CD_HUD_TEST_EXPORTS__.createVolumeControl(fakeDocument()),v=video(.5);ui.setVideo(v);ui.root.dataset.volumeStyle='knob';
 let prevented=0;ui.range.handlers.pointerdown({pointerId:1,clientY:100,preventDefault(){prevented++;}});ui.range.handlers.pointermove({pointerId:1,clientY:70});assert.equal(v.volume,.8);
 ui.range.handlers.pointermove({pointerId:1,clientY:-200});assert.equal(v.volume,1);ui.range.handlers.pointerup({pointerId:1});
 ui.range.handlers.pointermove({pointerId:1,clientY:200});assert.equal(v.volume,1);assert.equal(prevented,1);
 let stopped=0;ui.root.handlers.keydown({key:'Home',stopPropagation(){stopped++;},preventDefault(){assert.fail('native range keyboard must remain active');}});assert.equal(stopped,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const source = name => readFileSync(new URL('../extension/'+name,import.meta.url),'utf8');

async function setup() {
  const elements = new Map();
  function element(id) {
    if(!elements.has(id)) elements.set(id,{value:'',textContent:'',className:'',hidden:false,handlers:{},elements:[],style:{setProperty(){}},classList:{toggle(){}},addEventListener(type,fn){this.handlers[type]=fn;}});
    return elements.get(id);
  }
  const field={name:'maxCandidates',type:'number',value:'5'};
  element('settings-form').elements=[field];
  const timers=new Map(); let timerId=0;
  const context={console,crypto:{randomUUID},document:{getElementById:element},window:{confirm:()=>true},setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);}};
  vm.runInNewContext(source('shared/settings.js'),context);
  vm.runInNewContext(source('options/live-monitor-composer.js'),context);
  const composer=context.YtCdHudLiveMonitorComposer;
  let layout=composer.createDefaultLayout();
  const snapshot={revision:'a'.repeat(64),settings:{...context.YtCdHudSettings.DEFAULTS,customCss:'.saved{color:red}'},layout};
  const requests=[];
  let failure=null;
  let readHook=null;
  let agentHost=null, applyHook=null;
  context.YtCdHudOptionsAgent={init(host){agentHost=host;}};
  context.YtCdHudSettingsClient={
    read:async()=>{if(readHook) await readHook();return {ok:true,snapshot};},
    apply:async request=>{requests.push(request);if(applyHook) await applyHook();return failure || {ok:true,status:'STORED',snapshot:{revision:'b'.repeat(64),...request.payload}};},
    operationStatus:async()=>({ok:true,status:'UNKNOWN'}),
  };
  context.YtCdHudLiveMonitorBootstrap={init(value){layout=value.layout;},getLayout:()=>layout,setLayout(value){layout=value;}};
  vm.runInNewContext(source('options/options-host.js'),context);
  vm.runInNewContext(source('options/options.js'),context);
  await new Promise(resolve=>setImmediate(resolve));
  return {element,field,requests,snapshot,get agentHost(){return agentHost;},setApplyHook(fn){applyHook=fn;},getLayout:()=>layout,setReadHook(value){readHook=value;},async flush(){const work=[...timers.values()];timers.clear();work.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));},setFailure(value){failure=value;}};
}

test('real options submit preserves unexposed settings and writes one revision-checked snapshot',async()=>{
  const x=await setup(); x.field.value='7';
  await x.element('settings-form').handlers.submit({preventDefault(){}});
  assert.equal(x.requests.length,1);
  assert.equal(x.requests[0].baseRevision,x.snapshot.revision);
  assert.equal(x.requests[0].payload.settings.maxCandidates,7);
  assert.equal(x.requests[0].payload.settings.customCss,'.saved{color:red}');
  assert.equal(x.requests[0].payload.layout.locked,true);
  assert.match(x.element('save-status').textContent,/讀回確認/);
});

test('options conflict preserves the edited draft and exports the remote snapshot for comparison',async()=>{
  const x=await setup(); x.field.value='9';
  x.setFailure({ok:false,error:'CONFLICT',snapshot:{...x.snapshot,revision:'c'.repeat(64)}});
  await x.element('settings-form').handlers.submit({preventDefault(){}});
  assert.equal(x.field.value,'9');
  assert.match(x.element('save-status').textContent,/草稿已保留/);
  x.element('export-settings-draft').handlers.click();
  const output=JSON.parse(x.element('settings-draft').value);
  assert.equal(output.draft.settings.maxCandidates,9);
  assert.equal(output.remoteSnapshot.revision,'c'.repeat(64));
});

test('settings text size updates locked panel text without unlocking the layout',async()=>{
  const x=await setup();
  x.getLayout().locked=true;
  const title=x.getLayout().components.find(component=>component.id==='track-title');
  title.locked=true;
  await x.element('theme-font-size').handlers.input({target:{value:'500',setAttribute(){}}});
  assert.equal(x.getLayout().locked,true);
  assert.equal(x.getLayout().components.find(component=>component.id==='track-title').textStyle.fontSize,32);
  assert.equal(x.getLayout().components.find(component=>component.id==='track-title').locked,true);
});

test('native cache clear verifies only the track cache and preserves unrelated storage',async()=>{
  const data={ytCdHudTracklistCacheV1:{video:{savedAt:1}},unrelated:'keep'};
  const context={YtCdHudSettingsClient:{},chrome:{storage:{local:{
    async set(value){Object.assign(data,value);},async get(key){return {[key]:data[key]};},
  }}}};
  vm.runInNewContext(source('options/options-host.js'),context);
  await context.YtCdHudOptionsHost.clearCache();
  assert.equal(Object.keys(data.ytCdHudTracklistCacheV1).length,0);
  assert.equal(data.unrelated,'keep');
});

test('source and cache settings preserve opt-out and default existing installs to enabled',()=>{
  const context={};
  vm.runInNewContext(source('shared/settings.js'),context);
  const settings=context.YtCdHudSettings;
  assert.equal(settings.normalize({}).enableYouTube,true);
  assert.equal(settings.normalize({}).enableCache,true);
  assert.equal(settings.normalize({enableYouTube:false,enableCache:false}).enableYouTube,false);
  assert.equal(settings.normalize({enableYouTube:false,enableCache:false}).enableCache,false);
});

test('auto sync defaults on and sends only the latest workspace layout',async()=>{
  const x=await setup();
  assert.equal(x.element('auto-sync-workspace').checked,true);
  x.field.value='9';
  await x.element('theme-font-size').handlers.input({target:{value:'500',setAttribute(){}}});
  await x.flush();
  assert.equal(x.requests.length,1);
  assert.deepEqual(Object.keys(x.requests[0].payload),['layout']);
  assert.equal(x.field.value,'9');
  assert.equal(x.requests[0].payload.layout.components.find(item=>item.id==='track-title').textStyle.fontSize,32);
  x.element('settings-form').handlers.input({target:x.field});
  await x.flush();
  assert.equal(x.requests.length,1,'unchanged layout must not create a sync loop');
});

test('disabling auto sync cancels scheduled workspace writes',async()=>{
  const x=await setup();
  await x.element('theme-font-size').handlers.input({target:{value:'500',setAttribute(){}}});
  x.element('auto-sync-workspace').checked=false;
  x.element('auto-sync-workspace').handlers.change();
  await x.flush();
  assert.equal(x.requests.length,0);
});

test('disabling auto sync during an in-flight read prevents apply',async()=>{
  const x=await setup(); let finish;
  x.setReadHook(()=>new Promise(resolve=>{finish=resolve;}));
  x.element('theme-font-size').handlers.input({target:{value:'500',setAttribute(){}}});
  await x.flush();
  x.element('auto-sync-workspace').checked=false;
  x.element('auto-sync-workspace').handlers.change();
  finish(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(x.requests.length,0);
});

test('edits made during an in-flight sync eventually persist the newest layout',async()=>{
  const x=await setup(); let finish;
  x.setReadHook(()=>new Promise(resolve=>{finish=resolve;}));
  x.element('theme-font-size').handlers.input({target:{value:'400',setAttribute(){}}});
  await x.flush();
  x.element('theme-font-size').handlers.input({target:{value:'500',setAttribute(){}}});
  x.setReadHook(null); finish(); await new Promise(resolve=>setImmediate(resolve));
  await x.flush();
  assert.equal(x.requests.length,2);
  assert.equal(x.requests.at(-1).payload.layout.components.find(item=>item.id==='track-title').textStyle.fontSize,32);
  assert.equal(x.getLayout().components.find(item=>item.id==='track-title').textStyle.fontSize,32);
});

test('settings page exposes source-first navigation and requested controls',()=>{
  const html=source('options/options.html');
  const radios=[...html.matchAll(/<input[^>]*class="tab-radio"[^>]*>/g)].map(match=>match[0]);
  assert.equal(radios.filter(tag=>/\bchecked\b/.test(tag)).length,1);
  assert.match(radios.find(tag=>/\bchecked\b/.test(tag)),/id="tab-sources"/);
  assert.ok(html.indexOf('for="tab-sources"')<html.indexOf('for="tab-studio"'));
  assert.match(html,/<input[^>]*id="enableYouTube"[^>]*name="enableYouTube"/);
  assert.match(html,/<input[^>]*id="enableCache"[^>]*name="enableCache"/);
  assert.match(html,/<button[^>]*id="clear-cache"/);
  assert.match(html,/id="reload-settings"[^]*?<\/button>\s*<label[^>]*>\s*<input id="auto-sync-workspace"[^>]*checked/);
});

test('reenabling sync force-writes the workspace even when its fingerprint did not change',async()=>{
  const x=await setup();
  x.element('auto-sync-workspace').checked=false;
  x.element('auto-sync-workspace').handlers.change();
  x.snapshot.revision='d'.repeat(64);
  x.element('auto-sync-workspace').checked=true;
  x.element('auto-sync-workspace').handlers.change();
  await x.flush();
  assert.equal(x.requests.length,1);
  assert.equal(x.requests[0].baseRevision,'d'.repeat(64));
  assert.deepEqual(Object.keys(x.requests[0].payload),['layout']);
});

test('reload with sync enabled writes workspace and preserves pending source edits',async()=>{
  const x=await setup();
  x.field.value='9';
  x.element('theme-font-size').handlers.input({target:{value:'500',setAttribute(){}}});
  await x.element('reload-settings').handlers.click();
  assert.equal(x.requests.length,1);
  assert.equal(x.requests[0].payload.layout.components.find(item=>item.id==='track-title').textStyle.fontSize,32);
  assert.equal(x.field.value,'9');
});


test('Agent commit uses captured revision, stores only layout and preserves unsaved source settings', async () => {
  const x=await setup();
  x.getLayout().locked=false;
  x.field.value='9';
  const before=JSON.parse(JSON.stringify(x.getLayout()));
  const next=JSON.parse(JSON.stringify(before));
  next.palette.primaryColor='#123456';
  const result=await x.agentHost.commit(next,{before,storageRevision:x.snapshot.revision});
  assert.equal(x.requests.length,1);
  assert.equal(x.requests[0].baseRevision,x.snapshot.revision);
  assert.deepEqual(Object.keys(x.requests[0].payload),['layout']);
  assert.equal(result.status,'STORED');
  assert.equal(result.workspaceApplied,true);
  assert.equal(result.runtime.status,'UNKNOWN');
  assert.equal(x.getLayout().locked,false);
  assert.equal(x.field.value,'9');
  await x.flush();
  assert.equal(x.requests.length,1);
});

test('Agent commit refuses remote changes without retry or workspace mutation', async () => {
  const x=await setup();x.getLayout().locked=false;
  const before=JSON.parse(JSON.stringify(x.getLayout())), revision=x.snapshot.revision;
  x.setReadHook(()=>{x.snapshot.revision='c'.repeat(64);});
  await assert.rejects(x.agentHost.commit(before,{before,storageRevision:revision}),/CONFLICT/);
  assert.equal(x.requests.length,0);
  assert.deepEqual(JSON.parse(JSON.stringify(x.getLayout())),before);
});

test('Agent storage completion preserves a concurrent human edit and suspends automatic overwrite', async () => {
  const x=await setup();x.getLayout().locked=false;
  const before=JSON.parse(JSON.stringify(x.getLayout()));
  x.setApplyHook(()=>{x.getLayout().palette.primaryColor='#abcdef';});
  const result=await x.agentHost.commit(before,{before,storageRevision:x.snapshot.revision});
  assert.equal(result.status,'STORED');
  assert.equal(result.workspaceApplied,false);
  assert.equal(x.getLayout().palette.primaryColor,'#abcdef');
  await x.element('settings-form').handlers.input({target:{name:'maxCandidates'}});
  await x.flush();
  assert.equal(x.requests.length,1);
});

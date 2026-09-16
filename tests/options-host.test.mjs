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
  const context={console,crypto:{randomUUID},document:{getElementById:element},window:{confirm:()=>true}};
  vm.runInNewContext(source('shared/settings.js'),context);
  vm.runInNewContext(source('options/live-monitor-composer.js'),context);
  const composer=context.YtCdHudLiveMonitorComposer;
  let layout=composer.createDefaultLayout();
  const snapshot={revision:'a'.repeat(64),settings:{...context.YtCdHudSettings.DEFAULTS,customCss:'.saved{color:red}'},layout};
  const requests=[];
  let failure=null;
  context.YtCdHudSettingsClient={
    read:async()=>({ok:true,snapshot}),
    apply:async request=>{requests.push(request);return failure || {ok:true,status:'STORED',snapshot:{revision:'b'.repeat(64),...request.payload}};},
    operationStatus:async()=>({ok:true,status:'UNKNOWN'}),
  };
  context.YtCdHudLiveMonitorBootstrap={init(value){layout=value.layout;},getLayout:()=>layout,setLayout(value){layout=value;}};
  vm.runInNewContext(source('options/options-host.js'),context);
  vm.runInNewContext(source('options/options.js'),context);
  await new Promise(resolve=>setImmediate(resolve));
  return {element,field,requests,snapshot,setFailure(value){failure=value;}};
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

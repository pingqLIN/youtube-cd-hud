import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal DOM models node replacement and delayed toggle delivery explicitly.
class Element {
    constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.listeners={};this.open=false;this.parent=null;}
    appendChild(node){if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);node.parent=this;this.children.push(node);return node;}
    append(...nodes){nodes.forEach(node=>this.appendChild(node));}
    replaceChildren(...nodes){this.children.forEach(node=>node.parent=null);this.children=[];this.append(...nodes);}
    set innerHTML(value){this.replaceChildren(...Array.from(value.matchAll(/<(span|strong)\b[^>]*>/g),match=>new Element(match[1])));}
    setAttribute(name,value){this[name]=value;}
    addEventListener(name,callback){(this.listeners[name] ||= []).push(callback);}
    dispatch(name){for(const callback of this.listeners[name] || [])callback({target:this});}
    querySelectorAll(selector){const choices=selector.split(',');return this.children.flatMap(node=>[...(choices.some(s=>s.startsWith('.')?node.className===s.slice(1):node.tagName===s)?[node]:[]),...node.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0] || null;}
}

function setup(){
    const context={document:{createElement:tag=>new Element(tag)}};
    vm.runInNewContext(fs.readFileSync(path.join(root,'extension/options/live-monitor-composer.js'),'utf8'),context);
    vm.runInNewContext(fs.readFileSync(path.join(root,'extension/options/live-monitor-property-toolbar.js'),'utf8'),context);
    const composer=context.YtCdHudLiveMonitorComposer;
    const editor={state:{layout:composer.normalizeLayout(JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/legacy-panel-layout.json'),'utf8')))},render(){toolbar.update(selected,composer.getComponent(editor.state.layout,selected));}};
    const host=new Element('div');let selected='track-title';
    const toolbar=context.YtCdHudLiveMonitorPropertyToolbar.createToolbar({host,editor});
    const select=id=>{selected=id;toolbar.update(id,id?composer.getComponent(editor.state.layout,id):null);};
    const details=()=>toolbar.element.querySelector('.lm-unit-details');
    select(selected);return {toolbar,editor,select,details};
}

test('appearance controls are always expanded through edits, selections and locks',()=>{
    const ui=setup();
    const assertExpanded=()=>{assert.equal(ui.details().tagName,'section');assert.equal(ui.toolbar.element.querySelector('summary'),null);assert.ok(ui.details().querySelector('.lm-unit-detail-body'));};
    assertExpanded();
    const input=ui.toolbar.element.querySelectorAll('input').find(n=>n.dataset.lmTextProperty==='fontSize');
    input.value='450';input.dispatch('input');assertExpanded();
    ui.select('disc');assertExpanded();ui.select(null);assert.equal(ui.toolbar.element.hidden,true);
    ui.select('time-readout');assertExpanded();ui.editor.state.layout.locked=true;ui.editor.render();assertExpanded();
});

test('weight input updates the selected unit in the permanently visible details',()=>{
    const ui=setup();
    const input=ui.toolbar.element.querySelectorAll('input').find(n=>n.dataset.lmTextProperty==='fontWeight');
    assert.equal(input.value,'700');input.value='400';input.dispatch('input');
    assert.equal(ui.editor.state.layout.components.find(n=>n.id==='track-title').textStyle.fontWeight,400);
    assert.ok(ui.details().querySelector('.lm-unit-detail-body'));
    ui.select('time-readout');
    assert.equal(ui.toolbar.element.querySelectorAll('input').find(n=>n.dataset.lmTextProperty==='fontWeight').value,'500');
});

test('lock indicators expose their current state separately from the action label',()=>{
    const ui=setup();const lock=()=>ui.toolbar.element.querySelectorAll('button').find(n=>n.dataset.lmLockState!==undefined);
    assert.equal(lock().dataset.lmLockState,'false');
    ui.editor.state.layout.components.find(n=>n.id==='track-title').locked=true;ui.editor.render();
    assert.equal(lock().dataset.lmLockState,'true');
    ui.select('time-readout');assert.equal(lock().dataset.lmLockState,'false');
    ui.editor.state.layout.locked=true;ui.editor.render();assert.equal(lock().dataset.lmLockState,'true');
});

test('disc opacity input changes the artwork without changing the background alpha',()=>{
    const ui=setup();ui.select('disc');
    const disc=ui.editor.state.layout.components.find(item=>item.id==='disc');
    const background=disc.style.opacity;
    const input=ui.toolbar.element.querySelectorAll('input').find(n=>n.dataset.lmProperty==='discOpacity');
    assert.equal(input.value,'1');input.value='0';input.dispatch('input');
    assert.equal(disc.style.discOpacity,0);assert.equal(disc.style.opacity,background);
    assert.notEqual(disc.hidden,true);
});

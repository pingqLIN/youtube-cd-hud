import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function setup() {
    const context = { console, crypto: webcrypto };
    for (const file of ['live-monitor-composer.js', 'panel-presets.js', 'panel-agent.js']) {
        vm.runInNewContext(read('extension/options/' + file), context);
    }
    const composer = context.YtCdHudLiveMonitorComposer;
    let layout = plain(composer.prepareForSave(context.YtCdHudPanelPack.create('full', composer)));
    layout.locked = false;
    layout.components.forEach(component => { component.locked = false; });
    let revision = 'storage-1';
    let editing = false;
    const bank = { '0': plain(layout), '4': plain(layout) };
    const commits = [], writes = [];
    let slotReadHook = null;
    const agent = context.YtCdHudPanelAgent.create({
        composer,
        getLayout: () => layout,
        getRevision: () => revision,
        isEditing: () => editing,
        async commit(candidate, metadata) {
            commits.push({ candidate: plain(candidate), metadata: plain(metadata) });
            layout = plain(candidate);
            revision = 'storage-' + (commits.length + 1);
            return { status: 'STORED', runtime: { status: 'PENDING' } };
        },
        slots: {
            async readSlots() { if (slotReadHook) await slotReadHook(); return plain(bank); },
            async writeSlots(value) { writes.push(plain(value)); Object.assign(bank, plain(value)); },
        },
    });
    return { agent, composer, commits, writes, bank, setSlotReadHook(fn) { slotReadHook = fn; },
        get layout() { return layout; },
        changeRevision() { revision += '-external'; },
        setEditing(value) { editing = value; },
        draft(changes = [{ componentId: 'track-title', textStyle: { color: '#123456' } }]) {
            return agent.preview({ baseRevision: agent.read().revision, changes });
        },
    };
}

test('Agent read and preview use detached copies without changing layout or committing', () => {
    const app = setup(), before = plain(app.layout);
    const observed = app.agent.read();
    observed.layout.components[0].hidden = true;
    const draft = app.draft([
        { componentId: 'track-title', textStyle: { color: '#123456' } },
        { componentId: 'time-readout', textStyle: { color: '#654321' } },
    ]);
    assert.equal(draft.status, 'DRAFT');
    assert.equal(app.agent.validate({ draftId: draft.draftId }).status, 'VALID');
    assert.deepEqual(app.layout, before);
    assert.equal(app.commits.length, 0);
    draft.layout.components[0].hidden = true;
    const snapshot = app.agent.state();
    assert.deepEqual(plain(snapshot.draft.before), before);
    snapshot.draft.layout.components[0].hidden = true;
    assert.equal(app.agent.state().draft.layout.components[0].hidden, before.components[0].hidden);
});

test('Agent patch rejects unknown fields, invalid values, unsupported components and normalization loss', () => {
    const app = setup();
    const invalid = [
        [{ componentId: 'track-title', locked: false }, 'UNKNOWN_FIELD'],
        [{ componentId: 'track-title', geometry: { x: '0.5' } }, 'INVALID_VALUE'],
        [{ componentId: 'track-title', geometry: { x: Infinity } }, 'INVALID_VALUE'],
        [{ componentId: 'track-title', geometry: { width: -1 } }, 'INVALID_VALUE'],
        [{ componentId: 'track-title', textStyle: { color: 'red' } }, 'INVALID_VALUE'],
        [{ componentId: 'track-title', hidden: 1 }, 'INVALID_VALUE'],
        [{ componentId: 'track-title', style: { cssText: 'display:none' } }, 'UNKNOWN_FIELD'],
        [{ componentId: 'not-a-component', hidden: true }, 'UNKNOWN_COMPONENT'],
        [{ componentId: 'track-title', geometry: { width: 1 } }, 'OUT_OF_RANGE_OR_UNSUPPORTED'],
    ];
    for (const [change, code] of invalid) assert.throws(() => app.draft([change]), new RegExp(code));
    assert.throws(() => app.agent.preview({ baseRevision: app.agent.read().revision, changes: [] }), /INVALID_CHANGES/);
    assert.throws(() => app.agent.preview({ baseRevision: app.agent.read().revision, changes: [], script: '' }), /UNKNOWN_FIELD/);
    assert.throws(() => app.draft([JSON.parse('{"componentId":"track-title","style":{"__proto__":{}}}')]), /UNKNOWN_FIELD/);
    assert.equal(app.commits.length, 0);
});

test('Agent checks panel and component locks and invalidates drafts after locking', async () => {
    const app = setup();
    app.layout.locked = true;
    assert.throws(() => app.draft(), /PANEL_LOCKED/);
    app.layout.locked = false;
    const title = app.layout.components.find(item => item.id === 'track-title');
    title.locked = true;
    assert.throws(() => app.draft(), /COMPONENT_LOCKED/);
    title.locked = false;
    const draft = app.draft();
    app.agent.requestApply({ draftId: draft.draftId });
    app.layout.locked = true;
    await assert.rejects(app.agent.confirm(), /CONFLICT|PANEL_LOCKED/);
    assert.equal(app.commits.length, 0);
});

test('Agent requires a separate confirmation and applies a batch as one transaction', async () => {
    const app = setup(), before = plain(app.layout);
    await assert.rejects(app.agent.confirm(), /NOTHING_TO_CONFIRM/);
    const draft = app.draft([
        { componentId: 'track-title', textStyle: { color: '#123456' } },
        { componentId: 'time-readout', textStyle: { color: '#654321' } },
    ]);
    assert.equal(app.agent.requestApply({ draftId: draft.draftId }).status, 'AWAITING_USER');
    assert.deepEqual(app.layout, before);
    assert.equal(app.commits.length, 0);
    const result = await app.agent.confirm();
    assert.equal(result.status, 'STORED');
    assert.equal(result.runtime.status, 'PENDING', 'storage completion does not imply HUD acknowledgement');
    assert.equal(app.commits.length, 1);
    assert.deepEqual(app.commits[0].metadata.before, before);
    assert.equal(app.commits[0].metadata.storageRevision, 'storage-1');
    assert.equal(app.layout.components.find(item => item.id === 'track-title').textStyle.color, '#123456');
    assert.equal(app.layout.components.find(item => item.id === 'time-readout').textStyle.color, '#654321');
    await assert.rejects(app.agent.confirm(), /NOTHING_TO_CONFIRM/);
});

test('Agent rejects stale layout or storage drafts and cancellation prevents application', async () => {
    for (const change of ['layout', 'storage']) {
        const app = setup(), draft = app.draft();
        app.agent.requestApply({ draftId: draft.draftId });
        if (change === 'layout') app.layout.components.find(item => item.id === 'time-readout').hidden = true;
        else app.changeRevision();
        await assert.rejects(app.agent.confirm(), /CONFLICT/);
        assert.equal(app.commits.length, 0);
    }
    const app = setup(), draft = app.draft();
    app.agent.requestApply({ draftId: draft.draftId });
    assert.equal(app.agent.cancel().status, 'CANCELLED');
    await assert.rejects(app.agent.confirm(), /NOTHING_TO_CONFIRM/);
    assert.throws(() => app.agent.validate({ draftId: draft.draftId }), /DRAFT_NOT_FOUND/);
});

test('Agent undo is confirmed separately and cannot overwrite intervening manual work', async () => {
    const app = setup(), before = plain(app.layout), draft = app.draft();
    app.agent.requestApply({ draftId: draft.draftId });
    await app.agent.confirm();
    const undo = app.agent.requestUndo({ baseRevision: app.agent.read().revision });
    assert.equal(undo.status, 'DRAFT');
    assert.equal(app.commits.length, 1);
    app.agent.requestApply({ draftId: undo.draftId });
    await app.agent.confirm();
    assert.deepEqual(app.layout, before);
    assert.equal(app.commits.length, 2);
    app.layout.components.find(item => item.id === 'time-readout').hidden = true;
    assert.throws(() => app.agent.requestUndo({ baseRevision: app.agent.read().revision }), /UNDO_CONFLICT/);
});

test('Agent slot read/load stays detached and saving only writes the confirmed target', async () => {
    const app = setup(), before = plain(app.layout), originalZero = plain(app.bank['0']);
    app.bank['4'].components.find(item => item.id === 'track-title').textStyle.color = '#abcdef';
    const readSlot = await app.agent.slot({ action: 'read', slot: '4' });
    readSlot.layout.components[0].hidden = true;
    assert.deepEqual(app.bank['4'].components[0], before.components[0]);
    const loaded = await app.agent.slot({ action: 'load', slot: '4', baseRevision: app.agent.read().revision });
    assert.equal(loaded.status, 'DRAFT');
    assert.deepEqual(app.layout, before);
    assert.equal(app.commits.length, 0);
    assert.equal(app.writes.length, 0);
    const save = await app.agent.slot({ action: 'save', slot: '9', baseRevision: app.agent.read().revision });
    assert.equal(save.status, 'AWAITING_USER');
    assert.equal(app.bank['9'], undefined);
    assert.equal((await app.agent.confirm()).status, 'SLOT_STORED');
    assert.deepEqual(app.bank['9'], before);
    assert.deepEqual(app.bank['0'], originalZero);
    assert.equal(app.writes.length, 1);
    await assert.rejects(app.agent.slot({ action: 'read', slot: '7' }), /EMPTY_SLOT/);
    await assert.rejects(app.agent.slot({ action: 'reset', slot: '0' }), /INVALID_SLOT/);
    await assert.rejects(app.agent.slot({ action: 'read', slot: '10' }), /INVALID_SLOT/);
});

test('Agent slot save rejects intervening edits before confirmation', async () => {
    const app = setup();
    await app.agent.slot({ action: 'save', slot: '9', baseRevision: app.agent.read().revision });
    app.changeRevision();
    await assert.rejects(app.agent.confirm(), /CONFLICT/);
    assert.equal(app.writes.length, 0);
});

test('Agent rejects colliding or disconnected drafts without moving unrelated components', () => {
    const app = setup(), before = plain(app.layout);
    const title = app.layout.components.find(item => item.id === 'track-title');
    assert.throws(() => app.draft([{ componentId: 'time-readout', geometry: { x: title.geometry.x, y: title.geometry.y } }]), /COLLISION/);
    assert.throws(() => app.draft([{ componentId: 'track-title', geometry: { x: .2, y: .1 } }]), /LAYOUT_DISCONNECTED/);
    assert.deepEqual(app.layout, before);
    assert.equal(app.agent.state().draft, null);
    assert.equal(app.commits.length, 0);
});

test('Agent rejects automatic save normalization that would mutate a locked component', () => {
    const app = setup();
    const menu = app.layout.components.find(item => item.id === 'source-selector');
    menu.geometry.z = 0;
    menu.locked = true;
    const before = plain(app.layout);
    assert.throws(() => app.draft(), /COMPONENT_LOCKED/);
    assert.deepEqual(app.layout, before);
    assert.equal(app.agent.state().draft, null);
});

test('Agent rejects a requested layer that save preparation would silently replace', () => {
    const app = setup(), before = plain(app.layout);
    assert.throws(() => app.draft([{ componentId: 'source-selector', layer: { enabled: true }, geometry: { z: 0 } }]), /OUT_OF_RANGE_OR_UNSUPPORTED/);
    assert.deepEqual(app.layout, before);
    assert.equal(app.agent.state().draft, null);
});

test('Agent refuses to draft or confirm while a manual editing gesture is active', async () => {
    const app = setup();
    app.setEditing(true);
    assert.throws(() => app.draft(), /BUSY/);
    app.setEditing(false);
    const draft = app.draft();
    app.agent.requestApply({ draftId: draft.draftId });
    app.setEditing(true);
    await assert.rejects(app.agent.confirm(), /BUSY/);
    assert.equal(app.commits.length, 0);
    app.setEditing(false);
    assert.equal((await app.agent.confirm()).status, 'STORED');
    assert.equal(app.commits.length, 1);
});


test('cancel and native abort prevent delayed slot loads from recreating a draft', async () => {
    for (const nativeAbort of [false, true]) {
        const app=setup();
        let resume;
        app.setSlotReadHook(()=>new Promise(resolve=>{resume=resolve;}));
        const controller=new AbortController();
        const task=app.agent.slot({action:'load',slot:'4',baseRevision:app.agent.read().revision},{signal:controller.signal});
        if(nativeAbort) controller.abort(); else app.agent.cancel();
        resume();
        await assert.rejects(task,/CANCELLED/);
        assert.equal(app.agent.state().draft,null);
        assert.equal(app.agent.state().pending,null);
    }
});

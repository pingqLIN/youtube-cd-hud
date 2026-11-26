(function () {
    'use strict';
    const clone = value => JSON.parse(JSON.stringify(value));
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const fail = code => { throw new Error(code); };
    const fields = {
        geometry: { x: [0, 1], y: [0, 1], width: [1, 4096], height: [1, 2160], z: [-99, 99] },
        textStyle: { fontSize: [8, 512], fontWeight: [100, 900], color: 'color', opacity: [0, 1], textAlign: ['left', 'center', 'right', 'justify'] },
        style: { backgroundColor: 'color', opacity: [0, 1], discOpacity: [0, 1] },
        layer: { enabled: 'boolean' },
    };
    function keys(value, allowed) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT');
        if (Object.keys(value).some(key => !allowed.includes(key))) fail('UNKNOWN_FIELD');
    }
    function create({ composer, getLayout, getRevision, getSelected = () => null, isEditing = () => false, commit, slots, onUpdate = () => {} }) {
        let fingerprint = '', revision = 0, generation = 0, draft = null, pending = null, previous = null, busy = false, request = '', lastResult = null;
        const id = () => globalThis.crypto.randomUUID();
        function current() {
            const layout = getLayout();
            const next = JSON.stringify([getRevision(), layout]);
            if (fingerprint !== next) { fingerprint = next; revision++; }
            return { revision: String(revision), storageRevision: getRevision(), layout: clone(layout) };
        }
        function guard(expected) {
            const state = current();
            if (state.revision !== expected) fail('CONFLICT');
            if (state.layout.locked) fail('PANEL_LOCKED');
            if (busy || isEditing()) fail('BUSY');
            return state;
        }
        function validate(before, candidate) {
            if (before.locked) fail('PANEL_LOCKED');
            for (const component of before.components) {
                if (component.locked && !same(component, composer.getComponent(candidate, component.id))) fail('COMPONENT_LOCKED');
            }
            for (const component of candidate.components) {
                if (!component.present) continue;
                if (composer.collisionFor(component, candidate.components, candidate.canvas)) fail('COLLISION');
            }
            if (!composer.connectedToBase(candidate, composer.getComponent(candidate, 'panel-base'))) fail('LAYOUT_DISCONNECTED');
            return true;
        }
        function publish(state, candidate, summary) {
            candidate = composer.prepareForSave(candidate);
            validate(state.layout, candidate);
            draft = { id: id(), baseRevision: state.revision, storageRevision: state.storageRevision, before: state.layout, layout: clone(candidate), summary };
            generation++;
            pending = null;
            onUpdate();
            return { status: 'DRAFT', draftId: draft.id, baseRevision: draft.baseRevision, summary, layout: clone(candidate) };
        }
        function preview(input) {
            keys(input, ['baseRevision', 'changes']);
            const state = guard(input.baseRevision);
            if (!Array.isArray(input.changes) || input.changes.length < 1 || input.changes.length > 40) fail('INVALID_CHANGES');
            const candidate = clone(state.layout);
            for (const change of input.changes) {
                keys(change, ['componentId', ...Object.keys(fields), 'hidden']);
                const component = composer.getComponent(candidate, change.componentId);
                if (!component || !component.present) fail('UNKNOWN_COMPONENT');
                if (component.locked) fail('COMPONENT_LOCKED');
                if ('hidden' in change) {
                    if (typeof change.hidden !== 'boolean') fail('INVALID_VALUE');
                    component.hidden = change.hidden;
                }
                for (const group of Object.keys(fields)) {
                    if (!(group in change)) continue;
                    if (!component[group]) fail('UNSUPPORTED_PROPERTY');
                    keys(change[group], Object.keys(fields[group]));
                    for (const [name, value] of Object.entries(change[group])) {
                        const rule = fields[group][name];
                        const valid = rule === 'color' ? typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value)
                            : rule === 'boolean' ? typeof value === 'boolean'
                                : typeof rule[0] === 'number' ? typeof value === 'number' && Number.isFinite(value) && value >= rule[0] && value <= rule[1]
                                    : rule.includes(value);
                        if (!valid) fail('INVALID_VALUE');
                        component[group][name] = value;
                    }
                }
            }
            composer.refreshSkin(candidate);
            const normalized = composer.prepareForSave(composer.normalizeLayout(candidate));
            // Normalization must not silently turn the requested edit into a different one.
            for (const change of input.changes) {
                const component = composer.getComponent(normalized, change.componentId);
                for (const group of Object.keys(fields)) for (const [name, value] of Object.entries(change[group] || {})) {
                    if (component[group]?.[name] !== value) fail('OUT_OF_RANGE_OR_UNSUPPORTED');
                }
            }
            return publish(state, normalized, [...new Set(input.changes.map(change => change.componentId))]);
        }
        function checkedDraft(draftId) {
            if (!draft || draft.id !== draftId) fail('DRAFT_NOT_FOUND');
            const state = guard(draft.baseRevision);
            validate(state.layout, draft.layout);
            return draft;
        }
        function requestApply(input) {
            keys(input, ['draftId']);
            checkedDraft(input.draftId);
            pending = { kind: 'apply', draftId: input.draftId };
            onUpdate();
            return { status: 'AWAITING_USER', draftId: input.draftId };
        }
        function requestUndo(input) {
            keys(input, ['baseRevision']);
            const state = guard(input.baseRevision);
            if (!previous || !same(state.layout, previous.after) || state.storageRevision !== previous.storageRevision) fail('UNDO_CONFLICT');
            return publish(state, previous.before, ['復原上次 Agent 套用']);
        }
        async function confirm() {
            if (!pending) fail('NOTHING_TO_CONFIRM');
            if (pending.kind === 'slot-save') {
                const action = pending;
                const state = guard(action.baseRevision);
                busy = true;
                try {
                    const bank = await slots.readSlots();
                    if (current().revision !== state.revision) fail('CONFLICT');
                    bank[action.slot] = state.layout;
                    await slots.writeSlots(bank);
                    pending = null;
                    lastResult = { status: 'SLOT_STORED', slot: action.slot };
                    return clone(lastResult);
                } finally { busy = false; onUpdate(); }
            }
            const accepted = checkedDraft(pending.draftId);
            busy = true;
            try {
                const result = await commit(clone(accepted.layout), { storageRevision: accepted.storageRevision, before: clone(accepted.before) });
                const after = current();
                previous = result.workspaceApplied === false ? null : { before: accepted.before, after: after.layout, storageRevision: after.storageRevision };
                draft = pending = null;
                lastResult = clone(result);
                return result;
            } finally { busy = false; onUpdate(); }
        }
        async function slot(input, { signal } = {}) {
            keys(input, ['action', 'slot', 'baseRevision']);
            if (!['read', 'load', 'save'].includes(input.action) || typeof input.slot !== 'string' || !/^[0-9]$/.test(input.slot)) fail('INVALID_SLOT');
            if (input.action === 'save') {
                guard(input.baseRevision);
                pending = { kind: 'slot-save', slot: input.slot, baseRevision: input.baseRevision };
                onUpdate();
                return { status: 'AWAITING_USER', slot: input.slot };
            }
            const started = generation;
            const bank = await slots.readSlots();
            if (generation !== started || signal?.aborted) fail('CANCELLED');
            if (!bank[input.slot]) fail('EMPTY_SLOT');
            if (input.action === 'read') return { slot: input.slot, layout: clone(bank[input.slot]) };
            const state = guard(input.baseRevision);
            const layout = clone(bank[input.slot]);
            layout.locked = state.layout.locked;
            return publish(state, layout, ['載入儲存槽 ' + input.slot]);
        }
        return Object.freeze({
            read: () => ({ ...current(), selected: getSelected(), userRequest: request, draftId: draft?.id || null, busy, lastResult: clone(lastResult) }),
            preview, requestApply, requestUndo, slot, confirm,
            validate: input => { keys(input, ['draftId']); checkedDraft(input.draftId); return { status: 'VALID', draftId: input.draftId }; },
            cancel() { if (busy) fail('BUSY'); generation++; draft = pending = null; onUpdate(); return { status: 'CANCELLED' }; },
            setRequest(text) { if (busy) fail('BUSY'); if (typeof text !== 'string' || text.length > 2000) fail('INVALID_REQUEST'); generation++; request = text; draft = pending = null; onUpdate(); },
            state: () => clone({ draft, pending, busy }),
        });
    }
    globalThis.YtCdHudPanelAgent = Object.freeze({ create });
})();

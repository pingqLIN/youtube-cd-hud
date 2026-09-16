(function () {
    'use strict';

    const SETTINGS_KEY = 'ytCdHudSettings';
    const LAYOUT_KEY = 'ytCdHudLayoutV2';
    const LEGACY_LAYOUT_KEY = 'ytCdHudLayoutV1';
    const REVISION_KEY = 'ytCdHudSettingsRevisionV1';
    const JOURNAL_KEY = 'ytCdHudSettingsOperationsV1';
    const MESSAGE_TYPE = 'YT_CD_HUD_SETTINGS';
    const JOURNAL_LIMIT = 32;
    let queue = Promise.resolve();

    function storage() { return globalThis.chrome?.storage?.local || null; }
    function api() { return globalThis.YtCdHudSettings || null; }
    function composer() { return globalThis.YtCdHudLiveMonitorComposer || null; }
    function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
    function enqueue(work) { const result = queue.then(work, work); queue = result.catch(() => {}); return result; }
    function digestInput(value) { return JSON.stringify(value === undefined ? null : value); }

    async function digest(value) {
        const bytes = new TextEncoder().encode(digestInput(value));
        if (globalThis.crypto?.subtle) {
            const hash = await crypto.subtle.digest('SHA-256', bytes);
            return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
        }
        throw new Error('CRYPTO_UNAVAILABLE');
    }

    function normalizeSettings(value) {
        const settingsApi = api();
        if (!settingsApi?.normalize) throw new Error('SETTINGS_API_UNAVAILABLE');
        return settingsApi.normalize(value || settingsApi.DEFAULTS);
    }

    function normalizeLayout(value) {
        const layoutApi = composer();
        if (layoutApi?.normalizeLayout) return layoutApi.normalizeLayout(value || null);
        return clone(value || null);
    }

    function validateLayout(value) {
        const layoutApi = composer();
        if (!layoutApi?.normalizeLayout || !layoutApi.prepareForSave || !layoutApi.getComponent || !layoutApi.connectedToBase) throw new Error('LAYOUT_VALIDATOR_UNAVAILABLE');
        const normalized = layoutApi.normalizeLayout(value);
        const prepared = layoutApi.prepareForSave(normalized);
        if (!layoutApi.connectedToBase(prepared, layoutApi.getComponent(prepared, 'panel-base'))) {
            throw new Error('LAYOUT_DISCONNECTED');
        }
        prepared.locked = true;
        return prepared;
    }

    async function readRaw() {
        const result = await storage().get([SETTINGS_KEY, LAYOUT_KEY, LEGACY_LAYOUT_KEY, REVISION_KEY]);
        const rawSettings = result[SETTINGS_KEY] ?? null;
        const rawLayout = result[LAYOUT_KEY] ?? result[LEGACY_LAYOUT_KEY] ?? null;
        const settings = normalizeSettings(rawSettings);
        const layout = normalizeLayout(rawLayout);
        const contentDigest = await digest({ settings, layout, rawSettings, rawLayout });
        return { revision: contentDigest, settings, layout, contentDigest };
    }

    async function read() {
        return { ok: true, snapshot: await readRaw() };
    }

    async function readJournal() {
        const result = await storage().get(JOURNAL_KEY);
        return Array.isArray(result[JOURNAL_KEY]) ? result[JOURNAL_KEY] : [];
    }

    async function writeJournal(entries) {
        await storage().set({ [JOURNAL_KEY]: entries.slice(-JOURNAL_LIMIT) });
    }

    function findOperation(entries, operationId) { return entries.find(entry => entry.operationId === operationId); }

    async function acknowledgeRuntime(revision) {
        if (!globalThis.chrome?.tabs?.query || !globalThis.chrome?.tabs?.sendMessage) return { status: 'PENDING', acknowledgedTabs: 0 };
        try {
            const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
            let acknowledgedTabs = 0;
            await Promise.all((tabs || []).map(tab => Promise.race([
                chrome.tabs.sendMessage(tab.id, { type: 'YT_CD_HUD_SETTINGS_VERIFY', revision }),
                new Promise(resolve => setTimeout(() => resolve(null), 1000)),
            ]).then(response => { if (response?.status === 'APPLIED' && response.revision === revision) acknowledgedTabs++; }).catch(() => {})));
            return { status: acknowledgedTabs ? 'APPLIED' : 'PENDING', acknowledgedTabs };
        } catch { return { status: 'PENDING', acknowledgedTabs: 0 }; }
    }

    function plainObject(value) {
        if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
        const prototype = Object.getPrototypeOf(value);
        return prototype === null || prototype?.constructor?.name === 'Object';
    }
    function validateSettingsInput(value) {
        if (!plainObject(value)) throw new Error('SCHEMA_INVALID');
        const settingsApi = api();
        const allowed = new Set(Object.keys(settingsApi.DEFAULTS));
        for (const [key, item] of Object.entries(value)) {
            if (!allowed.has(key)) throw new Error('SCHEMA_INVALID');
            const expected = settingsApi.DEFAULTS[key];
            if (typeof item !== typeof expected || (typeof expected === 'number' && !Number.isFinite(item))) throw new Error('SCHEMA_INVALID');
            if (typeof item === 'number' && !Number.isInteger(item) && ['discScale'].includes(key)) { /* fractional scale is valid */ }
            if (key === 'requestTimeoutMs' && (!Number.isInteger(item) || item < 5000 || item > 30000)) throw new Error('SCHEMA_INVALID');
            if (key === 'maxCandidates' && (!Number.isInteger(item) || item < 1 || item > 10)) throw new Error('SCHEMA_INVALID');
            if (key === 'titleFontSize' && (!Number.isInteger(item) || item < 9 || item > 28)) throw new Error('SCHEMA_INVALID');
            if (key === 'timeFontSize' && (!Number.isInteger(item) || item < 10 || item > 29)) throw new Error('SCHEMA_INVALID');
            if (key === 'discScale' && (item < 0.7 || item > 1.6)) throw new Error('SCHEMA_INVALID');
            if (key === 'surfaceOpacity' && (!Number.isInteger(item) || item < 45 || item > 100)) throw new Error('SCHEMA_INVALID');
            if (key === 'accentColor' && !/^#[0-9a-f]{6}$/i.test(item)) throw new Error('SCHEMA_INVALID');
            if (key === 'customCss' && item.length > 20000) throw new Error('SCHEMA_INVALID');
            if (key === 'fontFamily' && !Object.hasOwn(settingsApi.FONT_STACKS, item)) throw new Error('SCHEMA_INVALID');
            if (key === 'language' && !settingsApi.SUPPORTED_LANGUAGES.includes(item)) throw new Error('SCHEMA_INVALID');
        }
        if (!Object.keys(value).length) throw new Error('SCHEMA_INVALID');
    }

    async function apply(request) {
        const operationId = String(request.operationId || '');
        if (!/^[A-Za-z0-9._:-]{1,120}$/.test(operationId)) return { ok: false, error: 'OPERATION_ID_REQUIRED' };
        if (!/^[a-f0-9]{64}$/i.test(String(request.baseRevision || ''))) return { ok: false, error: 'BASE_REVISION_REQUIRED' };
        if (!plainObject(request.payload) || !Object.keys(request.payload).length || Object.keys(request.payload).some(key => !['settings', 'layout'].includes(key))) return { ok: false, error: 'SCHEMA_INVALID' };
        const payload = request.payload;
        if (payload.settings !== undefined) validateSettingsInput(payload.settings);
        const requestDigest = await digest({ baseRevision: request.baseRevision ?? null, payload });
        const journal = await readJournal();
        const previous = findOperation(journal, operationId);
        if (previous) {
            if (previous.requestDigest !== requestDigest) return { ok: false, error: 'OPERATION_REUSE_DENIED' };
            if (previous.status === 'PENDING') return { ok: false, error: 'INCOMPLETE', status: 'INCOMPLETE', snapshot: await readRaw() };
            return previous.result;
        }
        const current = await readRaw();
        if (request.baseRevision !== undefined && String(request.baseRevision) !== current.revision) {
            return { ok: false, error: 'CONFLICT', snapshot: current };
        }
        const nextSettings = payload.settings === undefined
            ? current.settings
            : normalizeSettings({ ...current.settings, ...payload.settings });
        const nextLayout = payload.layout === undefined ? current.layout : validateLayout(payload.layout);
        const nextRevision = await digest({ settings: nextSettings, layout: nextLayout, rawSettings: nextSettings, rawLayout: nextLayout });
        const result = { ok: true, status: 'STORED', snapshot: { revision: nextRevision, settings: nextSettings, layout: nextLayout } };
        const pending = { operationId, requestDigest, status: 'PENDING', result: null };
        await writeJournal([...journal.filter(entry => entry.operationId !== operationId), pending]);
        const finalJournal = [...journal.filter(entry => entry.operationId !== operationId), { operationId, requestDigest, status: 'STORED', result }];
        await storage().set({ [SETTINGS_KEY]: nextSettings, [LAYOUT_KEY]: nextLayout, [REVISION_KEY]: { revision: nextRevision }, [JOURNAL_KEY]: finalJournal.slice(-JOURNAL_LIMIT) });
        const verified = await readRaw();
        if (verified.revision !== nextRevision || digestInput(verified.settings) !== digestInput(nextSettings) || digestInput(verified.layout) !== digestInput(nextLayout)) {
            const incomplete = { ok: false, error: 'INCOMPLETE', status: 'INCOMPLETE', snapshot: verified };
            await writeJournal([...journal.filter(entry => entry.operationId !== operationId), { operationId, requestDigest, status: 'INCOMPLETE', result: incomplete }]);
            return incomplete;
        }
        return result;
    }

    async function execute(request = {}) {
        if (!storage()) return { ok: false, error: 'STORAGE_UNAVAILABLE' };
        const result = await enqueue(async () => {
            try {
                if (request.action === 'read') return await read();
                if (request.action === 'apply') return await apply(request);
                if (request.action === 'operation.status') {
                    const entry = findOperation(await readJournal(), String(request.operationId || ''));
                    if (entry?.status === 'PENDING') return { ok: false, error: 'INCOMPLETE', status: 'INCOMPLETE', snapshot: await readRaw() };
                    return entry?.result || { ok: true, status: 'UNKNOWN' };
                }
                return { ok: false, error: 'ACTION_DENIED' };
            } catch (error) { return { ok: false, error: String(error?.message || error) }; }
        });
        if (request.action === 'apply' && result?.ok && result.status === 'STORED' && result.snapshot) {
            result.runtime = await acknowledgeRuntime(result.snapshot.revision);
        }
        return result;
    }

    globalThis.YtCdHudSettingsCoordinator = Object.freeze({ execute });
    if (globalThis.chrome?.runtime?.onMessage?.addListener) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message?.type !== MESSAGE_TYPE) return false;
            const url = String(sender?.url || '');
            const isOptions = url === chrome.runtime.getURL('options/options.html');
            const isYouTube = /^https:\/\/www\.youtube\.com\//i.test(url) && Number.isInteger(sender?.tab?.id) && sender?.frameId === 0;
            const allowed = sender?.id === chrome.runtime.id && (isOptions || isYouTube);
            if (!allowed) { sendResponse({ ok: false, error: 'SENDER_DENIED' }); return false; }
            if (isYouTube && message.action === 'apply' && (!plainObject(message.payload) || Object.keys(message.payload).some(key => key !== 'layout'))) { sendResponse({ ok: false, error: 'SENDER_DENIED' }); return false; }
            void execute(message).then(sendResponse, () => sendResponse({ ok: false, error: 'COORDINATOR_ERROR' }));
            return true;
        });
    }
})();

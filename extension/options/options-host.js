(function () {
    'use strict';

    // The mirror installs its own MessagePort host before this native adapter loads.
    if (globalThis.YtCdHudOptionsHost) return;
    const client = globalThis.YtCdHudSettingsClient;
    function unwrap(result) {
        if (!result?.ok) {
            const error = new Error(result?.error || 'SETTINGS_UNAVAILABLE');
            error.snapshot = result?.snapshot;
            throw error;
        }
        return result;
    }
    globalThis.YtCdHudOptionsHost = Object.freeze({
        mode: 'native',
        async read() { return unwrap(await client.read()).snapshot; },
        async apply(request) { return unwrap(await client.apply(request)); },
        async operationStatus(operationId) { return unwrap(await client.operationStatus(operationId)); },
        async clearCache() {
            if (!globalThis.chrome?.storage?.local) throw new Error('CACHE_STORAGE_UNAVAILABLE');
            const key = 'ytCdHudTracklistCacheV1';
            await chrome.storage.local.set({ [key]: {} });
            const stored = await chrome.storage.local.get(key);
            if (!stored[key] || Object.keys(stored[key]).length) throw new Error('CACHE_CLEAR_UNCONFIRMED');
        },
    });
})();

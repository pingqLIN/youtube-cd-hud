(function () {
    'use strict';

    const STORAGE_KEY = 'liveMonitorLayout';

    async function load(defaultLayout) {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY);
            return result[STORAGE_KEY] || structuredClone(defaultLayout);
        } catch {
            return structuredClone(defaultLayout);
        }
    }

    async function save(layout) {
        await chrome.storage.local.set({ [STORAGE_KEY]: layout });
    }

    function reset(defaultLayout) {
        return structuredClone(defaultLayout);
    }

    globalThis.YtCdHudLiveMonitorLayoutStore = {
        STORAGE_KEY,
        load,
        save,
        reset
    };
})();

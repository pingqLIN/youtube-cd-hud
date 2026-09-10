(function () {
    'use strict';

    const composer = globalThis.YtCdHudLiveMonitorComposer;

    async function load() {
        const fallback = composer.createDefaultLayout();
        try {
            const result = await chrome.storage.local.get([composer.STORAGE_KEY, composer.LEGACY_STORAGE_KEY]);
            return composer.normalizeLayout(result[composer.STORAGE_KEY] || result[composer.LEGACY_STORAGE_KEY] || fallback);
        } catch (error) {
            console.warn('[CD HUD] Could not load Live Monitor layout; using defaults.', error);
            return fallback;
        }
    }

    async function save(layout) {
        const normalized = composer.normalizeLayout(layout);
        await chrome.storage.local.set({ [composer.STORAGE_KEY]: normalized });
        return normalized;
    }

    globalThis.YtCdHudLiveMonitorLayoutStore = Object.freeze({ load, save, normalize: composer.normalizeLayout });
})();

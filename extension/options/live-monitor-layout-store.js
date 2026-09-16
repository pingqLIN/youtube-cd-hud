(function () {
    'use strict';

    const composer = globalThis.YtCdHudLiveMonitorComposer;

    async function load() {
        const fallback = composer.createDefaultLayout();
        try {
            const snapshot = await globalThis.YtCdHudOptionsHost.read();
            return composer.normalizeLayout(snapshot.layout || fallback);
        } catch (error) {
            console.warn('[CD HUD] Could not load Live Monitor layout; using defaults.', error);
            return fallback;
        }
    }

    async function save(layout, baseRevision) {
        const normalized = composer.prepareForSave(layout);
        if (!baseRevision) throw new Error('BASE_REVISION_REQUIRED');
        const result = await globalThis.YtCdHudOptionsHost.apply({ operationId: crypto.randomUUID(), baseRevision, payload: { layout: normalized } });
        if (result.status !== 'STORED') throw new Error(result.error || 'INCOMPLETE');
        return result.snapshot.layout;
    }

    globalThis.YtCdHudLiveMonitorLayoutStore = Object.freeze({ load, save, normalize: composer.normalizeLayout });
})();

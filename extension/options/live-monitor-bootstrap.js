(function () {
    'use strict';

    const composer = globalThis.YtCdHudLiveMonitorComposer;
    const canvas = globalThis.YtCdHudLiveMonitorCanvasEditor;
    const store = globalThis.YtCdHudLiveMonitorLayoutStore;

    if (!composer || !canvas) return;

    const key = 'liveMonitorLayout';

    async function restore() {
        if (!store?.load) return;
        const layout = await store.load();
        if (layout && canvas.state) {
            canvas.state.layout = layout;
            canvas.syncComponents();
        }
    }

    async function persist() {
        if (!store?.save) return;
        await store.save(canvas.state.layout);
    }

    globalThis.YtCdHudLiveMonitorBootstrap = {
        restore,
        persist,
        key
    };

    void restore();
})();

(function () {
    'use strict';

    const assets = Object.freeze([
        { type: 'style', src: 'live-monitor-canvas-editor.css?v=2' },
        { type: 'style', src: 'live-monitor-property-toolbar.css?v=2' },
        { type: 'style', src: 'live-monitor-component-library.css?v=2' },
        { type: 'style', src: 'live-monitor-layout-presets.css?v=3' },
        { type: 'script', src: 'live-monitor-composer.js' },
        { type: 'script', src: 'live-monitor-layout-store.js' },
        { type: 'script', src: 'live-monitor-resize-engine.js' },
        { type: 'script', src: 'live-monitor-canvas-editor.js' },
        { type: 'script', src: 'live-monitor-property-toolbar.js' },
        { type: 'script', src: 'live-monitor-component-library.js' },
        { type: 'script', src: 'live-monitor-layout-presets.js' },
        { type: 'script', src: 'live-monitor-bootstrap.js' },
        { type: 'script', src: 'options.js' },
    ]);
    let loadPromise = null;

    function append(asset) {
        return new Promise((resolve, reject) => {
            const node = document.createElement(asset.type === 'style' ? 'link' : 'script');
            if (asset.type === 'style') { node.rel = 'stylesheet'; node.href = asset.src; }
            else { node.src = asset.src; node.defer = false; }
            node.addEventListener('load', resolve, { once: true });
            node.addEventListener('error', () => reject(new Error('Could not load ' + asset.src)), { once: true });
            document.head.appendChild(node);
        });
    }

    function load() {
        if (!loadPromise) loadPromise = assets.reduce((promise, asset) => promise.then(() => append(asset)), Promise.resolve());
        return loadPromise;
    }

    globalThis.YtCdHudLiveMonitorLoader = Object.freeze({ assets, load, ready: () => Boolean(loadPromise) });
    void load().catch(error => console.error('[CD HUD] Live Monitor runtime failed to load.', error));
})();

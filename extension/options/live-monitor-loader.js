(function () {
    'use strict';

    // Single entry bridge for Live Monitor Visual Composer.
    // Keeps options.html integration minimal and preserves existing settings flow.

    const modules = [
        'YtCdHudLiveMonitorComposer',
        'YtCdHudLiveMonitorLayoutStore',
        'YtCdHudLiveMonitorResizeEngine',
        'YtCdHudLiveMonitorCanvasEditor',
        'YtCdHudLiveMonitorPropertyToolbar',
        'YtCdHudLiveMonitorBootstrap'
    ];

    function ready() {
        return modules.every(name => globalThis[name] || name === 'YtCdHudLiveMonitorBootstrap');
    }

    globalThis.YtCdHudLiveMonitorLoader = {
        modules,
        ready
    };
})();

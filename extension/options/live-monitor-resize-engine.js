(function () {
    'use strict';

    const composer = globalThis.YtCdHudLiveMonitorComposer;

    function resize(component, width, height) {
        if (!composer || !component) return;

        const size = composer.clampSize(component.id, width, height);
        component.width = size.width;
        component.height = size.height;
        return component;
    }

    globalThis.YtCdHudLiveMonitorResizeEngine = {
        resize
    };
})();

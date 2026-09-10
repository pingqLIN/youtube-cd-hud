(function () {
    'use strict';

    function geometryForSize(component, width, height, baseGeometry = component?.geometry) {
        if (!component) return null;
        return { ...baseGeometry, width, height };
    }

    function geometryFromHandle(component, startGeometry, handle, deltaX, deltaY) {
        const direction = String(handle || 'se').toLowerCase();
        const width = startGeometry.width + (direction.includes('e') ? deltaX : direction.includes('w') ? -deltaX : 0);
        const height = startGeometry.height + (direction.includes('s') ? deltaY : direction.includes('n') ? -deltaY : 0);
        return geometryForSize(component, width, height, startGeometry);
    }

    globalThis.YtCdHudLiveMonitorResizeEngine = Object.freeze({ geometryForSize, geometryFromHandle });
})();

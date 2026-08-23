(function () {
    'use strict';

    // Live Monitor Visual Composer MVP
    // Keeps layout data independent from CSS rendering.

    const REQUIRED_COMPONENTS = new Set(['hud-root', 'track-info']);

    const registry = {
        'hud-root': {
            removable: false,
            zones: ['canvas'],
            min: { width: 320, height: 120 },
            max: { width: 1920, height: 1080 }
        },
        'track-info': {
            removable: false,
            zones: ['top', 'bottom', 'left', 'right'],
            min: { width: 160, height: 40 },
            max: { width: 800, height: 300 }
        },
        disc: {
            removable: true,
            zones: ['left', 'right'],
            min: { width: 60, height: 60 },
            max: { width: 600, height: 600 }
        },
        source-badge: {
            removable: true,
            zones: ['top', 'bottom'],
            min: { width: 40, height: 20 },
            max: { width: 240, height: 80 }
        }
    };

    const defaultLayout = {
        canvas: { width: 1280, height: 720 },
        components: [
            { id: 'hud-root', x: 0.5, y: 0.5, scale: 1 },
            { id: 'track-info', x: 0.5, y: 0.85, scale: 1 }
        ]
    };

    function canDelete(componentId, layout) {
        if (!registry[componentId]?.removable) return false;
        return layout.components.some(c => c.id === componentId) &&
            !REQUIRED_COMPONENTS.has(componentId);
    }

    function clampSize(id, width, height) {
        const rule = registry[id];
        if (!rule) return { width, height };
        return {
            width: Math.min(rule.max.width, Math.max(rule.min.width, width)),
            height: Math.min(rule.max.height, Math.max(rule.min.height, height))
        };
    }

    function toCss(component) {
        return {
            '--lm-x': `${component.x * 100}%`,
            '--lm-y': `${component.y * 100}%`,
            '--lm-scale': component.scale
        };
    }

    globalThis.YtCdHudLiveMonitorComposer = {
        registry,
        defaultLayout,
        canDelete,
        clampSize,
        toCss
    };
})();

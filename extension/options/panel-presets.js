/* YouTube CD HUD built-in panel presets. No storage writes or DOM side effects. */
(function (root) {
    'use strict';
    const META = Object.freeze([
        Object.freeze({ id: 'full', label: '全功能', width: 640, height: 320, description: '唱片、播放控制與曲目清單' }),
        Object.freeze({ id: 'compact', label: '精簡', width: 448, height: 112, description: '曲名、時間與跳曲控制' }),
        Object.freeze({ id: 'invisible', label: '隱形提示', width: 360, height: 80, description: '透明底座上的曲名與時間' }),
    ]);
    // Rectangles are CSS pixels relative to the panel's top-left corner.
    const RECTS = {
        full: {
            'panel-base': [0, 0, 640, 320], disc: [16, 16, 128, 128],
            'track-title': [160, 16, 392, 48], 'close-control': [560, 16, 64, 48],
            'time-readout': [160, 72, 192, 40], 'source-selector': [360, 72, 264, 40],
            'transport-controls': [160, 120, 160, 48], 'tracklist-panel': [16, 184, 608, 120],
        },
        compact: {
            'panel-base': [0, 0, 448, 112], 'track-title': [16, 8, 416, 40],
            'time-readout': [16, 60, 240, 44], 'transport-controls': [264, 60, 168, 44],
        },
        invisible: {
            'panel-base': [0, 0, 360, 80], 'track-title': [0, 0, 360, 40],
            'time-readout': [0, 48, 240, 32],
        },
    };
    const IDS = ['panel-base', 'disc', 'track-title', 'time-readout', 'source-selector',
        'tracklist-toggle', 'transport-controls', 'close-control', 'text-size-control', 'tracklist-panel'];
    const PALETTE = Object.freeze({ primaryColor: '#404549', secondaryColor: '#c5ee65' });

    function create(id, composer) {
        const preset = META.find(item => item.id === id);
        if (!preset) throw new RangeError('Unknown HUD panel preset: ' + id);
        if (!composer || composer.VERSION !== 2 || typeof composer.createDefaultLayout !== 'function'
            || typeof composer.normalizeLayout !== 'function') {
            throw new TypeError('A compatible YouTube CD HUD v2 composer is required.');
        }
        // Built-in presets start from the schema, not the independently authored install default.
        const layout = composer.normalizeLayout({ version: 2, components: Object.keys(composer.registry).map(id => ({ id })) });
        if (layout.components.length !== IDS.length || IDS.some(key => !layout.components.some(c => c.id === key))) {
            throw new TypeError('The composer component registry differs from this preset pack.');
        }
        layout.canvas = { width: 1280, height: 720, sizingMode: 'absolute',
            collisionPolicy: 'no-overlap-closed',
            alignmentGrid: { enabled: true, unitWidth: 4, unitHeight: 4, visible: false } };
        layout.palette = { ...PALETTE };
        // Fixed base prevents normalization from reflowing the authored composition.
        layout.manualBase = true;
        layout.locked = false;
        const left = (layout.canvas.width - preset.width) / 2;
        const top = (layout.canvas.height - preset.height) / 2;
        for (const component of layout.components) {
            const rect = RECTS[id][component.id];
            component.present = Boolean(rect);
            component.locked = false;
            delete component.hidden;
            component.layer = { enabled: component.id === 'disc' };
            component.effects = Object.fromEntries(Object.keys(component.effects || {}).map(key => [key, false]));
            component.style = {
                ...component.style, backgroundColor: PALETTE.primaryColor, borderColor: PALETTE.secondaryColor,
                opacity: 1, secondaryOpacity: .28, borderEnabled: false,
                backgroundEnabled: false, backgroundBlurEnabled: false,
                cornerEnabled: component.id === 'disc', cornerRadiusLevel: 3,
            };
            if (component.id === 'panel-base') {
                component.style.backgroundEnabled = id !== 'invisible';
                component.style.borderEnabled = id !== 'invisible';
                component.style.opacity = id === 'invisible' ? 0 : 1;
                component.style.secondaryOpacity = .2;
                component.style.cornerEnabled = true;
                component.boundary.padding = 16;
            }
            if (component.id === 'disc') {
                component.style.texture = 'classic';
                component.style.backgroundEnabled = true;
                component.style.borderEnabled = true;
                component.style.secondaryOpacity = .65;
            }
            if (['transport-controls', 'tracklist-toggle', 'text-size-control', 'close-control', 'source-selector'].includes(component.id)) {
                component.style.borderEnabled = true;
                component.style.cornerEnabled = true;
            }
            // Authored surfaces replace editor-only lock shading in every renderer.
            if (id !== 'invisible' && ['track-title', 'source-selector', 'transport-controls',
                'tracklist-toggle', 'text-size-control', 'close-control', 'tracklist-panel'].includes(component.id)) {
                component.style.backgroundEnabled = true;
                component.style.backgroundColor = component.id === 'track-title' ? '#4a4e52' : '#2d3135';
            }
            if (component.textStyle) {
                component.textStyle = { color: component.id === 'time-readout' ? '#c5ee65' : '#e8ece8',
                    opacity: 1, font: component.id === 'time-readout' ? 'cascadia-mono' : 'Segoe UI',
                    fontSize: component.id === 'track-title' ? (id === 'full' ? 20 : 18) : 14,
                    textAlign: ['track-title', 'time-readout', 'tracklist-panel'].includes(component.id) ? 'left' : 'center' };
            }
            if (component.arrangement) component.arrangement.split = false;
            if (rect) {
                const [x, y, width, height] = rect;
                component.geometry = { x: (left + x + width / 2) / 1280,
                    y: (top + y + height / 2) / 720, width, height,
                    z: component.id === 'panel-base' ? -1 : component.id === 'disc' ? 1 : 0 };
            }
        }
        return composer.normalizeLayout(layout);
    }

    function exportCode(id, composer) {
        return JSON.stringify({ format: 'youtube-cd-hud-panel', version: 1, layout: create(id, composer) }, null, 2);
    }

    root.YtCdHudPanelPack = Object.freeze({ version: '1.1.0', presets: META, create, exportCode });
})(globalThis);

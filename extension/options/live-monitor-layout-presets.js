(function () {
    'use strict';

    const composer = globalThis.YtCdHudLiveMonitorComposer;
    const STORAGE_KEY = 'ytCdHudLayoutSlotsV2';
    const SLOT_NAMES = Object.freeze(Array.from({ length: 10 }, (_, index) => String(index)));
    const BUNDLED_PRESETS = globalThis.YtCdHudPanelPack.presets;
    let memorySlots = {};

    // Legacy layout IDs remain import-compatible; current buttons use the panel pack.
    const BUNDLED_LAYOUTS = {
        "compact-playback": {
            "canvas": {
                "alignmentGrid": {
                    "enabled": true,
                    "unitHeight": 8,
                    "unitWidth": 8,
                    "visible": false
                },
                "collisionPolicy": "no-overlap-closed",
                "height": 720,
                "sizingMode": "absolute",
                "width": 1280
            },
            "components": [
                {
                    "boundary": {
                        "collision": false,
                        "mode": "dynamic-envelope",
                        "padding": 12,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {
                        "accentRail": true,
                        "shadow": true
                    },
                    "geometry": {
                        "height": 183.99999999999994,
                        "width": 508,
                        "x": 0.5109375,
                        "y": 0.5,
                        "z": -1
                    },
                    "id": "panel-base",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#111827",
                        "borderColor": "#7dd3fc",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 0.92
                    },
                    "type": "panel-base"
                },
                {
                    "effects": {
                        "glow": true
                    },
                    "geometry": {
                        "height": 200,
                        "width": 200,
                        "x": 0.3,
                        "y": 0.4888888888888889,
                        "z": 1
                    },
                    "id": "disc",
                    "layer": {
                        "enabled": true
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#111827",
                        "borderColor": "#7dd3fc",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1,
                        "texture": "gold"
                    },
                    "type": "disc"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {
                        "marquee": true
                    },
                    "geometry": {
                        "height": 48,
                        "width": 424,
                        "x": 0.4875,
                        "y": 0.4222222222222222,
                        "z": 0
                    },
                    "id": "track-title",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#111827",
                        "borderColor": "#7dd3fc",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1
                    },
                    "textStyle": {
                        "color": "#f8fafc",
                        "font": "cascadia-mono",
                        "fontSize": 18,
                        "opacity": 1,
                        "textAlign": "right"
                    },
                    "type": "track-title"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {},
                    "geometry": {
                        "height": 48,
                        "width": 144,
                        "x": 0.4375,
                        "y": 0.5,
                        "z": 0
                    },
                    "id": "time-readout",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#111827",
                        "borderColor": "#7dd3fc",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1
                    },
                    "textStyle": {
                        "color": "#7dd3fc",
                        "font": "cascadia-mono",
                        "fontSize": 16,
                        "opacity": 1,
                        "textAlign": "left"
                    },
                    "type": "time-readout"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {
                        "statusLamp": true
                    },
                    "geometry": {
                        "height": 48,
                        "width": 192,
                        "x": 0.58125,
                        "y": 0.5,
                        "z": 0
                    },
                    "id": "source-selector",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#111827",
                        "borderColor": "#7dd3fc",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1
                    },
                    "textStyle": {
                        "color": "#7dd3fc",
                        "font": "cascadia-mono",
                        "fontSize": 12,
                        "opacity": 1,
                        "textAlign": "center"
                    },
                    "type": "source-selector"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {},
                    "geometry": {
                        "height": 48,
                        "width": 48,
                        "x": 0.68125,
                        "y": 0.5,
                        "z": 0
                    },
                    "id": "tracklist-toggle",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#111827",
                        "borderColor": "#7dd3fc",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1
                    },
                    "textStyle": {
                        "color": "#7dd3fc",
                        "font": "cascadia-mono",
                        "fontSize": 12,
                        "opacity": 1,
                        "textAlign": "center"
                    },
                    "type": "tracklist-toggle"
                },
                {
                    "arrangement": {
                        "partSize": {
                            "height": 48,
                            "width": 72
                        },
                        "positions": {
                            "next": {
                                "x": 0.875,
                                "y": 0.32222222222222224
                            },
                            "previous": {
                                "x": 0.8125,
                                "y": 0.32222222222222224
                            }
                        },
                        "split": false
                    },
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {},
                    "geometry": {
                        "height": 48,
                        "width": 160,
                        "x": 0.44375,
                        "y": 0.5777777777777777,
                        "z": 0
                    },
                    "id": "transport-controls",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#111827",
                        "borderColor": "#7dd3fc",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1
                    },
                    "textStyle": {
                        "color": "#7dd3fc",
                        "font": "cascadia-mono",
                        "fontSize": 12,
                        "opacity": 1,
                        "textAlign": "center"
                    },
                    "type": "transport-controls"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {},
                    "geometry": {
                        "height": 48,
                        "width": 48,
                        "x": 0.68125,
                        "y": 0.4222222222222222,
                        "z": 0
                    },
                    "id": "close-control",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#111827",
                        "borderColor": "#7dd3fc",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1
                    },
                    "textStyle": {
                        "color": "#7dd3fc",
                        "font": "cascadia-mono",
                        "fontSize": 12,
                        "opacity": 1,
                        "textAlign": "center"
                    },
                    "type": "close-control"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {},
                    "geometry": {
                        "height": 48,
                        "width": 64,
                        "x": 0.71875,
                        "y": 0.5111111111111111,
                        "z": 0
                    },
                    "id": "text-size-control",
                    "layer": {
                        "enabled": false
                    },
                    "present": false,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#111827",
                        "borderColor": "#7dd3fc",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1
                    },
                    "textStyle": {
                        "color": "#7dd3fc",
                        "font": "cascadia-mono",
                        "fontSize": 12,
                        "opacity": 1,
                        "textAlign": "center"
                    },
                    "type": "text-size-control"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {
                        "accentRail": true,
                        "shadow": true
                    },
                    "geometry": {
                        "height": 256,
                        "width": 280,
                        "x": 0.8375,
                        "y": 0.2222222222222222,
                        "z": 0
                    },
                    "id": "tracklist-panel",
                    "layer": {
                        "enabled": false
                    },
                    "present": false,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#111827",
                        "borderColor": "#7dd3fc",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 0.88
                    },
                    "textStyle": {
                        "color": "#f8fafc",
                        "font": "cascadia-mono",
                        "fontSize": 18,
                        "opacity": 1,
                        "textAlign": "left"
                    },
                    "type": "tracklist-panel"
                }
            ],
            "palette": {
                "primaryColor": "#111827",
                "secondaryColor": "#7dd3fc"
            },
            "version": 2
        },
        "tracklist-reader": {
            "canvas": {
                "alignmentGrid": {
                    "enabled": true,
                    "unitHeight": 4,
                    "unitWidth": 4,
                    "visible": false
                },
                "collisionPolicy": "no-overlap-closed",
                "height": 720,
                "sizingMode": "absolute",
                "width": 1280
            },
            "components": [
                {
                    "boundary": {
                        "collision": false,
                        "mode": "dynamic-envelope",
                        "padding": 12,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {
                        "accentRail": true,
                        "shadow": true
                    },
                    "geometry": {
                        "height": 336,
                        "width": 722,
                        "x": 0.49609375,
                        "y": 0.5,
                        "z": -1
                    },
                    "id": "panel-base",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#18181b",
                        "borderColor": "#fbbf24",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 0.92
                    },
                    "type": "panel-base"
                },
                {
                    "effects": {
                        "glow": true
                    },
                    "geometry": {
                        "height": 328,
                        "width": 328,
                        "x": 0.36875,
                        "y": 0.31666666666666665,
                        "z": 1
                    },
                    "id": "disc",
                    "layer": {
                        "enabled": true
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#18181b",
                        "borderColor": "#fbbf24",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1,
                        "texture": "classic"
                    },
                    "type": "disc"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {
                        "marquee": true
                    },
                    "geometry": {
                        "height": 80,
                        "width": 364,
                        "x": 0.365625,
                        "y": 0.35,
                        "z": 2
                    },
                    "id": "track-title",
                    "layer": {
                        "enabled": true
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#18181b",
                        "borderColor": "#fbbf24",
                        "borderEnabled": false,
                        "cornerEnabled": false,
                        "cornerRadiusLevel": 4,
                        "opacity": 0.2
                    },
                    "textStyle": {
                        "color": "#f8fafc",
                        "font": "cascadia-mono",
                        "fontSize": 26,
                        "opacity": 1,
                        "textAlign": "left"
                    },
                    "type": "track-title"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {},
                    "geometry": {
                        "height": 48,
                        "width": 144,
                        "x": 0.2875,
                        "y": 0.6055555555555555,
                        "z": 0
                    },
                    "id": "time-readout",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#18181b",
                        "borderColor": "#fbbf24",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1
                    },
                    "textStyle": {
                        "color": "#fbbf24",
                        "font": "cascadia-mono",
                        "fontSize": 18,
                        "opacity": 1,
                        "textAlign": "left"
                    },
                    "type": "time-readout"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {
                        "statusLamp": true
                    },
                    "geometry": {
                        "height": 48,
                        "width": 200,
                        "x": 0.428125,
                        "y": 0.6055555555555555,
                        "z": 0
                    },
                    "id": "source-selector",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#18181b",
                        "borderColor": "#fbbf24",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1
                    },
                    "textStyle": {
                        "color": "#fbbf24",
                        "font": "cascadia-mono",
                        "fontSize": 14,
                        "opacity": 1,
                        "textAlign": "center"
                    },
                    "type": "source-selector"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {},
                    "geometry": {
                        "height": 48,
                        "width": 64,
                        "x": 0.48125,
                        "y": 0.6833333333333333,
                        "z": 0
                    },
                    "id": "tracklist-toggle",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#18181b",
                        "borderColor": "#fbbf24",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1
                    },
                    "textStyle": {
                        "color": "#fbbf24",
                        "font": "cascadia-mono",
                        "fontSize": 14,
                        "opacity": 1,
                        "textAlign": "center"
                    },
                    "type": "tracklist-toggle"
                },
                {
                    "arrangement": {
                        "partSize": {
                            "height": 48,
                            "width": 72
                        },
                        "positions": {
                            "next": {
                                "x": 0.6625,
                                "y": 0.6277777777777778
                            },
                            "previous": {
                                "x": 0.6,
                                "y": 0.6277777777777778
                            }
                        },
                        "split": false
                    },
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {},
                    "geometry": {
                        "height": 48,
                        "width": 208,
                        "x": 0.3125,
                        "y": 0.6833333333333333,
                        "z": 0
                    },
                    "id": "transport-controls",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#18181b",
                        "borderColor": "#fbbf24",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1
                    },
                    "textStyle": {
                        "color": "#fbbf24",
                        "font": "cascadia-mono",
                        "fontSize": 14,
                        "opacity": 1,
                        "textAlign": "center"
                    },
                    "type": "transport-controls"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {},
                    "geometry": {
                        "height": 64,
                        "width": 48,
                        "x": 0.4875,
                        "y": 0.5166666666666667,
                        "z": 0
                    },
                    "id": "close-control",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#18181b",
                        "borderColor": "#fbbf24",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1
                    },
                    "textStyle": {
                        "color": "#fbbf24",
                        "font": "cascadia-mono",
                        "fontSize": 14,
                        "opacity": 1,
                        "textAlign": "center"
                    },
                    "type": "close-control"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {},
                    "geometry": {
                        "height": 48,
                        "width": 64,
                        "x": 0.425,
                        "y": 0.6833333333333333,
                        "z": 0
                    },
                    "id": "text-size-control",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#18181b",
                        "borderColor": "#fbbf24",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 1
                    },
                    "textStyle": {
                        "color": "#fbbf24",
                        "font": "cascadia-mono",
                        "fontSize": 14,
                        "opacity": 1,
                        "textAlign": "center"
                    },
                    "type": "text-size-control"
                },
                {
                    "boundary": {
                        "collision": true,
                        "shape": "rect",
                        "state": "closed"
                    },
                    "effects": {
                        "accentRail": true,
                        "shadow": true
                    },
                    "geometry": {
                        "height": 312,
                        "width": 320,
                        "x": 0.64375,
                        "y": 0.5,
                        "z": 0
                    },
                    "id": "tracklist-panel",
                    "layer": {
                        "enabled": false
                    },
                    "present": true,
                    "style": {
                        "backgroundBlurEnabled": false,
                        "backgroundColor": "#18181b",
                        "borderColor": "#fbbf24",
                        "borderEnabled": true,
                        "cornerEnabled": true,
                        "cornerRadiusLevel": 4,
                        "opacity": 0.88
                    },
                    "textStyle": {
                        "color": "#f8fafc",
                        "font": "cascadia-mono",
                        "fontSize": 18,
                        "opacity": 1,
                        "textAlign": "left"
                    },
                    "type": "tracklist-panel"
                }
            ],
            "palette": {
                "primaryColor": "#18181b",
                "secondaryColor": "#fbbf24"
            },
            "version": 2
        }
    };

    function createBundledLayout(id) {
        if (BUNDLED_PRESETS.some(preset => preset.id === id)) return globalThis.YtCdHudPanelPack.create(id, composer);
        return Object.hasOwn(BUNDLED_LAYOUTS, id) ? composer.normalizeLayout(BUNDLED_LAYOUTS[id]) : null;
    }

    function defaultSlots() {
        return { '0': composer.createDefaultLayout(), ...Object.fromEntries(BUNDLED_PRESETS.map((preset, index) => [String(index + 1), createBundledLayout(preset.id)])) };
    }

    function normalizeSlots(value) {
        const source = value && typeof value === 'object' ? value : {};
        return Object.fromEntries(SLOT_NAMES.filter(name => source[name]).map(name => [name, composer.normalizeLayout(source[name])]));
    }

    async function readSlots() {
        const storage = globalThis.chrome?.storage?.local;
        const result = storage ? await storage.get(STORAGE_KEY) : { [STORAGE_KEY]: memorySlots };
        const saved = result[STORAGE_KEY];
        if (saved && Object.keys(saved).length) return { ...defaultSlots(), ...normalizeSlots(saved) };
        // Preserve old A/B/C slots as 4/5/6 without touching their session copy.
        const legacy = await globalThis.chrome?.storage?.session?.get('ytCdHudLayoutSlotsV1');
        const migrated = {};
        ['A', 'B', 'C'].forEach((name, index) => {
            if (legacy?.ytCdHudLayoutSlotsV1?.[name]) migrated[String(index + 4)] = legacy.ytCdHudLayoutSlotsV1[name];
        });
        const slots = { ...defaultSlots(), ...normalizeSlots(migrated) };
        if (Object.keys(migrated).length) await writeSlots(slots);
        return slots;
    }

    async function writeSlots(slots) {
        const normalized = normalizeSlots(slots);
        const storage = globalThis.chrome?.storage?.local;
        if (storage) await storage.set({ [STORAGE_KEY]: normalized });
        memorySlots = normalized;
        return normalized;
    }

    async function resetSlots() {
        return writeSlots({ ...await readSlots(), ...defaultSlots() });
    }

    function createControls({ host, editor, onChange = () => {} }) {
        if (!host) throw new Error('Live Monitor layout controls host is required.');
        const shell = document.createElement('section');
        shell.className = 'lm-layout-controls';
        shell.setAttribute('aria-label', 'Panel layout controls');
        const bundled = document.createElement('div');
        bundled.className = 'lm-layout-bundled';
        const foundation = document.createElement('div');
        foundation.className = 'lm-layout-foundation';
        const primaryLabel = document.createElement('label');
        primaryLabel.innerHTML = '<span>主題色</span>';
        const primary = document.createElement('input');
        primary.type = 'color';
        primary.dataset.lmPalette = 'primaryColor';
        primaryLabel.appendChild(primary);
        const secondaryLabel = document.createElement('label');
        secondaryLabel.innerHTML = '<span>輔色</span>';
        const secondary = document.createElement('input');
        secondary.type = 'color';
        secondary.dataset.lmPalette = 'secondaryColor';
        secondaryLabel.appendChild(secondary);
        function paletteOpacity(label, key) {
            const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '.01';
            input.dataset.lmPalette = key;
            input.setAttribute('aria-label', key === 'primaryOpacity' ? '主題色不透明度' : '輔色不透明度');
            const output = document.createElement('output');
            input.addEventListener('input', () => { editor.updatePalette({ [key]: Number(input.value) }); output.value = Math.round(Number(input.value) * 100) + '%'; });
            label.append(input, output);
            return { input, output };
        }
        const primaryOpacity = paletteOpacity(primaryLabel, 'primaryOpacity');
        const secondaryOpacity = paletteOpacity(secondaryLabel, 'secondaryOpacity');
        const viewportLabel = document.createElement('label');
        viewportLabel.innerHTML = '<span>畫布尺寸 · PX</span>';
        const viewport = document.createElement('select');
        viewport.dataset.lmCanvasPreset = 'true';
        composer.VIEWPORT_PRESETS.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.label;
            viewport.appendChild(option);
        });
        viewportLabel.appendChild(viewport);
        foundation.append(primaryLabel, secondaryLabel, viewportLabel);
        const mounted = document.createElement('select');
        mounted.setAttribute('aria-label', '選取面板元件');
        mounted.addEventListener('change', () => {
            editor.select(mounted.value);
            editor.centerView(mounted.value);
            document.querySelector('[data-lm-component="' + mounted.value + '"]')?.focus({ preventScroll: true });
        });
        const panelLock = document.createElement('button');
        panelLock.type = 'button';
        panelLock.className = 'secondary-button';
        panelLock.title = '只鎖定面板排版與外觀編輯；設定頁字級、主題、資料來源、快取及儲存功能仍可使用。';
        panelLock.addEventListener('click', () => editor.setLocked(!editor.state.layout.locked));
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'lm-layout-reset';
        reset.textContent = 'RESET';
        reset.title = 'Restore the Live Monitor canvas to its default layout';
        const align = document.createElement('button');
        align.type = 'button';
        align.className = 'lm-layout-align';
        align.textContent = 'AUTO ALIGN';
        align.title = 'Snap moved and resized units to the hidden alignment grid';
        const slots = document.createElement('div');
        slots.className = 'lm-layout-slots';
        const actions = document.createElement('div');
        actions.className = 'lm-layout-slot-actions';
        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = 'SAVE';
        const load = document.createElement('button');
        load.type = 'button';
        load.textContent = 'LOAD';
        const resetBank = document.createElement('button');
        resetBank.type = 'button';
        resetBank.textContent = '重設 0–3';
        resetBank.title = '恢復預設、全功能、精簡與隱形面板；保留 4–9';
        actions.append(save, load, resetBank);
        bundled.append(slots, actions);
        const status = document.createElement('p');
        status.className = 'lm-layout-slot-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.textContent = '0 預設 · 1 全功能 · 2 精簡 · 3 隱形 · 4–9 自訂；選擇儲存槽後讀取或儲存。';
        const pack = document.createElement('div');
        pack.className = 'lm-layout-pack';
        const scope = document.createElement('select');
        scope.setAttribute('aria-label', 'Resize scope / 縮放範圍');
        [['all', '全部 / All'], ['selected', '選取 / Selected'], ['group', '重疊群組 / Overlap group']].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            scope.appendChild(option);
        });
        const scale = document.createElement('input');
        scale.type = 'number';
        scale.min = '1';
        scale.max = '400';
        scale.step = '1';
        scale.value = '100';
        scale.setAttribute('aria-label', 'Scale percent / 縮放百分比');
        const applyScale = document.createElement('button');
        applyScale.type = 'button';
        applyScale.textContent = '打包縮放 / SCALE %';
        const undoScale = document.createElement('button');
        undoScale.type = 'button';
        undoScale.textContent = '復原縮放 / UNDO';
        undoScale.disabled = true;
        let beforeScale = null;
        let afterScale = null;
        applyScale.addEventListener('click', () => {
            if (!scale.checkValidity()) return scale.reportValidity();
            const previous = editor.getLayout();
            const result = editor.scaleGroup(Number(scale.value) / 100, scope.value);
            if (!result.updated) {
                status.textContent = result.reason;
                return;
            }
            beforeScale = previous;
            afterScale = JSON.stringify(editor.getLayout());
            undoScale.disabled = false;
            status.textContent = result.layersAssigned?.length
                ? '已自動分配 Z 軸並完成縮放；UNDO 可一併還原尺寸、位置與層級。'
                : '已按比例縮放；自動對齊已關閉以保留位置。Scaled proportionally; auto align is off to preserve positions.';
            scale.value = '100';
            sync();
        });
        undoScale.addEventListener('click', () => {
            if (!beforeScale) return;
            if (JSON.stringify(editor.getLayout()) !== afterScale) {
                status.textContent = 'Layout changed after scaling; undo is unavailable to preserve your edits.';
                undoScale.disabled = true;
                return;
            }
            editor.setLayout(beforeScale);
            onChange(editor.state.layout, 'group-scale-undo');
            beforeScale = null;
            undoScale.disabled = true;
            status.textContent = '縮放已復原 / Scale undone.';
            sync();
        });
        pack.append(scope, scale, applyScale, undoScale);
        const center = document.createElement('button');
        center.type = 'button'; center.textContent = '置中面板';
        center.addEventListener('click', () => editor.centerView());
        const extra = document.createElement('details'); extra.className = 'lm-layout-extra';
        const summary = document.createElement('summary'); summary.textContent = '尺寸工具';
        extra.append(summary, pack, reset);
        shell.append(mounted, align, center, extra, status);
        const lockHost = document.getElementById('live-monitor-panel-lock');
        (lockHost || shell).appendChild(panelLock);
        const theme = document.getElementById('live-monitor-theme');
        (theme || shell).append(bundled, foundation);
        host.appendChild(shell);
        globalThis.YtCdHudI18n?.localizeDocument(shell, document.documentElement.lang);
        let selectedSlot = '0';
        let storedSlots = {};

        function sync() {
            const layout = editor.state.layout;
            mounted.replaceChildren();
            const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '選取元件（包含透明元件）'; mounted.appendChild(placeholder);
            layout.components.filter(item => item.present).forEach(item => {
                const option = document.createElement('option'); option.value = item.id; option.textContent = composer.registry[item.id].label + (item.hidden ? ' · 不顯示' : '') + (item.locked ? ' · LOCK' : ''); mounted.appendChild(option);
            });
            mounted.value = editor.state.selected || '';
            primaryOpacity.input.value = String(layout.palette.primaryOpacity ?? 1);
            secondaryOpacity.input.value = String(layout.palette.secondaryOpacity ?? 1);
            for (const control of [primaryOpacity, secondaryOpacity]) { control.input.disabled = layout.locked; control.output.value = Math.round(Number(control.input.value) * 100) + '%'; }
            primary.value = layout.palette.primaryColor;
            secondary.value = layout.palette.secondaryColor;
            panelLock.textContent = layout.locked ? 'UNLOCK · 解鎖排版' : 'LOCK · 鎖定排版';
            panelLock.setAttribute('aria-pressed', String(layout.locked));
            panelLock.dataset.lmLockState = String(layout.locked);
            [primary, secondary, viewport, align, applyScale, scope, scale].forEach(node => { node.disabled = layout.locked; });
            const studio = document.getElementById('panel-studio');
            (studio?.querySelectorAll?.('#theme-font, #theme-custom-font, #theme-font-size') || []).forEach(node => { node.disabled = layout.locked; });
            viewport.value = composer.VIEWPORT_PRESETS.find(preset => preset.width === layout.canvas.width && preset.height === layout.canvas.height)?.id || 'hd';
            align.setAttribute('aria-pressed', layout.canvas.alignmentGrid.enabled ? 'true' : 'false');
            const caption = document.getElementById('live-monitor-canvas-status');
            if (caption) caption.textContent = '拖曳空白處平移視野 · 右下角調整工作區';
        }

        async function render() {
            storedSlots = await readSlots();
            slots.replaceChildren();
            SLOT_NAMES.forEach(name => {
                const slot = document.createElement('button');
                slot.type = 'button';
                slot.className = 'lm-layout-slot';
                slot.textContent = name;
                slot.dataset.filled = storedSlots[name] ? 'true' : 'false';
                slot.setAttribute('aria-pressed', selectedSlot === name ? 'true' : 'false');
                slot.title = storedSlots[name] ? '儲存槽 ' + name : '空白儲存槽 ' + name;
                slot.addEventListener('click', () => {
                    selectedSlot = name;
                    void render();
                });
                slots.appendChild(slot);
            });
            load.disabled = !storedSlots[selectedSlot];
            save.textContent = storedSlots[selectedSlot] ? '覆寫儲存' : '儲存';
            load.textContent = '讀取';
            sync();
        }

        primary.addEventListener('input', () => editor.updatePalette({ primaryColor: primary.value }));
        secondary.addEventListener('input', () => editor.updatePalette({ secondaryColor: secondary.value }));
        viewport.addEventListener('change', () => {
            const preset = composer.VIEWPORT_PRESETS.find(item => item.id === viewport.value);
            if (preset) editor.updateViewport(preset.width, preset.height);
            sync();
        });
        save.addEventListener('click', async () => {
            const targetSlot = selectedSlot;
            const snapshot = composer.normalizeLayout(editor.getLayout());
            try {
                const current = await readSlots();
                current[targetSlot] = snapshot;
                await writeSlots(current);
                status.textContent = '已儲存至 ' + targetSlot + ' 號槽。';
                await render();
            } catch (error) { status.textContent = '儲存失敗：' + error.message; }
        });
        load.addEventListener('click', () => {
            const layout = storedSlots[selectedSlot];
            if (!layout) return;
            editor.setLayout(layout);
            onChange(editor.state.layout, 'slot-load');
            status.textContent = 'Style ' + selectedSlot + ' loaded.';
            sync();
        });

        resetBank.addEventListener('click', async () => {
            try {
                await resetSlots();
                await render();
                status.textContent = '已恢復 0–3；4–9 與目前畫布保留。';
            } catch (error) { status.textContent = '重設失敗：' + error.message; }
        });

        reset.addEventListener('click', () => {
            editor.setLayout(composer.createDefaultLayout());
            onChange(editor.state.layout, 'layout-reset');
            status.textContent = 'Live Monitor layout reset to defaults.';
            sync();
        });
        align.addEventListener('click', () => {
            const enabled = !editor.state.layout.canvas.alignmentGrid.enabled;
            editor.updateAlignment(enabled);
            align.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            const grid = editor.state.layout.canvas.alignmentGrid;
            status.textContent = enabled ? `Auto align enabled on the hidden ${grid.unitWidth} × ${grid.unitHeight} grid.` : 'Auto align disabled.';
        });
        void render().catch(error => {
            console.warn('[CD HUD] Could not load temporary layout slots.', error);
            status.textContent = '儲存槽無法讀取，請重新開啟設定頁。';
        });
        return Object.freeze({ element: shell, render, sync, readSlots });
    }

    globalThis.YtCdHudLiveMonitorLayoutPresets = Object.freeze({ STORAGE_KEY, SLOT_NAMES, BUNDLED_PRESETS, createBundledLayout, readSlots, writeSlots, resetSlots, createControls });
})();

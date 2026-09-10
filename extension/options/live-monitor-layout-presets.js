(function () {
    'use strict';

    const composer = globalThis.YtCdHudLiveMonitorComposer;
    const STORAGE_KEY = 'ytCdHudLayoutSlotsV1';
    const SLOT_NAMES = Object.freeze(['A', 'B', 'C']);
    const BUNDLED_PRESETS = Object.freeze([
        Object.freeze({ id: 'compact-playback', labelKey: 'options.presetCompact', descriptionKey: 'options.presetCompactDescription' }),
        Object.freeze({ id: 'tracklist-reader', labelKey: 'options.presetReader', descriptionKey: 'options.presetReaderDescription' }),
    ]);
    let memorySlots = {};

    // Approved saved layouts. Keep their positions, layers, and styling intact.
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
        if (!BUNDLED_PRESETS.some(preset => preset.id === id)) return null;
        return composer.normalizeLayout(BUNDLED_LAYOUTS[id]);
    }

    function sessionStorage() {
        return globalThis.chrome?.storage?.session || null;
    }

    function normalizeSlots(value) {
        const source = value && typeof value === 'object' ? value : {};
        return Object.fromEntries(SLOT_NAMES
            .filter(name => source[name])
            .map(name => [name, composer.normalizeLayout(source[name])]));
    }

    async function readSlots() {
        const storage = sessionStorage();
        if (!storage) return normalizeSlots(memorySlots);
        const result = await storage.get(STORAGE_KEY);
        return normalizeSlots(result[STORAGE_KEY]);
    }

    async function writeSlots(slots) {
        const normalized = normalizeSlots(slots);
        memorySlots = normalized;
        const storage = sessionStorage();
        if (storage) await storage.set({ [STORAGE_KEY]: normalized });
        return normalized;
    }

    function createControls({ host, editor, onChange = () => {} }) {
        if (!host) throw new Error('Live Monitor layout controls host is required.');
        const shell = document.createElement('section');
        shell.className = 'lm-layout-controls';
        shell.setAttribute('aria-label', 'Layout reset and temporary style slots');
        const bundled = document.createElement('div');
        bundled.className = 'lm-layout-bundled';
        const bundledTitle = document.createElement('p');
        bundledTitle.className = 'lm-layout-bundled-title';
        bundledTitle.dataset.i18n = 'options.bundledPresets';
        bundledTitle.textContent = 'Built-in panels';
        const bundledChoices = document.createElement('div');
        bundledChoices.className = 'lm-layout-bundled-choices';
        const bundledHint = document.createElement('p');
        bundledHint.className = 'lm-layout-bundled-hint';
        bundledHint.dataset.i18n = 'options.presetHint';
        bundledHint.textContent = 'Load a panel to preview it, then Save and apply. Built-in panels are always available.';
        BUNDLED_PRESETS.forEach(preset => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'lm-layout-bundled-choice';
            button.dataset.lmBundledPreset = preset.id;
            const label = document.createElement('strong');
            label.dataset.i18n = preset.labelKey;
            label.textContent = preset.id === 'compact-playback' ? 'Compact playback' : 'Tracklist reader';
            const description = document.createElement('span');
            description.dataset.i18n = preset.descriptionKey;
            description.textContent = preset.id === 'compact-playback' ? 'A small panel with playback essentials.' : 'Larger text with a persistent tracklist on the right.';
            button.append(label, description);
            button.addEventListener('click', () => {
                editor.setLayout(createBundledLayout(preset.id));
                onChange(editor.state.layout, 'bundled-preset-load');
                status.textContent = globalThis.YtCdHudI18n?.translate('options.presetLoaded', document.documentElement.lang)
                    || 'Built-in panel loaded. Save and apply to use it on YouTube.';
                sync();
            });
            bundledChoices.appendChild(button);
        });
        bundled.append(bundledTitle, bundledChoices, bundledHint);
        const foundation = document.createElement('div');
        foundation.className = 'lm-layout-foundation';
        const primaryLabel = document.createElement('label');
        primaryLabel.innerHTML = '<span>PRIMARY</span>';
        const primary = document.createElement('input');
        primary.type = 'color';
        primary.dataset.lmPalette = 'primaryColor';
        primaryLabel.appendChild(primary);
        const secondaryLabel = document.createElement('label');
        secondaryLabel.innerHTML = '<span>SECONDARY</span>';
        const secondary = document.createElement('input');
        secondary.type = 'color';
        secondary.dataset.lmPalette = 'secondaryColor';
        secondaryLabel.appendChild(secondary);
        const viewportLabel = document.createElement('label');
        viewportLabel.innerHTML = '<span>VIEWPORT</span>';
        const viewport = document.createElement('select');
        viewport.dataset.lmCanvasPreset = 'true';
        composer.VIEWPORT_PRESETS.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.label;
            viewport.appendChild(option);
        });
        viewportLabel.appendChild(viewport);
        const sizingLabel = document.createElement('label');
        sizingLabel.innerHTML = '<span>SIZE MODE</span>';
        const sizing = document.createElement('select');
        sizing.dataset.lmSizingMode = 'true';
        [['absolute', 'ABS · PX'], ['relative', 'REL · %']].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            sizing.appendChild(option);
        });
        sizingLabel.appendChild(sizing);
        foundation.append(primaryLabel, secondaryLabel, viewportLabel, sizingLabel);
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
        actions.append(save, load);
        const status = document.createElement('p');
        status.className = 'lm-layout-slot-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.textContent = 'A / B / C are kept for this browser session.';
        shell.append(bundled, foundation, reset, align, slots, actions, status);
        host.appendChild(shell);
        globalThis.YtCdHudI18n?.localizeDocument(shell, document.documentElement.lang);
        let selectedSlot = 'A';
        let storedSlots = {};

        function sync() {
            const layout = editor.state.layout;
            primary.value = layout.palette.primaryColor;
            secondary.value = layout.palette.secondaryColor;
            sizing.value = layout.canvas.sizingMode;
            viewport.value = composer.VIEWPORT_PRESETS.find(preset => preset.width === layout.canvas.width && preset.height === layout.canvas.height)?.id || 'hd';
            align.setAttribute('aria-pressed', layout.canvas.alignmentGrid.enabled ? 'true' : 'false');
            const caption = document.getElementById('live-monitor-canvas-status');
            if (caption) caption.textContent = `YOUTUBE PLAYER / ${layout.canvas.width}×${layout.canvas.height} / ${layout.canvas.sizingMode === 'relative' ? 'REL' : 'ABS'}`;
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
                slot.title = storedSlots[name] ? 'Stored style ' + name : 'Empty style ' + name;
                slot.addEventListener('click', () => {
                    selectedSlot = name;
                    void render();
                });
                slots.appendChild(slot);
            });
            load.disabled = !storedSlots[selectedSlot];
            save.textContent = storedSlots[selectedSlot] ? 'OVERWRITE' : 'SAVE';
            sync();
        }

        primary.addEventListener('input', () => editor.updatePalette({ primaryColor: primary.value }));
        secondary.addEventListener('input', () => editor.updatePalette({ secondaryColor: secondary.value }));
        viewport.addEventListener('change', () => {
            const preset = composer.VIEWPORT_PRESETS.find(item => item.id === viewport.value);
            if (preset) editor.updateViewport(preset.width, preset.height);
            sync();
        });
        sizing.addEventListener('change', () => {
            editor.updateSizingMode(sizing.value);
            sync();
        });

        save.addEventListener('click', async () => {
            const current = await readSlots();
            current[selectedSlot] = editor.getLayout();
            await writeSlots(current);
            status.textContent = 'Style ' + selectedSlot + ' stored for this browser session.';
            await render();
        });
        load.addEventListener('click', () => {
            const layout = storedSlots[selectedSlot];
            if (!layout) return;
            editor.setLayout(layout);
            onChange(editor.state.layout, 'slot-load');
            status.textContent = 'Style ' + selectedSlot + ' loaded.';
            sync();
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
            status.textContent = 'Temporary style slots are unavailable.';
        });
        return Object.freeze({ element: shell, render, sync, readSlots });
    }

    globalThis.YtCdHudLiveMonitorLayoutPresets = Object.freeze({ STORAGE_KEY, SLOT_NAMES, BUNDLED_PRESETS, createBundledLayout, readSlots, writeSlots, createControls });
})();

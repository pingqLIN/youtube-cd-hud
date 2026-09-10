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

    function createBundledLayout(id) {
        if (!BUNDLED_PRESETS.some(preset => preset.id === id)) return null;
        const reader = id === 'tracklist-reader';
        const layout = composer.createDefaultLayout();
        if (reader) {
            layout.canvas.alignmentGrid.unitWidth = 4;
            layout.canvas.alignmentGrid.unitHeight = 4;
        }
        const palette = reader
            ? { primaryColor: '#18181b', secondaryColor: '#fbbf24' }
            : { primaryColor: '#111827', secondaryColor: '#7dd3fc' };
        // Pixel centers on the shipped 1280 × 720 canvas; normalization applies
        // the same size, alignment, and collision rules as manually edited layouts.
        const frames = reader ? {
            disc: [464, 256, 128, 128],
            'track-title': [436, 360, 296, 64],
            'time-readout': [360, 424, 144, 48],
            'source-selector': [540, 424, 200, 48],
            'tracklist-toggle': [608, 480, 64, 48],
            'transport-controls': [392, 480, 208, 48],
            'close-control': [616, 360, 48, 64],
            'text-size-control': [536, 480, 64, 48],
            'tracklist-panel': [816, 348, 320, 312],
        } : {
            disc: [144, 552, 88, 88],
            'track-title': [376, 512, 336, 48],
            'time-readout': [280, 568, 144, 48],
            'source-selector': [464, 568, 192, 48],
            'tracklist-toggle': [592, 568, 48, 48],
            'transport-controls': [288, 624, 160, 48],
            'close-control': [592, 512, 48, 48],
        };
        const themed = composer.applyPalette(layout, palette, true);
        for (const component of themed.components) {
            const frame = frames[component.id];
            if (component.id === 'panel-base') {
                component.boundary.padding = 12;
                component.style.opacity = .92;
            } else {
                component.present = Boolean(frame);
                if (frame) {
                    const [x, y, width, height] = frame;
                    component.geometry = { ...component.geometry, x: x / layout.canvas.width, y: y / layout.canvas.height, width, height };
                }
            }
            component.style.cornerEnabled = true;
            component.style.cornerRadiusLevel = 4;
            if (component.textStyle) {
                component.textStyle.fontSize = reader ? 14 : 12;
                if (['track-title', 'tracklist-panel'].includes(component.id)) {
                    component.textStyle.fontSize = reader ? (component.id === 'track-title' ? 24 : 18) : 18;
                    component.textStyle.color = '#f8fafc';
                }
                if (component.id === 'time-readout') component.textStyle.fontSize = reader ? 18 : 16;
            }
        }
        const normalized = composer.normalizeLayout(themed);
        // Center the complete visible group, including the disc outside the
        // dynamic base, so each preset leaves room to edit on all four sides.
        const visible = normalized.components.filter(component => component.present);
        const rects = visible.map(component => composer.componentRect(component.geometry, normalized.canvas));
        const grid = normalized.canvas.alignmentGrid;
        const dx = Math.round((normalized.canvas.width - Math.min(...rects.map(rect => rect.left)) - Math.max(...rects.map(rect => rect.right))) / 2 / grid.unitWidth) * grid.unitWidth;
        const dy = Math.round((normalized.canvas.height - Math.min(...rects.map(rect => rect.top)) - Math.max(...rects.map(rect => rect.bottom))) / 2 / grid.unitHeight) * grid.unitHeight;
        for (const component of visible) {
            component.geometry.x += dx / normalized.canvas.width;
            component.geometry.y += dy / normalized.canvas.height;
            if (component.arrangement) {
                for (const position of Object.values(component.arrangement.positions)) {
                    position.x += dx / normalized.canvas.width;
                    position.y += dy / normalized.canvas.height;
                }
            }
        }
        return composer.normalizeLayout(normalized);
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

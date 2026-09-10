(function () {
    'use strict';

    const composer = globalThis.YtCdHudLiveMonitorComposer;
    const STORAGE_KEY = 'ytCdHudLayoutSlotsV1';
    const SLOT_NAMES = Object.freeze(['A', 'B', 'C']);
    let memorySlots = {};

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
        shell.append(foundation, reset, align, slots, actions, status);
        host.appendChild(shell);
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
            status.textContent = enabled ? 'Auto align enabled on the hidden 8 × 8 grid.' : 'Auto align disabled.';
        });
        void render().catch(error => {
            console.warn('[CD HUD] Could not load temporary layout slots.', error);
            status.textContent = 'Temporary style slots are unavailable.';
        });
        return Object.freeze({ element: shell, render, sync, readSlots });
    }

    globalThis.YtCdHudLiveMonitorLayoutPresets = Object.freeze({ STORAGE_KEY, SLOT_NAMES, readSlots, writeSlots, createControls });
})();

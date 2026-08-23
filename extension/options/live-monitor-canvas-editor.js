(function () {
    'use strict';

    const composer = globalThis.YtCdHudLiveMonitorComposer;
    if (!composer) return;

    const preview = document.getElementById('hud-preview');
    if (!preview) return;

    const state = {
        selected: null,
        layout: structuredClone(composer.defaultLayout),
        dragging: false,
        pointer: null,
    };

    function findComponent(id) {
        return state.layout.components.find(component => component.id === id);
    }

    function renderSelection() {
        preview.querySelectorAll('[data-lm-component]').forEach(node => {
            node.classList.toggle('lm-selected', node.dataset.lmComponent === state.selected);
        });
    }

    function select(id) {
        state.selected = id;
        renderSelection();
    }

    function applyComponentStyle(node, component) {
        const css = composer.toCss(component);
        Object.entries(css).forEach(([key, value]) => {
            node.style.setProperty(key, value);
        });
    }

    function syncComponents() {
        preview.querySelectorAll('[data-lm-component]').forEach(node => {
            const component = findComponent(node.dataset.lmComponent);
            if (component) applyComponentStyle(node, component);
        });
    }

    preview.querySelectorAll('.preview-disc, .preview-info, .preview-source').forEach(node => {
        const id = node.classList.contains('preview-disc') ? 'disc' :
            node.classList.contains('preview-info') ? 'track-info' : 'source-badge';
        node.dataset.lmComponent = id;
    });

    preview.addEventListener('pointerdown', event => {
        const target = event.target.closest('[data-lm-component]');
        if (!target) return;
        select(target.dataset.lmComponent);
        state.dragging = true;
        state.pointer = { x: event.clientX, y: event.clientY };
        target.setPointerCapture(event.pointerId);
    });

    preview.addEventListener('pointermove', event => {
        if (!state.dragging || !state.selected) return;
        const component = findComponent(state.selected);
        if (!component) return;

        const rect = preview.getBoundingClientRect();
        component.x = Math.max(0, Math.min(1, component.x + (event.clientX - state.pointer.x) / rect.width));
        component.y = Math.max(0, Math.min(1, component.y + (event.clientY - state.pointer.y) / rect.height));
        state.pointer = { x: event.clientX, y: event.clientY };
        syncComponents();
    });

    preview.addEventListener('pointerup', () => {
        state.dragging = false;
    });

    preview.addEventListener('wheel', event => {
        if (!state.selected) return;
        const component = findComponent(state.selected);
        if (!component) return;
        component.scale = Math.max(0.25, Math.min(4, component.scale - event.deltaY * 0.001));
        syncComponents();
        event.preventDefault();
    }, { passive: false });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Delete' || !state.selected) return;
        if (!composer.canDelete(state.selected, state.layout)) return;
        state.layout.components = state.layout.components.filter(component => component.id !== state.selected);
        state.selected = null;
        renderSelection();
    });

    syncComponents();
    globalThis.YtCdHudLiveMonitorCanvasEditor = { state, syncComponents };
})();

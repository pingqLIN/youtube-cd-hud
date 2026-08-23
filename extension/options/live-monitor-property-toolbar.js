(function () {
    'use strict';

    const editor = globalThis.YtCdHudLiveMonitorCanvasEditor;
    if (!editor) return;

    const preview = document.getElementById('hud-preview');
    if (!preview) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'lm-property-toolbar';
    toolbar.hidden = true;
    toolbar.innerHTML = `
        <button data-action="color">🎨</button>
        <button data-action="font">🔤</button>
        <button data-action="size">📐</button>
        <button data-action="delete">🗑</button>
    `;

    preview.parentElement.appendChild(toolbar);

    function update() {
        if (!editor.state.selected) {
            toolbar.hidden = true;
            return;
        }

        toolbar.hidden = false;
    }

    document.addEventListener('click', update);

    toolbar.addEventListener('click', event => {
        const action = event.target.dataset.action;
        if (!action) return;

        if (action === 'delete') {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
        }

        if (action === 'size') {
            const component = editor.state.layout.components.find(
                item => item.id === editor.state.selected
            );
            if (component) {
                component.scale = Math.min(4, component.scale + 0.1);
                editor.syncComponents();
            }
        }
    });

    globalThis.YtCdHudLiveMonitorToolbar = { update };
})();

(function () {
    'use strict';

    const composer = globalThis.YtCdHudLiveMonitorComposer;
    const store = globalThis.YtCdHudLiveMonitorLayoutStore;
    const editorApi = globalThis.YtCdHudLiveMonitorCanvasEditor;
    const toolbarApi = globalThis.YtCdHudLiveMonitorPropertyToolbar;
    const libraryApi = globalThis.YtCdHudLiveMonitorComponentLibrary;
    const presetsApi = globalThis.YtCdHudLiveMonitorLayoutPresets;
    let instance = null;

    function init({ preview, layout, onChange = () => {} }) {
        if (instance) {
            instance.editor.setLayout(layout, { resetHistory: true });
            return instance;
        }
        function setupFloatingPanel(host) {
            if (!host || host.querySelector('.preview-properties-header')) return;
            const header = document.createElement('div');
            header.className = 'preview-properties-header';
            const title = document.createElement('span');
            title.className = 'preview-properties-title';
            title.textContent = '⋮⋮ 屬性面板';
            title.title = '拖曳移動面板位置';
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'preview-properties-toggle';
            toggle.setAttribute('aria-expanded', 'true');
            toggle.setAttribute('aria-label', '收合或展開屬性面板');
            toggle.textContent = '收合 ▾';
            toggle.addEventListener('click', event => {
                event.stopPropagation();
                const collapsed = host.classList.toggle('is-collapsed');
                toggle.setAttribute('aria-expanded', String(!collapsed));
                toggle.textContent = collapsed ? '展開 ◵' : '收合 ▾';
            });
            header.append(title, toggle);
            host.prepend(header);

            let drag = null;
            header.addEventListener('pointerdown', event => {
                if (event.button !== 0 || event.target === toggle) return;
                const workbench = host.parentElement;
                if (!workbench) return;
                event.preventDefault();
                const hostRect = host.getBoundingClientRect();
                const benchRect = workbench.getBoundingClientRect();
                drag = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    origLeft: hostRect.left - benchRect.left,
                    origTop: hostRect.top - benchRect.top,
                    maxLeft: Math.max(0, benchRect.width - hostRect.width),
                    maxTop: Math.max(0, benchRect.height - 40),
                };
                header.setPointerCapture?.(event.pointerId);
                header.classList.add('is-dragging');
            });
            header.addEventListener('pointermove', event => {
                if (!drag || event.pointerId !== drag.pointerId) return;
                const dx = event.clientX - drag.startX;
                const dy = event.clientY - drag.startY;
                const left = Math.max(0, Math.min(drag.maxLeft, drag.origLeft + dx));
                const top = Math.max(0, Math.min(drag.maxTop, drag.origTop + dy));
                host.style.left = left + 'px';
                host.style.top = top + 'px';
                host.style.right = 'auto';
            });
            const finishDrag = event => {
                if (!drag || event.pointerId !== drag.pointerId) return;
                drag = null;
                header.classList.remove('is-dragging');
            };
            header.addEventListener('pointerup', finishDrag);
            header.addEventListener('pointercancel', finishDrag);
        }

        const toolbarHost = document.getElementById('live-monitor-properties');
        if (!toolbarHost) throw new Error('Live Monitor property toolbar host is required.');
        setupFloatingPanel(toolbarHost);
        const editor = editorApi.createEditor({
            preview, layout, onChange,
            onSelect: (id, component, part) => {
                instance?.toolbar.update(id, component, part);
                if (id) globalThis.YtCdHudStudioWindows?.reveal?.('properties');
                if (id && toolbarHost.classList.contains('is-collapsed')) {
                    toolbarHost.classList.remove('is-collapsed');
                    const toggle = toolbarHost.querySelector('.preview-properties-toggle');
                    if (toggle) { toggle.setAttribute('aria-expanded', 'true'); toggle.textContent = '收合 ▾'; }
                }
            },
            onRender: () => {
                instance?.library.render();
                instance?.presets.sync();
            },
            onView: view => instance?.presets.syncView?.(view),
        });
        const toolbar = toolbarApi.createToolbar({ host: toolbarHost, editor, onChange });
        const libraryHost = document.getElementById('live-monitor-library');
        const library = libraryApi.createLibrary({ host: libraryHost, editor });
        const controlsHost = document.getElementById('live-monitor-layout-controls');
        const presets = presetsApi.createControls({ host: controlsHost, editor, onChange });
        instance = { editor, toolbar, library, presets, store, composer };
        editor.init();
        return instance;
    }

    function getLayout() { return instance?.editor.getLayout() || composer.createDefaultLayout(); }
    function setLayout(layout, options) { instance?.editor.setLayout(layout, options); }

    globalThis.YtCdHudLiveMonitorBootstrap = Object.freeze({ init, getLayout, setLayout, get instance() { return instance; } });
})();

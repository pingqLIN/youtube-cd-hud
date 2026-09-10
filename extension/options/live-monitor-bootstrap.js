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
            instance.editor.setLayout(layout);
            return instance;
        }
        const editor = editorApi.createEditor({
            preview, layout, onChange,
            onSelect: (id, component, part) => instance?.toolbar.update(id, component, part),
            onRender: () => {
                instance?.library.render();
                instance?.presets.sync();
            },
        });
        const toolbarHost = document.getElementById('live-monitor-properties');
        if (!toolbarHost) throw new Error('Live Monitor property toolbar host is required.');
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
    function setLayout(layout) { instance?.editor.setLayout(layout); }

    globalThis.YtCdHudLiveMonitorBootstrap = Object.freeze({ init, getLayout, setLayout, get instance() { return instance; } });
})();

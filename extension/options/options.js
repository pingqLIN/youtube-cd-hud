(function () {
    'use strict';

    const settingsApi = globalThis.YtCdHudSettings;
    const i18n = globalThis.YtCdHudI18n;
    const form = document.getElementById('settings-form');
    const status = document.getElementById('save-status');
    const preview = document.getElementById('hud-preview');
    const fields = Array.from(form.elements).filter(element => element.name);
    const layoutStore = globalThis.YtCdHudLiveMonitorLayoutStore;
    const composer = globalThis.YtCdHudLiveMonitorComposer;
    const bootstrap = globalThis.YtCdHudLiveMonitorBootstrap;
    let statusKey = 'options.waiting';
    let statusState = '';
    let currentSettings = settingsApi.DEFAULTS;
    let currentLayout = composer.createDefaultLayout();

    const outputFormatters = {
        requestTimeoutMs: value => String(Math.round(value / 1000)) + 's',
        maxCandidates: value => String(value),
        titleFontSize: value => String(value) + 'px',
        timeFontSize: value => String(value) + 'px',
        discScale: value => String(Math.round(value * 100)) + '%',
        surfaceOpacity: value => String(value) + '%',
    };

    function getFormSettings() {
        const raw = {};
        for (const field of fields) raw[field.name] = field.type === 'checkbox' ? field.checked : field.value;
        return settingsApi.normalize(raw);
    }

    function updateOutputs(settings) {
        for (const [name, formatter] of Object.entries(outputFormatters)) {
            const output = document.getElementById(name + '-output');
            if (output) output.value = formatter(settings[name]);
        }
    }

    function updatePreview(settings) {
        preview.classList.toggle('off', !settings.enabled);
        preview.classList.toggle('hide-disc', !settings.showDisc);
        preview.classList.toggle('hide-transport', !settings.showTransport);
        preview.classList.toggle('hide-1001', !settings.enable1001 && !settings.enableMixesDb && !settings.enableTrackId);
        preview.style.setProperty('--preview-accent', settings.accentColor);
        preview.style.setProperty('--preview-opacity', String(settings.surfaceOpacity / 100));
        preview.style.setProperty('--preview-disc-size', String(82 * settings.discScale) + 'px');
        preview.style.setProperty('--preview-font', settingsApi.FONT_STACKS[settings.fontFamily] || settingsApi.FONT_STACKS[settingsApi.DEFAULTS.fontFamily]);
        preview.style.setProperty('--preview-title-font-size', String(settings.titleFontSize) + 'px');
        preview.style.setProperty('--preview-time-font-size', String(settings.timeFontSize) + 'px');
        updateOutputs(settings);
    }

    function populate(settings) {
        currentSettings = settingsApi.normalize(settings);
        for (const field of fields) {
            if (!(field.name in currentSettings)) continue;
            if (field.type === 'checkbox') field.checked = Boolean(currentSettings[field.name]);
            else field.value = String(currentSettings[field.name]);
        }
        updatePreview(currentSettings);
        if (i18n) i18n.localizeDocument(document, currentSettings.language);
        renderStatus();
    }

    function renderStatus() {
        const language = i18n ? i18n.resolveLanguage(getFormSettings().language) : 'zh-TW';
        status.textContent = i18n ? i18n.translate(statusKey, language) : statusKey;
        status.className = statusState;
    }

    function setStatus(key, state = '') {
        statusKey = key; statusState = state; renderStatus();
    }

    async function load() {
        try {
            const [storedSettings, storedLayout] = await Promise.all([
                chrome.storage.local.get(settingsApi.STORAGE_KEY),
                layoutStore.load(),
            ]);
            populate(storedSettings[settingsApi.STORAGE_KEY] || settingsApi.DEFAULTS);
            currentLayout = composer.normalizeLayout(storedLayout);
            bootstrap.init({ preview, layout: currentLayout, onChange: () => setStatus('options.unsaved') });
            setStatus('options.loaded');
        } catch (error) {
            console.error('[CD HUD] Could not load options state.', error);
            populate(settingsApi.DEFAULTS);
            currentLayout = composer.createDefaultLayout();
            bootstrap.init({ preview, layout: currentLayout, onChange: () => setStatus('options.unsaved') });
            setStatus('options.loadFailed', 'error');
        }
    }

    form.addEventListener('input', event => {
        const settings = getFormSettings();
        updatePreview(settings);
        if (event.target.name === 'language' && i18n) i18n.localizeDocument(document, settings.language);
        setStatus('options.unsaved');
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            const settings = getFormSettings();
            const layout = bootstrap.getLayout();
            await Promise.all([
                chrome.storage.local.set({ [settingsApi.STORAGE_KEY]: settings }),
                layoutStore.save(layout),
            ]);
            currentLayout = composer.normalizeLayout(layout);
            populate(settings);
            setStatus('options.saved', 'saved');
        } catch (error) {
            console.error('[CD HUD] Could not save options state.', error);
            setStatus('options.saveFailed', 'error');
        }
    });

    document.getElementById('reset-button').addEventListener('click', () => {
        populate(settingsApi.DEFAULTS);
        currentLayout = composer.createDefaultLayout();
        bootstrap.setLayout(currentLayout);
        setStatus('options.resetLoaded');
    });

    void load();
})();

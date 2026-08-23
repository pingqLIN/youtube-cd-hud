(function () {
    'use strict';

    const settingsApi = globalThis.YtCdHudSettings;
    const i18n = globalThis.YtCdHudI18n;
    const form = document.getElementById('settings-form');
    const status = document.getElementById('save-status');
    const preview = document.getElementById('hud-preview');
    const fields = Array.from(form.elements).filter(element => element.name);
    let statusKey = 'options.waiting';
    let statusState = '';

    const outputFormatters = {
        requestTimeoutMs: value => `${Math.round(value / 1000)}s`,
        maxCandidates: value => String(value),
        titleFontSize: value => `${value}px`,
        timeFontSize: value => `${value}px`,
        discScale: value => `${Math.round(value * 100)}%`,
        surfaceOpacity: value => `${value}%`,
    };

    function getFormSettings() {
        const raw = {};
        for (const field of fields) {
            raw[field.name] = field.type === 'checkbox' ? field.checked : field.value;
        }
        return settingsApi.normalize(raw);
    }

    function updateOutputs(settings) {
        for (const [name, formatter] of Object.entries(outputFormatters)) {
            const output = document.getElementById(`${name}-output`);
            if (output) output.value = formatter(settings[name]);
        }
    }

    function updatePreview(settings) {
        preview.classList.toggle('off', !settings.enabled);
        preview.classList.toggle('hide-disc', !settings.showDisc);
        preview.classList.toggle('hide-transport', !settings.showTransport);
        preview.classList.toggle(
            'hide-1001',
            !settings.enable1001 && !settings.enableMixesDb && !settings.enableTrackId
        );
        preview.style.setProperty('--preview-accent', settings.accentColor);
        preview.style.setProperty('--preview-opacity', String(settings.surfaceOpacity / 100));
        preview.style.setProperty('--preview-disc-size', `${82 * settings.discScale}px`);
        preview.style.setProperty(
            '--preview-font',
            settingsApi.FONT_STACKS[settings.fontFamily] || settingsApi.FONT_STACKS[settingsApi.DEFAULTS.fontFamily]
        );
        document.getElementById('preview-title-text').style.fontSize = `${settings.titleFontSize}px`;
        document.getElementById('preview-time').style.fontSize = `${settings.timeFontSize}px`;
        updateOutputs(settings);
    }

    function populate(settings) {
        for (const field of fields) {
            if (!(field.name in settings)) continue;
            if (field.type === 'checkbox') field.checked = Boolean(settings[field.name]);
            else field.value = String(settings[field.name]);
        }
        updatePreview(settings);
        applyLocale(settings.language);
    }

    function applyLocale(preference) {
        if (!i18n) return;
        i18n.localizeDocument(document, preference);
        renderStatus();
    }

    function renderStatus() {
        status.textContent = i18n
            ? i18n.translate(statusKey, i18n.resolveLanguage(getFormSettings().language))
            : statusKey;
        status.className = statusState;
    }

    function setStatus(key, state = '') {
        statusKey = key;
        statusState = state;
        renderStatus();
    }

    async function load() {
        try {
            const stored = await chrome.storage.local.get(settingsApi.STORAGE_KEY);
            populate(settingsApi.normalize(stored[settingsApi.STORAGE_KEY]));
            setStatus('options.loaded');
        } catch (error) {
            console.error('[CD HUD] Could not load settings.', error);
            populate(settingsApi.DEFAULTS);
            setStatus('options.loadFailed', 'error');
        }
    }

    form.addEventListener('input', event => {
        const settings = getFormSettings();
        updatePreview(settings);
        if (event.target.name === 'language') applyLocale(settings.language);
        setStatus('options.unsaved');
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            const settings = getFormSettings();
            await chrome.storage.local.set({ [settingsApi.STORAGE_KEY]: settings });
            populate(settings);
            setStatus('options.saved', 'saved');
        } catch (error) {
            console.error('[CD HUD] Could not save settings.', error);
            setStatus('options.saveFailed', 'error');
        }
    });

    document.getElementById('reset-button').addEventListener('click', () => {
        populate(settingsApi.DEFAULTS);
        setStatus('options.resetLoaded');
    });

    void load();
})();

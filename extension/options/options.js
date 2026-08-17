(function () {
    'use strict';

    const settingsApi = globalThis.YtCdHudSettings;
    const form = document.getElementById('settings-form');
    const status = document.getElementById('save-status');
    const preview = document.getElementById('hud-preview');
    const fields = Array.from(form.elements).filter(element => element.name);

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
    }

    function setStatus(message, state = '') {
        status.textContent = message;
        status.className = state;
    }

    async function load() {
        try {
            const stored = await chrome.storage.local.get(settingsApi.STORAGE_KEY);
            populate(settingsApi.normalize(stored[settingsApi.STORAGE_KEY]));
            setStatus('設定已載入');
        } catch (error) {
            console.error('[CD HUD] Could not load settings.', error);
            populate(settingsApi.DEFAULTS);
            setStatus('無法讀取設定，已顯示預設值', 'error');
        }
    }

    form.addEventListener('input', () => {
        const settings = getFormSettings();
        updatePreview(settings);
        setStatus('尚未儲存的調整');
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            const settings = getFormSettings();
            await chrome.storage.local.set({ [settingsApi.STORAGE_KEY]: settings });
            populate(settings);
            setStatus('已儲存，開啟中的 YouTube 分頁會立即套用', 'saved');
        } catch (error) {
            console.error('[CD HUD] Could not save settings.', error);
            setStatus('儲存失敗，請重新開啟控制頁再試', 'error');
        }
    });

    document.getElementById('reset-button').addEventListener('click', () => {
        populate(settingsApi.DEFAULTS);
        setStatus('已載入預設值；按「儲存並套用」後生效');
    });

    void load();
})();

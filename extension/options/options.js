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
        const raw = { ...currentSettings, customCss: "" };
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
        preview.classList.toggle('hide-disc', false);
        preview.classList.toggle('hide-transport', false);
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
            const layout = composer.prepareForSave(bootstrap.getLayout());
            layout.locked = true;
            if (!composer.connectedToBase(layout, composer.getComponent(layout, 'panel-base'))) throw new Error('所有元件都必須與底座接觸。');
            await Promise.all([
                chrome.storage.local.set({ [settingsApi.STORAGE_KEY]: settings }),
                layoutStore.save(layout),
            ]);
            currentLayout = composer.normalizeLayout(layout);
            bootstrap.setLayout(currentLayout);
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

    const code = document.getElementById('panel-code');
    const codeStatus = document.getElementById('panel-code-status');
    document.getElementById('panel-code-export').addEventListener('click', () => {
        code.value = composer.exportCode(bootstrap.getLayout());
        codeStatus.textContent = '已顯示目前面板；可複製保存。';
    });
    document.getElementById('panel-code-import').addEventListener('click', () => {
        try {
            const layout = composer.importCode(code.value);
            bootstrap.setLayout(layout);
            codeStatus.textContent = '已產生預覽；儲存並套用後生效。';
            setStatus('options.unsaved');
        } catch (error) { codeStatus.textContent = '匯入失敗：' + error.message; }
    });
    function applyTypography(font, fontSize) {
        const layout = bootstrap.getLayout();
        if (layout.locked) { codeStatus.textContent = '請先 UNLOCK 面板。'; return; }
        layout.components.forEach(component => {
            if (!component.textStyle || component.locked) return;
            if (font) component.textStyle.font = font;
            if (fontSize) component.textStyle.fontSize = fontSize;
            composer.ensureTextFits(component, layout.canvas);
        });
        bootstrap.setLayout(layout);
        setStatus('options.unsaved');
    }
    document.getElementById('theme-font').addEventListener('change', event => applyTypography(event.target.value));
    document.getElementById('theme-custom-font').addEventListener('change', event => {
        const value = event.target.value.trim();
        if (!value) { event.target.setCustomValidity(''); return; }
        if (!/^[\p{L}\p{N} _-]{1,80}$/u.test(value)) { event.target.setCustomValidity('請輸入本機字體名稱（文字、數字、空白、- 或 _）。'); event.target.reportValidity(); return; }
        event.target.setCustomValidity('');
        applyTypography(value);
    });
    document.getElementById('theme-font-size').addEventListener('input', event => {
        const size = composer.fontSizeFromSlider(Number(event.target.value));
        document.getElementById('theme-font-size-output').value = size + ' px';
        event.target.setAttribute('aria-valuetext', size + ' px');
        applyTypography(null, size);
    });
    void load();
})();

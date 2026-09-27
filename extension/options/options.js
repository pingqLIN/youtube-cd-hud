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
    const optionsHost = globalThis.YtCdHudOptionsHost;
    let baseRevision = null;
    let pendingOperation = null;
    let saving = false;
    let remoteSnapshot = null;
    let statusKey = 'options.waiting';
    let statusState = '';
    let currentSettings = settingsApi.DEFAULTS;
    let currentLayout = composer.createDefaultLayout();
    const autoSync = document.getElementById('auto-sync-workspace');
    const autoSyncKey = 'ytCdHudAutoSyncWorkspace';
    let syncTimer = null;
    let synchronizedLayout = '';
    let loading = true;
    let agentConflict = false;
    try { autoSync.checked = globalThis.localStorage?.getItem(autoSyncKey) !== 'false'; }
    catch { autoSync.checked = true; }

    function workspacePayload() {
        const layout = composer.prepareForSave(bootstrap.getLayout());
        layout.locked = true;
        return layout;
    }

    function scheduleWorkspaceSync() {
        if (loading || !autoSync.checked) return;
        if (syncTimer !== null) clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            syncTimer = null;
            void syncWorkspace().catch(error => {
                status.textContent = '自動同步未完成：' + error.message;
                status.className = 'error';
            });
        }, 450);
    }

    async function syncWorkspace() {
        if (!autoSync.checked || loading || !baseRevision || pendingOperation || agentConflict) return;
        if (saving) { scheduleWorkspaceSync(); return; }
        const layout = workspacePayload();
        const fingerprint = JSON.stringify(layout);
        if (fingerprint === synchronizedLayout) return;
        if (!composer.connectedToBase(layout, composer.getComponent(layout, 'panel-base'))) {
            status.textContent = '自動同步暫停：所有元件都必須與底座接觸。';
            status.className = 'error';
            return;
        }
        saving = true;
        try {
            let result;
            for (let attempt = 0; attempt < 2; attempt++) {
                const latest = await optionsHost.read();
                if (!autoSync.checked || pendingOperation) return;
                try {
                    pendingOperation = crypto.randomUUID();
                    result = await optionsHost.apply({ operationId: pendingOperation, baseRevision: latest.revision, payload: { layout } });
                    break;
                } catch (error) {
                    if (['CONFLICT', 'CANCELLED', 'SCHEMA_INVALID', 'BASE_REVISION_REQUIRED', 'LAYOUT_DISCONNECTED'].includes(error.message)) pendingOperation = null;
                    if (error.message !== 'CONFLICT' || attempt) throw error;
                }
            }
            if (result?.status !== 'STORED') throw new Error('INCOMPLETE');
            pendingOperation = null;
            baseRevision = result.snapshot.revision;
            synchronizedLayout = fingerprint;
            status.textContent = '工作區面板已自動同步；資料來源與快取設定仍需儲存並套用。';
            status.className = 'saved';
        } catch (error) {
            status.textContent = '自動同步未完成：' + error.message;
            status.className = 'error';
        } finally {
            saving = false;
            if (JSON.stringify(workspacePayload()) !== fingerprint) scheduleWorkspaceSync();
        }
    }

    autoSync.addEventListener('change', () => {
        try { globalThis.localStorage?.setItem(autoSyncKey, String(autoSync.checked)); } catch { /* Keep the current preference for this page. */ }
        if (!autoSync.checked && syncTimer !== null) { clearTimeout(syncTimer); syncTimer = null; }
        if (autoSync.checked) { synchronizedLayout = ''; scheduleWorkspaceSync(); }
    });

    function rememberDraft() {
        optionsHost.rememberDraft?.({ settings:getFormSettings(), layout:bootstrap.getLayout(), revision:baseRevision });
        updateTypographyControl();
        scheduleWorkspaceSync();
    }

    function updateTypographyControl() {
        const sizes = bootstrap.getLayout().components
            .filter(component => component.present !== false && !component.hidden && component.textStyle)
            .map(component => component.textStyle.fontSize);
        const size = sizes[0] || 14;
        const mixed = sizes.some(value => value !== size);
        const slider = document.getElementById('theme-font-size');
        slider.value = composer.fontSizeToSlider(size);
        slider.setAttribute?.('aria-valuetext', mixed ? '混合字級；調整後統一文字大小' : size + ' px');
        document.getElementById('theme-font-size-output').value = mixed ? '混合字級' : size + ' px';
    }

    const outputFormatters = {
        requestTimeoutMs: value => String(Math.round(value / 1000)) + 's',
        maxCandidates: value => String(value),
        titleFontSize: value => String(value) + 'px',
        timeFontSize: value => String(value) + 'px',
        discScale: value => String(Math.round(value * 100)) + '%',
        surfaceOpacity: value => String(value) + '%',
    };

    function getFormSettings() {
        const raw = { ...currentSettings };
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

    async function load(fresh = false) {
        loading = true;
        baseRevision = null;
        try {
            const snapshot = fresh && optionsHost.reload ? await optionsHost.reload() : await optionsHost.read();
            baseRevision = snapshot.revision;
            agentConflict = false;
            populate(snapshot.settings);
            currentLayout = composer.normalizeLayout(snapshot.layout);
            bootstrap.init({ preview, layout: currentLayout, onChange: () => { setStatus('options.unsaved'); rememberDraft(); } });
            synchronizedLayout = JSON.stringify(workspacePayload());
            updateTypographyControl();
            setStatus('options.loaded');
        } catch (error) {
            console.error('[CD HUD] Could not load options state.', error);
            populate(settingsApi.DEFAULTS);
            currentLayout = composer.createDefaultLayout();
            bootstrap.init({ preview, layout: currentLayout, onChange: () => setStatus('options.unsaved') });
            updateTypographyControl();
            setStatus('options.loadFailed', 'error');
        } finally {
            loading = false;
        }
    }

    form.addEventListener('input', event => {
        const settings = getFormSettings();
        updatePreview(settings);
        if (event.target.name === 'language' && i18n) i18n.localizeDocument(document, settings.language);
        setStatus('options.unsaved');
        rememberDraft();
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (saving) return;
        saving = true;
        try {
            if (!baseRevision) throw new Error('尚未取得 Chrome 設定，請先重新讀取。');
            if (pendingOperation) {
                const previous = await optionsHost.operationStatus(pendingOperation);
                if (previous.status !== 'STORED') throw new Error('上次儲存結果仍待確認；請先核對 Chrome 設定。');
                baseRevision = previous.snapshot.revision;
                pendingOperation = null;
                status.textContent = '已確認上次儲存；目前草稿保留，請檢查後再儲存。';
                return;
            }
            const settings = getFormSettings();
            const layout = composer.prepareForSave(bootstrap.getLayout());
            layout.locked = true;
            if (!composer.connectedToBase(layout, composer.getComponent(layout, 'panel-base'))) throw new Error('所有元件都必須與底座接觸。');
            pendingOperation = crypto.randomUUID();
            const stored = await optionsHost.apply({ operationId: pendingOperation, baseRevision, payload: { settings, layout } });
            if (stored.status !== 'STORED') throw new Error('INCOMPLETE');
            pendingOperation = null;
            baseRevision = stored.snapshot.revision;
            currentLayout = composer.normalizeLayout(stored.snapshot.layout);
            bootstrap.setLayout(currentLayout, { record: false });
            synchronizedLayout = JSON.stringify(workspacePayload());
            agentConflict = false;
            populate(stored.snapshot.settings);
            rememberDraft();
            status.textContent = stored.runtime?.status === 'APPLIED'
                ? '已儲存並讀回確認；YouTube 已確認套用。'
                : '已儲存並由 Chrome 讀回確認；播放器套用狀態待確認。';
            status.className = 'saved';
        } catch (error) {
            remoteSnapshot = error.snapshot || remoteSnapshot;
            console.error('[CD HUD] Could not save options state:', error.message);
            if (['CONFLICT','CANCELLED','SCHEMA_INVALID','BASE_REVISION_REQUIRED','LAYOUT_DISCONNECTED'].includes(error.message)) pendingOperation = null;
            status.textContent = error.message === 'CONFLICT'
                ? 'Chrome 設定已變更，草稿已保留。請匯出面板草稿，再重新讀取比較；未覆寫 Chrome。'
                : '儲存未完成：' + error.message;
            status.className = 'error';
        } finally {
            saving = false;
        }
    });

    document.getElementById('reload-settings').addEventListener('click', async () => {
        if (autoSync.checked) {
            synchronizedLayout = '';
            await syncWorkspace();
            return;
        }
        if (saving || !window.confirm('重新讀取會取代目前草稿。請先匯出需要保留的草稿，是否繼續？')) return;
        pendingOperation = null;
        remoteSnapshot = null;
        await load(true);
    });
    document.getElementById('export-settings-draft').addEventListener('click', () => {
        const output = document.getElementById('settings-draft');
        output.hidden = false;
        output.value = JSON.stringify({draft:{settings:getFormSettings(),layout:bootstrap.getLayout(),baseRevision},remoteSnapshot},null,2);
    });

    document.getElementById('reset-button').addEventListener('click', () => {
        populate(settingsApi.DEFAULTS);
        currentLayout = composer.createDefaultLayout();
        bootstrap.setLayout(currentLayout);
        setStatus('options.resetLoaded');
        rememberDraft();
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
            rememberDraft();
        } catch (error) { codeStatus.textContent = '匯入失敗：' + error.message; }
    });
    function applyTypography(font, fontSize) {
        const layout = bootstrap.getLayout();
        if (layout.locked && !fontSize) { codeStatus.textContent = '請先 UNLOCK 面板。'; return; }
        layout.components.forEach(component => {
            if (!component.textStyle || (component.locked && !fontSize)) return;
            if (font) component.textStyle.font = font;
            if (fontSize) component.textStyle.fontSize = fontSize;
            composer.ensureTextFits(component, layout.canvas);
        });
        bootstrap.setLayout(layout);
        setStatus('options.unsaved');
        rememberDraft();
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
    document.getElementById('clear-cache').addEventListener('click', async () => {
        const button = document.getElementById('clear-cache');
        const cacheStatus = document.getElementById('cache-status');
        button.disabled = true;
        try {
            if (!optionsHost.clearCache) throw new Error('CACHE_CLEAR_UNAVAILABLE');
            await optionsHost.clearCache();
            cacheStatus.textContent = '已清理本機曲目快取並讀回確認。';
        } catch (error) {
            cacheStatus.textContent = '清理未完成：' + error.message;
        } finally { button.disabled = false; }
    });
    async function commitAgentLayout(layout, expected) {
        if (saving || loading || pendingOperation) throw new Error('BUSY');
        if (!baseRevision || baseRevision !== expected.storageRevision) throw new Error('CONFLICT');
        const unchanged = () => JSON.stringify(bootstrap.getLayout()) === JSON.stringify(expected.before);
        if (!unchanged() || bootstrap.getLayout().locked) throw new Error('CONFLICT');
        saving = true;
        if (syncTimer !== null) { clearTimeout(syncTimer); syncTimer = null; }
        try {
            const latest = await optionsHost.read();
            if (latest.revision !== expected.storageRevision || !unchanged()) throw new Error('CONFLICT');
            pendingOperation = crypto.randomUUID();
            const stored = await optionsHost.apply({ operationId: pendingOperation, baseRevision: expected.storageRevision, payload: { layout } });
            if (stored.status !== 'STORED') throw new Error('INCOMPLETE');
            pendingOperation = null;
            baseRevision = stored.snapshot.revision;
            // A person may edit while Chrome is storing. Preserve that work instead of replacing it.
            if (!unchanged()) {
                agentConflict = true;
                if (syncTimer !== null) { clearTimeout(syncTimer); syncTimer = null; }
                status.textContent = 'Agent 配置已儲存，但工作區有新編輯；保留工作區並暫停同步。請確認後儲存，或關閉自動同步再重新讀取。';
                return { status: 'STORED', workspaceApplied: false, runtime: stored.runtime || { status: 'UNKNOWN' }, error: 'WORKSPACE_CHANGED' };
            }
            currentLayout = composer.normalizeLayout(stored.snapshot.layout);
            currentLayout.locked = expected.before.locked;
            bootstrap.setLayout(currentLayout);
            synchronizedLayout = JSON.stringify(workspacePayload());
            agentConflict = false;
            updateTypographyControl();
            optionsHost.rememberDraft?.({ settings: getFormSettings(), layout: bootstrap.getLayout(), revision: baseRevision });
            status.textContent = stored.runtime?.status === 'APPLIED' ? 'Agent 配置已儲存；YouTube 已確認套用。' : 'Agent 配置已儲存；YouTube 套用狀態待確認。';
            return { status: 'STORED', workspaceApplied: true, runtime: stored.runtime || { status: 'UNKNOWN' } };
        } catch (error) {
            if (['CONFLICT', 'CANCELLED', 'SCHEMA_INVALID', 'BASE_REVISION_REQUIRED', 'LAYOUT_DISCONNECTED'].includes(error.message)) pendingOperation = null;
            throw error;
        } finally { saving = false; }
    }
    void (async () => {
        await load();
        globalThis.YtCdHudOptionsAgent?.init({
            composer, getLayout: bootstrap.getLayout, getRevision: () => baseRevision,
            getSelected: () => bootstrap.instance?.editor.state.selected || null,
            isEditing: () => Boolean(saving || loading || pendingOperation || bootstrap.instance?.editor.state.dragging || bootstrap.instance?.editor.state.resizing),
            commit: commitAgentLayout, slots: globalThis.YtCdHudLiveMonitorLayoutPresets,
        });
    })().catch(error => console.error('[CD HUD] Agent UI initialization failed.', error));
})();

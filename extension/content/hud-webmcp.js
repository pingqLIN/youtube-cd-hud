(function () {
    'use strict';
    if (window.top !== window || location.origin !== 'https://www.youtube.com') return;
    const REQUEST = 'YT_CD_HUD_WEBMCP_REQUEST';
    const RESPONSE = 'YT_CD_HUD_WEBMCP_RESPONSE';
    const LIFECYCLE = 'YT_CD_HUD_WEBMCP_LIFECYCLE';
    const STATUS = 'YT_CD_HUD_WEBMCP_STATUS';
    const componentIds = new Set(['panel-base', 'disc', 'track-title', 'time-readout', 'source-selector', 'tracklist-toggle', 'transport-controls', 'close-control', 'text-size-control', 'tracklist-panel']);
    const fonts = new Set(['system', 'cascadia-mono', 'ocr-machine', 'jetbrains-mono', 'ibm-plex-mono', 'source-code-pro', 'consolas']);
    const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    let mounted = null;
    const settingsApi = globalThis.YtCdHudWebMcpSettings;
    const labels = { enabled: '啟用 HUD', enableYouTube: 'YouTube 來源', enableCache: '快取', enable1001: '1001 來源', autoSearch1001: '自動搜尋 1001', prefer1001: '優先使用 1001', enableMixesDb: 'MixesDB 來源', enableTrackId: 'TrackId 來源', requestTimeoutMs: '請求逾時（毫秒）', maxCandidates: '候選數量', titleFontSize: '標題字級', timeFontSize: '時間字級', fontFamily: '字型', discScale: '唱片比例', surfaceOpacity: '面板不透明度', accentColor: '主題色', showDisc: '顯示唱片', showTransport: '顯示播放控制', language: '語言' };

    function cancelProposal(current, status = 'CANCELLED') {
        const proposal = current.proposal;
        if (!proposal || proposal.result.status === 'APPLYING') return;
        clearTimeout(proposal.timer);
        proposal.result.status = status;
        current.proposal = null;
        current.review.hidden = true;
    }

    function usable(current, sessionId) {
        return mounted === current && current.enabled && current.ready && current.sessionId === sessionId && available(current);
    }

    async function bounded(work) {
        let timer;
        try {
            return await Promise.race([work(), new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('SETTINGS_TIMEOUT')), 5000); })]);
        } finally { clearTimeout(timer); }
    }

    async function settingsRequest(current, message, respond) {
        const sessionId = current.sessionId;
        const withSession = result => respond(true, { ...result, sessionId, workspaceId: current.workspaceId });
        if (message.operation === 'settings_status') {
            withSession(current.operations.get(message.input.operationId)?.result || { status: 'UNKNOWN' });
            return;
        }
        if (current.preparing) { withSession({ status: 'BUSY' }); return; }
        current.preparing = true;
        try {
            const response = await bounded(() => current.readSettings());
            if (!usable(current, sessionId)) { respond(false); return; }
            if (!response?.ok || !/^[a-f0-9]{64}$/i.test(response.snapshot?.revision || '')) { withSession({ status: 'UNAVAILABLE' }); return; }
            const settings = settingsApi.project(response.snapshot.settings);
            if (message.operation === 'settings_read') { withSession({ settings, storageRevision: response.snapshot.revision }); return; }
            if (current.readSnapshot()?.dirty !== false) { withSession({ status: 'UNSAVED_LAYOUT' }); return; }
            if (message.input.baseRevision !== response.snapshot.revision) { withSession({ status: 'CONFLICT' }); return; }
            const patch = Object.fromEntries(Object.entries(message.input.settings).sort(([a], [b]) => a.localeCompare(b)));
            const fingerprint = JSON.stringify({ baseRevision: message.input.baseRevision, settings: patch });
            const previous = [...current.operations.values()].find(item => item.fingerprint === fingerprint);
            if (previous) { withSession(previous.result); return; }
            if (current.proposal || current.operations.size >= 32) { withSession({ status: 'BUSY' }); return; }
            const operationId = `webmcp-${crypto.randomUUID()}`;
            const proposal = { fingerprint, sessionId, baseRevision: message.input.baseRevision, patch, result: { operationId, status: 'PENDING_CONFIRMATION' } };
            current.operations.set(operationId, proposal);
            current.proposal = proposal;
            // Only allowlisted typed values reach textContent. Caller descriptions never enter the review.
            current.summary.textContent = Object.entries(patch).map(([key, value]) => `${labels[key]}：${settings[key]} → ${value}`).join('\n');
            current.review.hidden = false;
            current.approve.disabled = false;
            current.reject.disabled = false;
            current.status.textContent = '收到設定提案；尚未儲存，請確認下方變更';
            proposal.timer = setTimeout(() => {
                if (current.proposal === proposal && proposal.result.status === 'PENDING_CONFIRMATION') {
                    cancelProposal(current, 'EXPIRED');
                    current.status.textContent = '設定提案已逾時，未儲存';
                }
            }, 60000);
            withSession(proposal.result);
        } catch { withSession({ status: 'UNAVAILABLE' }); }
        finally { current.preparing = false; }
    }

    async function approveProposal(current, event) {
        event.stopPropagation();
        const proposal = current.proposal;
        if (!event.isTrusted || !proposal || proposal.result.status !== 'PENDING_CONFIRMATION') return;
        let dirty = true;
        try { dirty = current.readSnapshot()?.dirty !== false; } catch { /* Fail closed when runtime state cannot be read. */ }
        if (!usable(current, proposal.sessionId) || dirty) {
            cancelProposal(current, 'CANCELLED');
            current.status.textContent = 'HUD 已變更或有未儲存排版；未儲存提案';
            return;
        }
        clearTimeout(proposal.timer);
        proposal.result.status = 'APPLYING';
        current.approve.disabled = true;
        current.reject.disabled = true;
        current.status.textContent = '正在儲存設定…';
        try {
            const response = await bounded(() => current.applySettings({ operationId: proposal.result.operationId, baseRevision: proposal.baseRevision, payload: { settings: proposal.patch } }));
            if (response?.ok && response.status === 'STORED') {
                proposal.result = { operationId: proposal.result.operationId, status: 'STORED', storageRevision: response.snapshot?.revision, runtime: response.runtime?.status === 'APPLIED' ? 'APPLIED' : 'PENDING' };
                current.status.textContent = proposal.result.runtime === 'APPLIED' ? '設定已儲存並套用' : '設定已儲存；HUD 套用待確認';
            } else {
                proposal.result.status = response?.error === 'CONFLICT' ? 'CONFLICT' : 'INCOMPLETE';
                current.status.textContent = proposal.result.status === 'CONFLICT' ? '設定版本衝突；請重新讀取後提出提案' : '儲存結果未確認；請重新讀取設定，勿直接重試';
            }
        } catch {
            proposal.result.status = 'INCOMPLETE';
            current.status.textContent = '儲存結果未確認；請重新讀取設定，勿直接重試';
        } finally {
            if (current.proposal === proposal) current.proposal = null;
            current.review.hidden = true;
        }
    }

    function numbers(source, keys) {
        const result = {};
        for (const key of keys) if (finite(source?.[key])) result[key] = source[key];
        return result;
    }

    function project(layout) {
        if (!plain(layout) || !Array.isArray(layout.components)) return null;
        const result = { version: 2, locked: layout.locked === true, canvas: numbers(layout.canvas, ['width', 'height']), components: [] };
        result.palette = {};
        for (const key of ['primaryColor', 'secondaryColor']) if (color(layout.palette?.[key])) result.palette[key] = layout.palette[key];
        if (['absolute', 'responsive'].includes(layout.canvas?.sizingMode)) result.canvas.sizingMode = layout.canvas.sizingMode;
        result.placement = numbers(layout.placement, ['x', 'y']);
        for (const component of layout.components.slice(0, 32)) {
            if (!plain(component) || !componentIds.has(component.id)) continue;
            const item = { id: component.id, type: component.id, present: component.present === true, hidden: component.hidden === true, locked: component.locked === true };
            item.geometry = numbers(component.geometry, ['x', 'y', 'width', 'height', 'z']);
            item.style = numbers(component.style, ['opacity', 'discOpacity', 'secondaryOpacity']);
            for (const key of ['backgroundColor', 'borderColor']) if (color(component.style?.[key])) item.style[key] = component.style[key];
            item.textStyle = numbers(component.textStyle, ['fontSize', 'fontWeight', 'opacity']);
            if (color(component.textStyle?.color)) item.textStyle.color = component.textStyle.color;
            if (fonts.has(component.textStyle?.font)) item.textStyle.font = component.textStyle.font;
            if (['left', 'center', 'right', 'justify'].includes(component.textStyle?.textAlign)) item.textStyle.textAlign = component.textStyle.textAlign;
            if (typeof component.layer?.enabled === 'boolean') item.layer = { enabled: component.layer.enabled };
            result.components.push(item);
        }
        return result;
    }

    function available(current) {
        try {
            if (!current.hud.isConnected || current.href !== location.href || !current.isAvailable()) return false;
            for (let node = current.hud; node; node = node.parentNode) {
                if (node.hidden) return false;
                if (node.nodeType && node.nodeType !== 1) break;
                const style = getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
            }
            return current.hud.getClientRects().length > 0;
        } catch { return false; }
    }

    function reset(text = '已停用') {
        const current = mounted;
        if (!current) return;
        const sessionId = current.sessionId;
        const workspaceId = current.workspaceId;
        cancelProposal(current);
        current.enabled = false;
        current.ready = false;
        current.sessionId = null;
        clearTimeout(current.timer);
        current.button.textContent = '啟用 Agent 工具';
        current.button.setAttribute('aria-pressed', 'false');
        current.status.textContent = text;
        if (sessionId) window.postMessage({ type: LIFECYCLE, state: 'disabled', sessionId, workspaceId }, location.origin);
    }

    function onMessage(event) {
        if (event.source !== window || event.origin !== location.origin || !plain(event.data)) return;
        const current = mounted;
        const message = event.data;
        if (!current?.enabled || message.sessionId !== current.sessionId || message.workspaceId !== current.workspaceId) return;
        if (message.type === STATUS) {
            if (!available(current)) { reset('HUD 不可用，已停用'); return; }
            if (message.state === 'REGISTERED') { clearTimeout(current.timer); current.ready = true; current.status.textContent = '工具已註冊；外部 Agent 呼叫尚待驗證'; }
            else if (message.state === 'WEBMCP_UNAVAILABLE') reset('WebMCP 不支援／不可用');
            else if (message.state === 'REGISTRATION_FAILED') reset('WebMCP 註冊失敗（REGISTRATION_FAILED）');
            return;
        }
        if (message.type !== REQUEST || typeof message.requestId !== 'string' || message.requestId.length > 150) return;
        const respond = (ok, result) => window.postMessage({ type: RESPONSE, requestId: message.requestId, sessionId: message.sessionId, workspaceId: message.workspaceId, ok, ...(ok ? { result } : { error: 'READ_UNAVAILABLE' }) }, location.origin);
        if (!current.ready || !settingsApi?.validInput(message.operation, message.input)) { respond(false); return; }
        if (!available(current)) { reset('HUD／頁面已變更，請重新啟用'); respond(false); return; }
        if (message.operation !== 'panel_read') { void settingsRequest(current, message, respond); return; }
        try {
            const snapshot = current.readSnapshot();
            const layout = project(snapshot?.layout);
            if (!layout) { respond(false); return; }
            const storageRevision = typeof snapshot.storageRevision === 'string' && /^[a-f0-9]{64}$/i.test(snapshot.storageRevision) ? snapshot.storageRevision : null;
            const state = { layout, storageRevision, dirty: snapshot.dirty === true };
            const serialized = JSON.stringify(state);
            if (serialized !== current.lastState) { current.revision++; current.lastState = serialized; }
            respond(true, { ...state, revision: current.revision, sessionId: current.sessionId, workspaceId: current.workspaceId });
        } catch { respond(false); }
    }

    function mount(hud, options = {}) {
        if (!hud) return null;
        if (mounted?.hud === hud) return mounted.api;
        if (mounted) { reset(); mounted.observer.disconnect(); mounted.control.remove(); }
        const control = document.createElement('div');
        control.className = 'ytcd-webmcp-control';
        control.style.cssText = 'position:absolute;top:100%;right:0;z-index:50;max-width:290px;background:#202428;color:#fff;padding:5px;border:1px solid #77818b;font:11px sans-serif;pointer-events:auto;';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '啟用 Agent 工具';
        button.setAttribute('aria-pressed', 'false');
        const notice = document.createElement('span');
        notice.textContent = '啟用後，此頁面與 Agent 可讀取排版及設定、提出變更。儲存須逐次確認；不開放自訂 CSS。';
        const status = document.createElement('span');
        status.setAttribute('role', 'status');
        status.style.display = 'block';
        status.textContent = '已停用';
        const review = document.createElement('div');
        review.hidden = true;
        const summary = document.createElement('pre');
        summary.style.cssText = 'white-space:pre-wrap;max-height:180px;overflow:auto;font:11px sans-serif';
        const approve = document.createElement('button');
        approve.type = 'button';
        approve.textContent = '確認並儲存設定';
        const reject = document.createElement('button');
        reject.type = 'button';
        reject.textContent = '拒絕變更';
        review.append(summary, approve, reject);
        control.append(button, notice, status, review);
        hud.appendChild(control);
        const current = {
            hud, control, button, status, review, summary, approve, reject, operations: new Map(), proposal: null, preparing: false,
            readSettings: options.readSettings || (async () => null), applySettings: options.applySettings || (async () => null),
            readSnapshot: options.readSnapshot || (() => null), isAvailable: options.isAvailable || (() => false),
            enabled: false, ready: false, sessionId: null, workspaceId: crypto.randomUUID(), href: location.href, revision: 0, lastState: null, timer: null,
        };
        mounted = current;
        current.api = Object.freeze({ disable: () => { if (mounted === current) reset(); } });
        approve.addEventListener('click', event => { void approveProposal(current, event); });
        reject.addEventListener('click', event => {
            event.stopPropagation();
            if (!event.isTrusted || mounted !== current || current.proposal?.result.status !== 'PENDING_CONFIRMATION') return;
            cancelProposal(current, 'REJECTED');
            current.status.textContent = '已拒絕提案，未儲存';
        });
        for (const name of ['pointerdown', 'mousedown', 'dblclick', 'wheel']) control.addEventListener(name, event => event.stopPropagation());
        button.addEventListener('click', event => {
            event.stopPropagation();
            if (!event.isTrusted || mounted !== current) return;
            if (current.enabled) { reset(); return; }
            if (current.proposal?.result.status === 'APPLYING') return;
            current.operations.clear();
            current.href = location.href;
            if (!available(current)) { reset('HUD 不可用'); return; }
            current.enabled = true;
            current.sessionId = crypto.randomUUID();
            current.button.textContent = '停用 Agent 工具';
            current.button.setAttribute('aria-pressed', 'true');
            current.status.textContent = '正在註冊工具…';
            current.timer = setTimeout(() => { if (mounted === current && !current.ready) reset('WebMCP 連線逾時／不可用'); }, 2000);
            window.postMessage({ type: LIFECYCLE, state: 'enabled', sessionId: current.sessionId, workspaceId: current.workspaceId }, location.origin);
        });
        current.observer = new MutationObserver(() => { if (mounted === current && current.enabled && !available(current)) reset('HUD／頁面已變更，請重新啟用'); });
        current.observer.observe(document.documentElement, { subtree: true, childList: true });
        for (let node = hud; node && node !== document; node = node.parentNode) current.observer.observe(node, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
        return current.api;
    }

    window.addEventListener('message', onMessage);
    for (const name of ['pagehide', 'popstate', 'hashchange']) window.addEventListener(name, () => reset('頁面已變更，請重新啟用'));
    document.addEventListener('yt-navigate-start', () => reset('頁面已變更，請重新啟用'));
    globalThis.YtCdHudWebMcp = Object.freeze({ mount });
})();

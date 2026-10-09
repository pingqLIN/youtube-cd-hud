(function () {
    'use strict';
    if (window.top !== window || location.origin !== 'https://www.youtube.com') return;
    const REQUEST = 'YT_CD_HUD_WEBMCP_REQUEST';
    const RESPONSE = 'YT_CD_HUD_WEBMCP_RESPONSE';
    const LIFECYCLE = 'YT_CD_HUD_WEBMCP_LIFECYCLE';
    const STATUS = 'YT_CD_HUD_WEBMCP_STATUS';
    const pending = new Map();
    let registration = null;
    const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const id = value => typeof value === 'string' && /^[a-z0-9-]{1,100}$/i.test(value);
    const settingsApi = globalThis.YtCdHudWebMcpSettings;

    function status(current, state) {
        window.postMessage({ type: STATUS, sessionId: current.sessionId, workspaceId: current.workspaceId, state }, location.origin);
    }

    function close(reason = 'WEBMCP_DISABLED') {
        const current = registration;
        registration = null;
        current?.controller.abort();
        current?.cancel?.();
        for (const item of [...pending.values()]) item.finish(new Error(reason));
    }

    function request(current, operation, input, signal) {
        if (!settingsApi?.validInput(operation, input)) return Promise.reject(new Error('INVALID_INPUT'));
        if (signal?.aborted) return Promise.reject(new Error('ABORTED'));
        if (registration !== current || !current.active || current.controller.signal.aborted) return Promise.reject(new Error('STALE_SESSION'));
        if (pending.size >= 4) return Promise.reject(new Error('BUSY'));
        const requestId = `${current.sessionId}-${++current.sequence}`;
        return new Promise((resolve, reject) => {
            const abort = () => finish(new Error('ABORTED'));
            const timer = setTimeout(() => finish(new Error('BRIDGE_TIMEOUT')), 1000);
            function finish(error, result) {
                if (!pending.delete(requestId)) return;
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                if (error) reject(error); else resolve(result);
            }
            pending.set(requestId, { current, finish });
            signal?.addEventListener('abort', abort, { once: true });
            window.postMessage({ type: REQUEST, operation, requestId, sessionId: current.sessionId, workspaceId: current.workspaceId, input }, location.origin);
        });
    }

    async function enable(message) {
        if (registration?.sessionId === message.sessionId && registration.workspaceId === message.workspaceId) return;
        close('WEBMCP_REPLACED');
        const current = { controller: new AbortController(), sessionId: message.sessionId, workspaceId: message.workspaceId, sequence: 0, active: false };
        registration = current;
        let timer;
        try {
            const context = document.modelContext;
            if (typeof context?.registerTool !== 'function') {
                status(current, 'WEBMCP_UNAVAILABLE'); close(); return;
            }
            const tool = {
                name: 'panel_read',
                description: 'Read the opted-in YouTube CD HUD layout only. Returns projected layout, local revision, nullable storage revision, dirty flag and document session IDs. No video/page content; no settings writes. This page-context transport does not authenticate the caller.',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                annotations: { readOnlyHint: true, untrustedContentHint: true },
                execute: (input = {}, { signal } = {}) => request(current, 'panel_read', input, signal),
            };
            const deadline = new Promise((resolve, reject) => {
                current.cancel = () => reject(new Error('WEBMCP_DISABLED'));
                timer = setTimeout(() => reject(new Error('REGISTRATION_TIMEOUT')), 1500);
            });
            const registrationTask = (async () => {
                if (current.controller.signal.aborted) throw new Error('WEBMCP_DISABLED');
                await context.registerTool(tool, { signal: current.controller.signal });
                const definitions = [
                    ['settings_read', 'Read allowlisted stored HUD settings and storage revision. Excludes custom CSS and page content.', { type: 'object', properties: {}, additionalProperties: false }, true],
                    ['settings_apply', 'Propose a settings patch against baseRevision. Returns PENDING_CONFIRMATION without saving. The user must review and click Save in the HUD. Poll settings_status with the returned operationId. Page transport does not authenticate callers. Custom CSS and layout writes are unsupported.', settingsApi.schema, false],
                    ['settings_status', 'Read the status of a settings proposal in this opt-in session. STORED confirms persistence; runtime status is separate. Unknown or expired session IDs cannot recover previous operations.', { type: 'object', properties: { operationId: { type: 'string', pattern: '^[a-zA-Z0-9-]{1,100}$' } }, required: ['operationId'], additionalProperties: false }, true],
                ];
                for (const [name, description, inputSchema, readOnlyHint] of definitions) {
                    if (current.controller.signal.aborted) throw new Error('WEBMCP_DISABLED');
                    await context.registerTool({ name, description, inputSchema, annotations: { readOnlyHint, untrustedContentHint: true }, execute: (input = {}, { signal } = {}) => request(current, name, input, signal) }, { signal: current.controller.signal });
                }
            })();
            await Promise.race([registrationTask, deadline]);
            if (registration !== current || current.controller.signal.aborted) return;
            current.active = true;
            status(current, 'REGISTERED');
        } catch {
            if (registration === current) {
                status(current, 'REGISTRATION_FAILED');
                close();
            }
        } finally {
            clearTimeout(timer);
            current.cancel = null;
        }
    }

    window.addEventListener('message', event => {
        if (event.source !== window || event.origin !== location.origin || !plain(event.data)) return;
        const message = event.data;
        if (!id(message.sessionId) || !id(message.workspaceId)) return;
        if (message.type === LIFECYCLE) {
            if (message.state === 'enabled') void enable(message);
            else if (message.state === 'disabled' && registration?.sessionId === message.sessionId && registration.workspaceId === message.workspaceId) close();
            return;
        }
        if (message.type !== RESPONSE || typeof message.requestId !== 'string') return;
        const item = pending.get(message.requestId);
        if (!item || registration !== item.current || message.sessionId !== item.current.sessionId || message.workspaceId !== item.current.workspaceId) return;
        if (message.ok === true && plain(message.result) && message.result.sessionId === message.sessionId && message.result.workspaceId === message.workspaceId) item.finish(null, message.result);
        else if (message.ok === false) item.finish(new Error('READ_UNAVAILABLE'));
    });
    window.addEventListener('pagehide', () => close());
    window.addEventListener('popstate', () => close());
    window.addEventListener('hashchange', () => close());
    document.addEventListener('yt-navigate-start', () => close());
})();

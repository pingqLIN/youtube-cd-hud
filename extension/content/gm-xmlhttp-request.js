(function () {
    'use strict';

    function createRequestId() {
        if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
            return globalThis.crypto.randomUUID();
        }
        return `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    globalThis.GM_xmlhttpRequest = function (options) {
        let aborted = false;
        const requestId = createRequestId();
        chrome.runtime.sendMessage({
            type: 'YT_CD_HUD_REMOTE_REQUEST',
            requestId,
            request: {
                method: String(options.method || 'GET').toUpperCase(),
                url: String(options.url || ''),
                data: String(options.data || ''),
                headers: options.headers || {},
                timeout: Number(options.timeout) || 15000,
            },
        }, result => {
            if (aborted) return;
            const runtimeError = chrome.runtime.lastError;
            if (runtimeError) {
                if (typeof options.onerror === 'function') {
                    options.onerror({ phase: 'message', error: runtimeError.message });
                }
                return;
            }
            if (result && result.ok) {
                if (typeof options.onload === 'function') options.onload(result);
            } else if (result && result.timedOut) {
                if (typeof options.ontimeout === 'function') options.ontimeout(result);
            } else if (typeof options.onerror === 'function') {
                options.onerror(result || {
                    phase: 'message',
                    error: 'No response from the extension service worker.',
                });
            }
        });

        return {
            abort() {
                if (aborted) return;
                aborted = true;
                chrome.runtime.sendMessage({
                    type: 'YT_CD_HUD_CANCEL_REMOTE_REQUEST',
                    requestId,
                }, () => void chrome.runtime.lastError);
            },
        };
    };
})();

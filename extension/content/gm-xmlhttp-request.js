(function () {
    'use strict';

    function createRequestId() {
        if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
            return globalThis.crypto.randomUUID();
        }
        return `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    globalThis.GM_xmlhttpRequest = function (options = {}) {
        // Keep our own references: callers may reuse or freeze their options.
        let callbacks = Object.fromEntries(
            ['onload', 'onerror', 'ontimeout', 'onabort', 'onreadystatechange']
                .map(name => [name, options[name]])
        );
        let settled = false;
        let sent = false;
        const requestId = createRequestId();
        const finish = (event, result) => {
            if (settled) return;
            settled = true;
            const listeners = callbacks;
            callbacks = null;
            const response = { ...result, readyState: 4 };
            // The fetch/message transport exposes completion, not streaming states.
            try {
                if (typeof listeners.onreadystatechange === 'function') listeners.onreadystatechange(response);
            } finally {
                if (typeof listeners[event] === 'function') listeners[event](response);
            }
        };
        const handle = {
            abort() {
                if (settled) return;
                try {
                    finish('onabort', { ok: false, status: 0, phase: 'cancelled', error: 'Request cancelled.' });
                } finally {
                    if (sent) {
                        try {
                            chrome.runtime.sendMessage({
                                type: 'YT_CD_HUD_CANCEL_REMOTE_REQUEST',
                                requestId,
                            }, () => void chrome.runtime.lastError);
                        } catch (_) {
                            // An invalidated extension context cannot receive cancellation.
                        }
                    }
                }
            },
        };
        let url;
        try {
            url = new URL(String(options.url || ''));
            if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid URL');
        } catch (_) {
            options = null;
            finish('onerror', { ok: false, status: 0, phase: 'validation', error: 'An absolute HTTPS URL without credentials is required.' });
            return handle;
        }
        const message = {
            type: 'YT_CD_HUD_REMOTE_REQUEST',
            requestId,
            request: {
                method: String(options.method || 'GET').toUpperCase(),
                url: url.href,
                data: String(options.data || ''),
                headers: options.headers || {},
                timeout: Number(options.timeout) || 15000,
            },
        };
        options = null;
        try {
            sent = true;
            chrome.runtime.sendMessage(message, result => {
                const runtimeError = chrome.runtime.lastError;
                if (settled) return;
                if (runtimeError) {
                    finish('onerror', { ok: false, status: 0, phase: 'message', error: runtimeError.message });
                    return;
                }
                if (result && result.ok) {
                    // HTTP errors are completed responses; the HUD inspects status.
                    finish('onload', result);
                } else if (result && result.timedOut) {
                    finish('ontimeout', result);
                } else {
                    finish('onerror', result || {
                        ok: false,
                        status: 0,
                        phase: 'message',
                        error: 'No response from the extension service worker.',
                    });
                }
            });
        } catch (error) {
            if (settled) throw error;
            finish('onerror', { ok: false, status: 0, phase: 'message', error: String(error.message || error) });
        }
        return handle;
    };
})();

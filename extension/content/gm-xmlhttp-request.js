(function () {
    'use strict';

    globalThis.GM_xmlhttpRequest = function (options) {
        let aborted = false;

        (async () => {
            try {
                const result = await chrome.runtime.sendMessage({
                    type: 'YT_CD_HUD_REMOTE_REQUEST',
                    request: {
                        method: String(options.method || 'GET').toUpperCase(),
                        url: String(options.url || ''),
                        data: String(options.data || ''),
                        headers: options.headers || {},
                        timeout: Number(options.timeout) || 15000,
                    },
                });
                if (aborted) return;
                if (result && result.ok) {
                    if (typeof options.onload === 'function') options.onload(result);
                } else if (result && result.timedOut) {
                    if (typeof options.ontimeout === 'function') options.ontimeout(result);
                } else if (typeof options.onerror === 'function') {
                    options.onerror(result || { error: 'No response from the extension service worker.' });
                }
            } catch (error) {
                if (!aborted && typeof options.onerror === 'function') options.onerror(error);
            }
        })();

        return {
            abort() {
                aborted = true;
            },
        };
    };
})();

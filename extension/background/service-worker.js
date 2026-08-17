'use strict';

const ALLOWED_REMOTE_URL = /^https:\/\/(?:www\.)?1001tracklists\.com\//i;
const ALLOWED_METHODS = new Set(['GET', 'POST']);

function getRequestHeaders(request) {
    const supplied = request && request.headers || {};
    const headers = {
        Accept: String(supplied.Accept || supplied.accept || 'text/html,application/xhtml+xml'),
    };
    if (request.method === 'POST') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    }
    return headers;
}

chrome.action.onClicked.addListener(async () => {
    try {
        await chrome.runtime.openOptionsPage();
    } catch (error) {
        console.error('[CD HUD] Could not open the controls page.', error);
    }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'YT_CD_HUD_REMOTE_REQUEST') return false;

    (async () => {
        const request = message.request || {};
        if (!ALLOWED_REMOTE_URL.test(String(request.url || ''))) {
            sendResponse({ ok: false, phase: 'validation', error: 'Remote URL is outside the extension allowlist.' });
            return;
        }
        const method = String(request.method || 'GET').toUpperCase();
        if (!ALLOWED_METHODS.has(method)) {
            sendResponse({ ok: false, phase: 'validation', error: 'Remote method is not supported.' });
            return;
        }

        const controller = new AbortController();
        let timeoutTimer = null;
        try {
            const timeout = Math.min(Math.max(Number(request.timeout) || 15000, 5000), 30000);
            timeoutTimer = setTimeout(() => controller.abort('timeout'), timeout);
            const response = await fetch(request.url, {
                method,
                headers: getRequestHeaders({ ...request, method }),
                body: method === 'POST' ? String(request.data || '') : undefined,
                credentials: 'include',
                redirect: 'follow',
                cache: 'default',
                referrer: 'https://www.1001tracklists.com/',
                referrerPolicy: 'strict-origin-when-cross-origin',
                signal: controller.signal,
            });
            const responseText = await response.text();
            const responseHeaders = Array.from(response.headers.entries())
                .map(([name, value]) => `${name}: ${value}`)
                .join('\r\n');
            sendResponse({
                ok: true,
                status: response.status,
                statusText: response.statusText,
                finalUrl: response.url,
                responseHeaders,
                responseText,
            });
        } catch (error) {
            const timedOut = controller.signal.aborted && controller.signal.reason === 'timeout';
            sendResponse({
                ok: false,
                phase: timedOut ? 'timeout' : 'fetch',
                timedOut,
                error: timedOut ? 'Request timed out.' : String(error && error.message || error),
            });
        } finally {
            if (timeoutTimer !== null) clearTimeout(timeoutTimer);
        }
    })();

    return true;
});

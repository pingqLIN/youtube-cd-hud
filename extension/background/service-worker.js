'use strict';

const ALLOWED_REMOTE_URL = /^https:\/\/(?:www\.)?1001tracklists\.com\//i;

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
            sendResponse({ ok: false, error: 'Remote URL is outside the extension allowlist.' });
            return;
        }

        try {
            const timeout = Math.min(Math.max(Number(request.timeout) || 15000, 5000), 30000);
            const response = await fetch(request.url, {
                method: request.method === 'POST' ? 'POST' : 'GET',
                headers: request.headers || {},
                body: request.method === 'POST' ? String(request.data || '') : undefined,
                credentials: 'omit',
                redirect: 'follow',
                signal: AbortSignal.timeout(timeout),
            });
            const responseText = await response.text();
            const responseHeaders = Array.from(response.headers.entries())
                .map(([name, value]) => `${name}: ${value}`)
                .join('\r\n');
            sendResponse({
                ok: true,
                status: response.status,
                finalUrl: response.url,
                responseHeaders,
                responseText,
            });
        } catch (error) {
            const timedOut = error && error.name === 'TimeoutError';
            sendResponse({
                ok: false,
                timedOut,
                error: timedOut ? 'Request timed out.' : String(error && error.message || error),
            });
        }
    })();

    return true;
});

'use strict';

const REMOTE_PROVIDERS = Object.freeze([
    {
        pattern: /^https:\/\/(?:www\.)?1001tracklists\.com\//i,
        methods: new Set(['GET', 'POST']),
        defaultAccept: 'text/html,application/xhtml+xml',
        credentials: 'include',
        referrer: 'https://www.1001tracklists.com/',
    },
    {
        pattern: /^https:\/\/www\.mixesdb\.com\/w\/api\.php(?:\?|$)/i,
        methods: new Set(['GET']),
        defaultAccept: 'application/json',
        credentials: 'omit',
        referrer: '',
    },
    {
        pattern: /^https:\/\/trackid\.net\/api\/public\/audiostreams(?:[/?]|$)/i,
        methods: new Set(['GET']),
        defaultAccept: 'application/json',
        credentials: 'omit',
        referrer: '',
    },
]);

function getRemoteProvider(url) {
    return REMOTE_PROVIDERS.find(provider => provider.pattern.test(url)) || null;
}

function getRequestHeaders(request, provider) {
    const supplied = request && request.headers || {};
    const headers = {
        Accept: String(supplied.Accept || supplied.accept || provider.defaultAccept),
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
        const requestUrl = String(request.url || '');
        const provider = getRemoteProvider(requestUrl);
        if (!provider) {
            sendResponse({ ok: false, phase: 'validation', error: 'Remote URL is outside the extension allowlist.' });
            return;
        }
        const method = String(request.method || 'GET').toUpperCase();
        if (!provider.methods.has(method)) {
            sendResponse({ ok: false, phase: 'validation', error: 'Remote method is not supported.' });
            return;
        }

        const controller = new AbortController();
        let timeoutTimer = null;
        try {
            const timeout = Math.min(Math.max(Number(request.timeout) || 15000, 5000), 30000);
            timeoutTimer = setTimeout(() => controller.abort('timeout'), timeout);
            const fetchOptions = {
                method,
                headers: getRequestHeaders({ ...request, method }, provider),
                body: method === 'POST' ? String(request.data || '') : undefined,
                credentials: provider.credentials,
                redirect: 'follow',
                cache: 'default',
                referrerPolicy: 'strict-origin-when-cross-origin',
                signal: controller.signal,
            };
            if (provider.referrer) fetchOptions.referrer = provider.referrer;
            const response = await fetch(request.url, fetchOptions);
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

(function () {
    'use strict';

    const TOKEN_PATTERN = /^[a-f0-9-]{32,64}$/i;
    const ALLOWED_URL_PATTERN = /^https:\/\/(?:www\.)?1001tracklists\.com\//i;
    const MAX_RESPONSE_TEXT_LENGTH = 8 * 1024 * 1024;
    const REQUEST_ID_PATTERN = /^[a-z0-9-]{16,100}$/i;
    const activeControllers = new Map();
    let currentDocumentSnapshotAvailable = true;

    function getBridgeToken() {
        const hash = new URLSearchParams(location.hash.slice(1));
        const token = String(hash.get('yt-cd-hud-session') || '');
        return TOKEN_PATTERN.test(token) ? token : '';
    }

    function removeBridgeTokenFromAddress() {
        if (!location.hash.includes('yt-cd-hud-session=')) return;
        history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    }

    function hasRenderedTracklist() {
        return /^\/tracklist\//i.test(location.pathname)
            && Boolean(document.querySelector('.tlpTog, tr.tlpItem, [id^="tlp_"]'));
    }

    function notifyBridgeReady() {
        if (!hasRenderedTracklist()) return;
        const packet = globalThis.YtCdHud1001Packet?.extractRenderedTracklist(
            document,
            `${location.origin}${location.pathname}${location.search}`
        );
        if (packet) {
            chrome.runtime.sendMessage({
                type: globalThis.YtCdHud1001Packet.PACKET_TYPE,
                packet,
            }, result => {
                if (!chrome.runtime.lastError && result?.ok && result?.delivered) return;
                chrome.runtime.sendMessage({ type: 'YT_CD_HUD_1001_BRIDGE_READY' }, () => {
                    void chrome.runtime.lastError;
                });
            });
            return;
        }
        chrome.runtime.sendMessage({ type: 'YT_CD_HUD_1001_BRIDGE_READY' }, () => {
            void chrome.runtime.lastError;
        });
    }

    function validateRequest(request) {
        const method = String(request && request.method || 'GET').toUpperCase();
        const url = String(request && request.url || '');
        if (!ALLOWED_URL_PATTERN.test(url) || !['GET', 'POST'].includes(method)) return null;
        const headers = {
            Accept: String(request.headers && (request.headers.Accept || request.headers.accept) || 'text/html,application/xhtml+xml'),
        };
        if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
        return {
            method,
            url,
            data: method === 'POST' ? String(request.data || '') : '',
            headers,
            timeout: Math.min(Math.max(Number(request.timeout) || 15000, 5000), 30000),
        };
    }

    function takeCurrentDocumentSnapshot(safeRequest) {
        let requestUrl;
        try {
            requestUrl = new URL(safeRequest.url);
        } catch (error) {
            return null;
        }
        if (
            !currentDocumentSnapshotAvailable ||
            requestUrl.origin !== location.origin ||
            requestUrl.pathname !== location.pathname ||
            requestUrl.search !== location.search ||
            (safeRequest.method === 'POST' && location.pathname !== '/search/result.php')
        ) return null;

        currentDocumentSnapshotAvailable = false;
        const responseText = String(document.documentElement && document.documentElement.outerHTML || '');
        if (!responseText || responseText.length > MAX_RESPONSE_TEXT_LENGTH) return null;
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            finalUrl: `${location.origin}${location.pathname}${location.search}`,
            responseHeaders: 'content-type: text/html; charset=utf-8',
            responseText,
            source: 'rendered-document',
        };
    }

    async function fetchOn1001(request, requestId = '') {
        const safeRequest = validateRequest(request);
        if (!safeRequest) return { ok: false, phase: 'validation', error: 'Invalid 1001 bridge request.' };
        const renderedDocument = takeCurrentDocumentSnapshot(safeRequest);
        if (renderedDocument) return renderedDocument;
        const controller = new AbortController();
        if (REQUEST_ID_PATTERN.test(requestId)) activeControllers.set(requestId, controller);
        const timeoutTimer = setTimeout(() => controller.abort('timeout'), safeRequest.timeout);
        try {
            const response = await fetch(safeRequest.url, {
                method: safeRequest.method,
                headers: safeRequest.headers,
                body: safeRequest.method === 'POST' ? safeRequest.data : undefined,
                credentials: 'include',
                redirect: 'follow',
                cache: 'default',
                referrerPolicy: 'strict-origin-when-cross-origin',
                signal: controller.signal,
            });
            const responseText = await response.text();
            if (responseText.length > MAX_RESPONSE_TEXT_LENGTH) {
                return { ok: false, phase: 'size', error: 'The 1001 response exceeded the extension size limit.' };
            }
            return {
                ok: true,
                status: response.status,
                statusText: response.statusText,
                finalUrl: response.url,
                responseHeaders: Array.from(response.headers.entries())
                    .map(([name, value]) => `${name}: ${value}`)
                    .join('\r\n'),
                responseText,
            };
        } catch (error) {
            const timedOut = controller.signal.aborted && controller.signal.reason === 'timeout';
            const cancelled = controller.signal.aborted && controller.signal.reason === 'cancelled';
            return {
                ok: false,
                phase: timedOut ? 'timeout' : cancelled ? 'cancelled' : 'fetch',
                timedOut,
                error: timedOut ? 'Request timed out.' : cancelled ? 'Request cancelled.' : String(error && error.message || error),
            };
        } finally {
            clearTimeout(timeoutTimer);
            if (REQUEST_ID_PATTERN.test(requestId)) activeControllers.delete(requestId);
        }
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message || !['YT_CD_HUD_1001_BRIDGE_FETCH', 'YT_CD_HUD_1001_BRIDGE_CANCEL'].includes(message.type)) {
            return false;
        }
        (async () => {
            const requestId = String(message.requestId || '');
            if (message.type === 'YT_CD_HUD_1001_BRIDGE_CANCEL') {
                const controller = REQUEST_ID_PATTERN.test(requestId) ? activeControllers.get(requestId) : null;
                if (controller) controller.abort('cancelled');
                sendResponse({ ok: true, cancelled: Boolean(controller) });
                return;
            }
            sendResponse(await fetchOn1001(message.request, requestId));
        })().catch(error => sendResponse({
            ok: false,
            phase: 'bridge',
            error: String(error && error.message || error),
        }));
        return true;
    });

    const token = getBridgeToken();
    if (token) {
        chrome.runtime.sendMessage({ type: 'YT_CD_HUD_ATTACH_1001_BRIDGE', token }, result => {
            if (chrome.runtime.lastError) return;
            if (result && result.ok) {
                removeBridgeTokenFromAddress();
                notifyBridgeReady();
            }
        });
    } else {
        notifyBridgeReady();
    }
})();

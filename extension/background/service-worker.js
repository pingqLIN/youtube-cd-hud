'use strict';

const BRIDGE_STORAGE_KEY = 'ytCdHud1001BridgeSessions';
const BRIDGE_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_RESPONSE_TEXT_LENGTH = 8 * 1024 * 1024;
const BRIDGE_TOKEN_PATTERN = /^[a-f0-9-]{32,64}$/i;
const REQUEST_ID_PATTERN = /^[a-z0-9-]{16,100}$/i;
const activeDirectControllers = new Map();
const activeBridgeRoutes = new Map();
const remoteRequestOwners = new Map();
const cancelledRequestIds = new Map();
const CANCELLATION_TOMBSTONE_TTL_MS = 60 * 1000;
const MAX_CANCELLATION_TOMBSTONES = 200;

function discardExpiredCancellationTombstones(now = Date.now()) {
    for (const [requestId, entry] of cancelledRequestIds) {
        if (entry.expiresAt <= now) cancelledRequestIds.delete(requestId);
    }
}

function markRequestCancelled(requestId, tabId) {
    discardExpiredCancellationTombstones();
    cancelledRequestIds.set(requestId, {
        tabId,
        expiresAt: Date.now() + CANCELLATION_TOMBSTONE_TTL_MS,
    });
    while (cancelledRequestIds.size > MAX_CANCELLATION_TOMBSTONES) {
        cancelledRequestIds.delete(cancelledRequestIds.keys().next().value);
    }
}

function isRequestCancelled(requestId, tabId) {
    discardExpiredCancellationTombstones();
    const entry = cancelledRequestIds.get(requestId);
    return REQUEST_ID_PATTERN.test(requestId) && entry && entry.tabId === tabId;
}

const REMOTE_PROVIDERS = Object.freeze([
    {
        id: '1001tracklists',
        pattern: /^https:\/\/(?:www\.)?1001tracklists\.com\//i,
        methods: new Set(['GET', 'POST']),
        defaultAccept: 'text/html,application/xhtml+xml',
        credentials: 'include',
        referrer: 'https://www.1001tracklists.com/',
    },
    {
        id: 'mixesdb',
        pattern: /^https:\/\/www\.mixesdb\.com\/w\/api\.php(?:\?|$)/i,
        methods: new Set(['GET']),
        defaultAccept: 'application/json',
        credentials: 'omit',
        referrer: '',
    },
    {
        id: 'trackid',
        pattern: /^https:\/\/trackid\.net\/api\/public\/(?:audiostreams|musictracks)(?:[/?]|$)/i,
        methods: new Set(['GET']),
        defaultAccept: 'application/json',
        credentials: 'omit',
        referrer: '',
    },
]);

function getRemoteProvider(url) {
    return REMOTE_PROVIDERS.find(provider => provider.pattern.test(url)) || null;
}

function isSenderOnHost(sender, pattern) {
    const senderUrl = String(sender && sender.url || '');
    return pattern.test(senderUrl) && Number.isInteger(sender && sender.tab && sender.tab.id);
}

function getYouTubeSenderTabId(sender) {
    return isSenderOnHost(sender, /^https:\/\/www\.youtube\.com\//i) ? sender.tab.id : null;
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

function sanitizeRemoteRequest(request, provider) {
    const method = String(request && request.method || 'GET').toUpperCase();
    return {
        method,
        url: String(request && request.url || ''),
        data: method === 'POST' ? String(request && request.data || '') : '',
        headers: getRequestHeaders({ ...request, method }, provider),
        timeout: Math.min(Math.max(Number(request && request.timeout) || 15000, 5000), 30000),
    };
}

async function getBridgeSessions() {
    if (!chrome.storage || !chrome.storage.session) return {};
    const stored = await chrome.storage.session.get(BRIDGE_STORAGE_KEY);
    const sessions = stored && stored[BRIDGE_STORAGE_KEY];
    return sessions && typeof sessions === 'object' ? sessions : {};
}

async function setBridgeSessions(sessions) {
    if (!chrome.storage || !chrome.storage.session) return;
    await chrome.storage.session.set({ [BRIDGE_STORAGE_KEY]: sessions });
}

function discardExpiredSessions(sessions, now = Date.now()) {
    return Object.fromEntries(Object.entries(sessions).filter(([, session]) => (
        session && Number(session.expiresAt) > now
    )));
}

async function registerBridgeSession(token, sender) {
    if (!BRIDGE_TOKEN_PATTERN.test(token) || !isSenderOnHost(sender, /^https:\/\/www\.youtube\.com\//i)) {
        return { ok: false, phase: 'validation', error: 'Invalid 1001 bridge registration.' };
    }
    const sessions = discardExpiredSessions(await getBridgeSessions());
    Object.keys(sessions).forEach(existingToken => {
        if (sessions[existingToken].youtubeTabId === sender.tab.id) delete sessions[existingToken];
    });
    const now = Date.now();
    sessions[token] = {
        youtubeTabId: sender.tab.id,
        bridgeTabId: null,
        registeredAt: now,
        attachedAt: 0,
        expiresAt: now + BRIDGE_SESSION_TTL_MS,
    };
    await setBridgeSessions(sessions);
    return { ok: true };
}

async function attachBridgeSession(token, sender) {
    if (!BRIDGE_TOKEN_PATTERN.test(token) || !isSenderOnHost(sender, /^https:\/\/(?:www\.)?1001tracklists\.com\//i)) {
        return { ok: false, phase: 'validation', error: 'Invalid 1001 bridge attachment.' };
    }
    const sessions = discardExpiredSessions(await getBridgeSessions());
    const session = sessions[token];
    if (!session) return { ok: false, phase: 'expired', error: 'The 1001 bridge session expired.' };
    const now = Date.now();
    session.bridgeTabId = sender.tab.id;
    session.attachedAt = now;
    session.expiresAt = now + BRIDGE_SESSION_TTL_MS;
    await setBridgeSessions(sessions);
    return { ok: true };
}

async function notifyYouTubeBridgeReady(sender) {
    if (!isSenderOnHost(sender, /^https:\/\/(?:www\.)?1001tracklists\.com\//i)) {
        return { ok: false, phase: 'validation', error: 'Invalid 1001 bridge readiness sender.' };
    }
    const sessions = discardExpiredSessions(await getBridgeSessions());
    await setBridgeSessions(sessions);
    const session = Object.values(sessions).find(candidate => (
        candidate && candidate.bridgeTabId === sender.tab.id && Number.isInteger(candidate.youtubeTabId)
    ));
    if (!session) return { ok: true, notified: false };
    try {
        await chrome.tabs.sendMessage(session.youtubeTabId, {
            type: 'YT_CD_HUD_1001_BRIDGE_READY',
        });
        return { ok: true, notified: true };
    } catch (error) {
        return { ok: false, phase: 'notify', error: String(error && error.message || error) };
    }
}

async function findAttachedBridgeTabs(youtubeTabId) {
    if (!Number.isInteger(youtubeTabId) || !chrome.tabs || !chrome.tabs.sendMessage) return [];
    const sessions = discardExpiredSessions(await getBridgeSessions());
    await setBridgeSessions(sessions);
    return Object.values(sessions).filter(candidate => (
        candidate.youtubeTabId === youtubeTabId && Number.isInteger(candidate.bridgeTabId)
    )).sort((left, right) => (
        Number(right.attachedAt || right.registeredAt || 0) - Number(left.attachedAt || left.registeredAt || 0)
    )).map(session => session.bridgeTabId);
}

async function discardBridgeTab(bridgeTabId) {
    const sessions = discardExpiredSessions(await getBridgeSessions());
    Object.keys(sessions).forEach(token => {
        if (sessions[token].bridgeTabId === bridgeTabId) delete sessions[token];
    });
    await setBridgeSessions(sessions);
}

function validateRemoteResult(result) {
    if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') {
        throw new Error('The 1001 bridge returned an invalid response.');
    }
    if (result.ok && String(result.responseText || '').length > MAX_RESPONSE_TEXT_LENGTH) {
        throw new Error('The 1001 response exceeded the extension size limit.');
    }
    return result;
}

async function fetchDirect(request, provider, requestId = '', senderTabId = null) {
    const controller = new AbortController();
    if (REQUEST_ID_PATTERN.test(requestId)) {
        activeDirectControllers.set(requestId, { tabId: senderTabId, controller });
    }
    let timeoutTimer = null;
    try {
        timeoutTimer = setTimeout(() => controller.abort('timeout'), request.timeout);
        const fetchOptions = {
            method: request.method,
            headers: request.headers,
            body: request.method === 'POST' ? request.data : undefined,
            credentials: provider.credentials,
            redirect: 'follow',
            cache: 'default',
            referrerPolicy: 'strict-origin-when-cross-origin',
            signal: controller.signal,
        };
        if (provider.referrer) fetchOptions.referrer = provider.referrer;
        const response = await fetch(request.url, fetchOptions);
        const responseText = await response.text();
        if (responseText.length > MAX_RESPONSE_TEXT_LENGTH) throw new Error('Remote response exceeded the extension size limit.');
        const responseHeaders = Array.from(response.headers.entries())
            .map(([name, value]) => `${name}: ${value}`)
            .join('\r\n');
        return {
            ok: true,
            status: response.status,
            statusText: response.statusText,
            finalUrl: response.url,
            responseHeaders,
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
        if (timeoutTimer !== null) clearTimeout(timeoutTimer);
        if (REQUEST_ID_PATTERN.test(requestId)) activeDirectControllers.delete(requestId);
    }
}

async function handleRemoteRequest(message, sender) {
    const senderTabId = getYouTubeSenderTabId(sender);
    if (!Number.isInteger(senderTabId)) {
        return { ok: false, phase: 'validation', error: 'Remote requests are accepted only from a YouTube content-script tab.' };
    }
    const rawRequest = message.request || {};
    const provider = getRemoteProvider(String(rawRequest.url || ''));
    if (!provider) return { ok: false, phase: 'validation', error: 'Remote URL is outside the extension allowlist.' };
    const request = sanitizeRemoteRequest(rawRequest, provider);
    const requestId = REQUEST_ID_PATTERN.test(String(message.requestId || '')) ? String(message.requestId) : '';
    if (!provider.methods.has(request.method)) {
        return { ok: false, phase: 'validation', error: 'Remote method is not supported.' };
    }
    if (requestId) {
        const existingOwner = remoteRequestOwners.get(requestId);
        if (Number.isInteger(existingOwner) && existingOwner !== senderTabId) {
            return { ok: false, phase: 'validation', error: 'Remote request ID belongs to another tab.' };
        }
        remoteRequestOwners.set(requestId, senderTabId);
    }
    try {
        if (isRequestCancelled(requestId, senderTabId)) {
            return { ok: false, phase: 'cancelled', error: 'Request cancelled.' };
        }
        if (provider.id === '1001tracklists') {
            const bridgeTabIds = await findAttachedBridgeTabs(senderTabId);
            if (isRequestCancelled(requestId, senderTabId)) {
                return { ok: false, phase: 'cancelled', error: 'Request cancelled.' };
            }
            for (const bridgeTabId of bridgeTabIds) {
                try {
                    if (isRequestCancelled(requestId, senderTabId)) {
                        return { ok: false, phase: 'cancelled', error: 'Request cancelled.' };
                    }
                    if (requestId) activeBridgeRoutes.set(requestId, { tabId: senderTabId, bridgeTabId });
                    const result = await chrome.tabs.sendMessage(bridgeTabId, {
                        type: 'YT_CD_HUD_1001_BRIDGE_FETCH',
                        requestId,
                        request,
                    });
                    if (isRequestCancelled(requestId, senderTabId)) {
                        return { ok: false, phase: 'cancelled', error: 'Request cancelled.' };
                    }
                    return validateRemoteResult(result);
                } catch (error) {
                    console.warn('[CD HUD] A 1001 first-party bridge was unavailable; trying the next route.', error);
                    await discardBridgeTab(bridgeTabId);
                } finally {
                    if (requestId) activeBridgeRoutes.delete(requestId);
                }
            }
        }
        if (isRequestCancelled(requestId, senderTabId)) {
            return { ok: false, phase: 'cancelled', error: 'Request cancelled.' };
        }
        return await fetchDirect(request, provider, requestId, senderTabId);
    } finally {
        if (requestId && remoteRequestOwners.get(requestId) === senderTabId) {
            remoteRequestOwners.delete(requestId);
            cancelledRequestIds.delete(requestId);
        }
    }
}

async function cancelRemoteRequest(message, sender) {
    const requestId = String(message.requestId || '');
    if (!REQUEST_ID_PATTERN.test(requestId) || !isSenderOnHost(sender, /^https:\/\/www\.youtube\.com\//i)) {
        return { ok: false, phase: 'validation', error: 'Invalid remote cancellation.' };
    }
    const senderTabId = sender.tab.id;
    const ownerTabId = remoteRequestOwners.get(requestId);
    const directRoute = activeDirectControllers.get(requestId);
    const bridgeRoute = activeBridgeRoutes.get(requestId);
    if ((Number.isInteger(ownerTabId) && ownerTabId !== senderTabId)
        || (directRoute && directRoute.tabId !== senderTabId)
        || (bridgeRoute && bridgeRoute.tabId !== senderTabId)) {
        return { ok: false, phase: 'validation', error: 'Remote request belongs to another tab.' };
    }
    if (!Number.isInteger(ownerTabId)) {
        return { ok: true, cancelled: false };
    }
    markRequestCancelled(requestId, senderTabId);
    if (directRoute) directRoute.controller.abort('cancelled');
    if (bridgeRoute && Number.isInteger(bridgeRoute.bridgeTabId)) {
        try {
            await chrome.tabs.sendMessage(bridgeRoute.bridgeTabId, {
                type: 'YT_CD_HUD_1001_BRIDGE_CANCEL',
                requestId,
            });
        } catch (error) {
            console.warn('[CD HUD] Could not forward a remote cancellation to the 1001 bridge.', error);
        }
    }
    return { ok: true, cancelled: Boolean(directRoute || bridgeRoute) };
}

chrome.action.onClicked.addListener(async () => {
    try {
        await chrome.runtime.openOptionsPage();
    } catch (error) {
        console.error('[CD HUD] Could not open the controls page.', error);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || ![
        'YT_CD_HUD_REMOTE_REQUEST',
        'YT_CD_HUD_CANCEL_REMOTE_REQUEST',
        'YT_CD_HUD_REGISTER_1001_BRIDGE',
        'YT_CD_HUD_ATTACH_1001_BRIDGE',
        'YT_CD_HUD_1001_BRIDGE_READY',
    ].includes(message.type)) return false;

    (async () => {
        if (message.type === 'YT_CD_HUD_CANCEL_REMOTE_REQUEST') {
            sendResponse(await cancelRemoteRequest(message, sender));
            return;
        }
        if (message.type === 'YT_CD_HUD_REGISTER_1001_BRIDGE') {
            sendResponse(await registerBridgeSession(String(message.token || ''), sender));
            return;
        }
        if (message.type === 'YT_CD_HUD_ATTACH_1001_BRIDGE') {
            sendResponse(await attachBridgeSession(String(message.token || ''), sender));
            return;
        }
        if (message.type === 'YT_CD_HUD_1001_BRIDGE_READY') {
            sendResponse(await notifyYouTubeBridgeReady(sender));
            return;
        }
        sendResponse(await handleRemoteRequest(message, sender));
    })().catch(error => sendResponse({
        ok: false,
        phase: 'bridge',
        error: String(error && error.message || error),
    }));

    return true;
});

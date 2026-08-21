// ==UserScript==
// @name         YouTube CD Album & HUD Overlay (with selectable tracklist providers) v5.11.0
// @namespace    http://tampermonkey.net/
// @version      5.11.0
// @description  Tampermonkey／Chrome 擴充雙版本、可選 1001Tracklists、MixesDB、TrackId.net 與 HUD 外觀
// @author       You
// @match        https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      1001tracklists.com
// @connect      www.1001tracklists.com
// @connect      www.mixesdb.com
// @connect      trackid.net
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const IS_TEST_MODE = Boolean(globalThis.__YT_CD_HUD_TEST_MODE__);
    const HUD_FONT_STACKS = Object.freeze({
        'cascadia-mono': '"Cascadia Mono", "Cascadia Code", "Lucida Console", Consolas, monospace',
        'ocr-machine': '"OCR A Extended", "OCR A Std", "Lucida Console", "Cascadia Mono", Consolas, monospace',
        'jetbrains-mono': '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
        'ibm-plex-mono': '"IBM Plex Mono", "Cascadia Mono", Consolas, monospace',
        'source-code-pro': '"Source Code Pro", "Cascadia Mono", Consolas, monospace',
        consolas: 'Consolas, "Lucida Console", monospace',
    });

    let remoteHtmlPolicy = null;
    if (window.trustedTypes && typeof window.trustedTypes.createPolicy === 'function') {
        try {
            remoteHtmlPolicy = window.trustedTypes.createPolicy('yt-cd-hud-v580-remote-parser', {
                createHTML: input => input,
            });
        } catch (error) {
            console.warn('[CD HUD] Could not create the scoped remote-HTML parser policy.', error);
        }
    }

    const DEFAULT_TITLE_SIZE = 14;
    const DEFAULT_TIME_SIZE = 12;
    const SETTINGS_API = globalThis.YtCdHudSettings || null;
    const RUNTIME_DEFAULTS = Object.freeze({
        enabled: true,
        enable1001: true,
        autoSearch1001: true,
        prefer1001: false,
        enableMixesDb: true,
        enableTrackId: true,
        requestTimeoutMs: 15000,
        maxCandidates: 5,
        titleFontSize: DEFAULT_TITLE_SIZE,
        timeFontSize: DEFAULT_TIME_SIZE,
        fontFamily: 'cascadia-mono',
        discScale: 1,
        surfaceOpacity: 85,
        accentColor: '#63b3ed',
        showDisc: true,
        showTransport: true,
        customCss: '',
    });
    const DISC_SCRUB_SECONDS_PER_REVOLUTION = 24;
    const DISC_SAMPLE_SECONDS = 0.08;
    const CANDIDATE_REQUEST_DELAY_MS = 1200;
    const AUTOMATIC_SEARCH_BLOCK_COOLDOWN_MS = 5 * 60 * 1000;
    const SINGLE_TRACK_MAX_DURATION_SECONDS = 20 * 60;
    const TRACKLIST_CACHE_STORAGE_KEY = 'ytCdHudTracklistCacheV1';
    const TRACKLIST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
    const TRACKLIST_CACHE_MAX_ENTRIES = 30;
    const TRACKLIST_CACHE_MAX_TRACKS_PER_SOURCE = 300;
    let runtimeSettings = SETTINGS_API
        ? SETTINGS_API.normalize(SETTINGS_API.DEFAULTS)
        : { ...RUNTIME_DEFAULTS };

    let currentVideo = null;
    let parsedTracks = [];
    let tracksFromYouTube = [];
    let tracksFrom1001 = [];
    let tracksFromMixesDb = [];
    let tracksFromTrackId = [];
    let currentSource = 'youtube';
    let searchState = 'idle';
    let searchStateDetail = '';
    let tracklistUrl1001 = '';
    let pending1001VerificationRequest = null;
    let tracklistUrlMixesDb = '';
    let tracklistUrlTrackId = '';
    let tracklistCandidates = { '1001': [], mixesdb: [], trackid: [] };
    let tracklistCandidateIndexes = { '1001': 0, mixesdb: 0, trackid: 0 };
    let lastVideoIdFor1001 = '';
    let lastSearchTitle = '';

    let initTimer = null;
    let metadataRefreshTimers = [];
    let activeSearchToken = 0;
    let activeSearchRequest = null;
    let activeTracklistRequest = null;
    let activeCandidateTimer = null;
    const activeSupplementalRequests = new Set();
    let automaticSearchBlockedUntil = 0;
    let awaiting1001VerificationReturn = false;
    let awaiting1001VerificationVideoId = '';
    let verificationPageOpenedAt = 0;
    let verificationReturnRetryTimer = null;
    let hudPreferredWidth = null;
    let hudTitleFontSize = DEFAULT_TITLE_SIZE;
    let hudTimeFontSize = DEFAULT_TIME_SIZE;
    let latestColorRequestVideoId = '';
    let tracklistCache = {};
    let cachePersistTimer = null;
    let cacheHitVideoId = '';

    let tracklistPanel = null;
    let tracklistVisible = false;
    let statusLight = null;
    let statusBtn = null;
    let youtubeSourceBtn = null;
    let tracklistSource1001Btn = null;
    let tracklistSourceMixesDbBtn = null;
    let tracklistSourceTrackIdBtn = null;
    let oneThousandMenu = null;
    let oneThousandChevron = null;
    let linkBtn = null;
    let mixesDbLinkBtn = null;
    let trackIdLinkBtn = null;
    let mixesDbSearchBtn = null;
    let trackIdSearchBtn = null;
    let tracklistBtn = null;
    let retryBtn = null;
    let previousTrackBtn = null;
    let nextTrackBtn = null;
    let stopDiscScrubbing = null;

    function trim(text) {
        return String(text || '').replace(/^\s+|\s+$/g, '');
    }

    function formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const pad = n => (n < 10 ? '0' : '') + n;
        return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    function parseTimestampToSeconds(timeText) {
        const normalized = trim(timeText);
        if (!/^\d{1,3}:[0-5]\d(?::[0-5]\d)?$/.test(normalized)) return NaN;
        const parts = normalized.split(':');
        const nums = parts.map(Number);
        if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
        if (nums.length === 2) return nums[0] * 60 + nums[1];
        return NaN;
    }

    function normalizeCachedTracks(tracks) {
        if (!Array.isArray(tracks) || tracks.length > TRACKLIST_CACHE_MAX_TRACKS_PER_SOURCE) return [];
        return tracks.map(track => ({
            time: Number(track && track.time),
            title: trim(String(track && track.title || '')).slice(0, 300),
        })).filter(track => Number.isFinite(track.time) && track.time >= 0 && track.title);
    }

    function isProviderUrl(source, url) {
        const value = String(url || '');
        if (source === '1001') return is1001TracklistsUrl(value);
        if (source === 'mixesdb') return /^https:\/\/www\.mixesdb\.com\//i.test(value);
        if (source === 'trackid') return /^https:\/\/trackid\.net\//i.test(value);
        return false;
    }

    function normalizeCachedCandidates(candidates, source) {
        if (!Array.isArray(candidates)) return [];
        const seenUrls = new Set();
        let remainingTracks = TRACKLIST_CACHE_MAX_TRACKS_PER_SOURCE;
        const normalized = [];
        for (const candidate of candidates.slice(0, 10)) {
            const url = isProviderUrl(source, candidate && candidate.url) ? String(candidate.url) : '';
            if (!url || seenUrls.has(url) || remainingTracks <= 0) continue;
            const tracks = normalizeCachedTracks(candidate && candidate.tracks).slice(0, remainingTracks);
            if (!tracks.length) continue;
            seenUrls.add(url);
            remainingTracks -= tracks.length;
            normalized.push({ tracks, url });
        }
        return normalized;
    }

    function getCandidateActionState(candidates, selectedIndex = 0) {
        const count = Array.isArray(candidates) ? candidates.length : 0;
        const index = count ? clamp(Number(selectedIndex) || 0, 0, count - 1) : 0;
        const hasMultiple = count > 1;
        return {
            count,
            index,
            suffix: hasMultiple ? ` (${index + 1})` : '',
            willOpen: !hasMultiple || index >= count - 1,
        };
    }

    function normalizeTracklistCache(value, now = Date.now()) {
        if (!value || typeof value !== 'object') return {};
        return Object.fromEntries(Object.entries(value)
            .filter(([videoId, entry]) => (
                /^[\w-]{6,20}$/.test(videoId) &&
                entry &&
                Number(entry.savedAt) > now - TRACKLIST_CACHE_TTL_MS &&
                Number(entry.savedAt) <= now + 60000
            ))
            .sort((left, right) => Number(right[1].savedAt) - Number(left[1].savedAt))
            .slice(0, TRACKLIST_CACHE_MAX_ENTRIES)
            .map(([videoId, entry]) => {
                const candidates1001 = normalizeCachedCandidates(entry.candidates1001, '1001');
                const candidatesMixesDb = normalizeCachedCandidates(entry.candidatesMixesDb, 'mixesdb');
                const candidatesTrackId = normalizeCachedCandidates(entry.candidatesTrackId, 'trackid');
                return [videoId, {
                    savedAt: Number(entry.savedAt),
                    activeSource: ['youtube', '1001', 'mixesdb', 'trackid'].includes(entry.activeSource)
                        ? entry.activeSource
                        : '',
                    tracks1001: candidates1001.length ? [] : normalizeCachedTracks(entry.tracks1001),
                    tracksMixesDb: candidatesMixesDb.length ? [] : normalizeCachedTracks(entry.tracksMixesDb),
                    tracksTrackId: candidatesTrackId.length ? [] : normalizeCachedTracks(entry.tracksTrackId),
                    url1001: is1001TracklistsUrl(entry.url1001) ? String(entry.url1001) : '',
                    urlMixesDb: /^https:\/\/www\.mixesdb\.com\//i.test(String(entry.urlMixesDb || ''))
                        ? String(entry.urlMixesDb)
                        : '',
                    urlTrackId: /^https:\/\/trackid\.net\//i.test(String(entry.urlTrackId || ''))
                        ? String(entry.urlTrackId)
                        : '',
                    candidates1001,
                    candidatesMixesDb,
                    candidatesTrackId,
                    candidateIndex1001: Math.max(0, Number(entry.candidateIndex1001) || 0),
                    candidateIndexMixesDb: Math.max(0, Number(entry.candidateIndexMixesDb) || 0),
                    candidateIndexTrackId: Math.max(0, Number(entry.candidateIndexTrackId) || 0),
                }];
            })
            .filter(([, entry]) => (
                entry.tracks1001.length || entry.tracksMixesDb.length || entry.tracksTrackId.length ||
                entry.candidates1001.length || entry.candidatesMixesDb.length || entry.candidatesTrackId.length
            )));
    }

    async function loadTracklistCache() {
        try {
            let stored = null;
            if (globalThis.chrome?.storage?.local) {
                const result = await globalThis.chrome.storage.local.get(TRACKLIST_CACHE_STORAGE_KEY);
                stored = result[TRACKLIST_CACHE_STORAGE_KEY];
            } else if (typeof globalThis.GM_getValue === 'function') {
                stored = await globalThis.GM_getValue(TRACKLIST_CACHE_STORAGE_KEY, null);
            }
            tracklistCache = normalizeTracklistCache(stored);
        } catch (error) {
            tracklistCache = {};
            console.warn('[CD HUD] Could not load the local tracklist cache.', error);
        }
    }

    async function persistTracklistCache() {
        try {
            tracklistCache = normalizeTracklistCache(tracklistCache);
            if (globalThis.chrome?.storage?.local) {
                await globalThis.chrome.storage.local.set({ [TRACKLIST_CACHE_STORAGE_KEY]: tracklistCache });
            } else if (typeof globalThis.GM_setValue === 'function') {
                await globalThis.GM_setValue(TRACKLIST_CACHE_STORAGE_KEY, tracklistCache);
            }
        } catch (error) {
            console.warn('[CD HUD] Could not persist the local tracklist cache.', error);
        }
    }

    function scheduleTracklistCachePersist() {
        if (cachePersistTimer !== null) clearTimeout(cachePersistTimer);
        cachePersistTimer = setTimeout(() => {
            cachePersistTimer = null;
            void persistTracklistCache();
        }, 100);
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function hexToRgb(hex) {
        const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
        return match ? match.slice(1).map(component => parseInt(component, 16)) : [99, 179, 237];
    }

    function applyRuntimeAppearance() {
        const root = document.documentElement;
        if (!root) return;
        const [r, g, b] = hexToRgb(runtimeSettings.accentColor);
        root.style.setProperty('--hud-focus', runtimeSettings.accentColor);
        root.style.setProperty('--hud-surface', `rgba(26, 32, 44, ${runtimeSettings.surfaceOpacity / 100})`);
        root.style.setProperty('--hud-user-accent-soft', `rgba(${r}, ${g}, ${b}, .16)`);
        root.style.setProperty(
            '--hud-font',
            HUD_FONT_STACKS[runtimeSettings.fontFamily] || HUD_FONT_STACKS['cascadia-mono']
        );

        const hud = document.getElementById('yt-cd-hud');
        if (hud) {
            hud.classList.toggle('ytcd-hide-disc', !runtimeSettings.showDisc);
            hud.classList.toggle('ytcd-hide-transport', !runtimeSettings.showTransport);
            hud.classList.toggle(
                'ytcd-hide-1001',
                !runtimeSettings.enable1001 && !runtimeSettings.enableMixesDb && !runtimeSettings.enableTrackId
            );
            hud.style.display = runtimeSettings.enabled ? '' : 'none';
        }
        if (tracklistPanel && !runtimeSettings.enabled) tracklistPanel.style.display = 'none';

        let customStyle = document.getElementById('yt-cd-hud-custom-style');
        if (!customStyle) {
            customStyle = document.createElement('style');
            customStyle.id = 'yt-cd-hud-custom-style';
            (document.head || document.documentElement).appendChild(customStyle);
        }
        customStyle.textContent = runtimeSettings.customCss;
        applySizing();
    }

    function applyRuntimeSettings(nextSettings, reschedule = true) {
        const previous = runtimeSettings;
        runtimeSettings = SETTINGS_API
            ? SETTINGS_API.normalize(nextSettings)
            : { ...RUNTIME_DEFAULTS, ...nextSettings };
        hudTitleFontSize = runtimeSettings.titleFontSize;
        hudTimeFontSize = runtimeSettings.timeFontSize;

        if (!runtimeSettings.enable1001) {
            activeSearchToken++;
            cancelActiveRequests();
            resetProviderCandidates('1001');
            searchState = 'idle';
            searchStateDetail = '';
            pending1001VerificationRequest = null;
            clear1001VerificationReturn();
            lastSearchTitle = '';
            if (currentSource === '1001') setActiveSource(tracksFromYouTube.length ? 'youtube' : 'none');
        }
        if (!runtimeSettings.enableMixesDb) {
            resetProviderCandidates('mixesdb');
            if (currentSource === 'mixesdb') setActiveSource('none');
        }
        if (!runtimeSettings.enableTrackId) {
            resetProviderCandidates('trackid');
            if (currentSource === 'trackid') setActiveSource('none');
        }

        applyRuntimeAppearance();
        updateStatusLight();
        updateSourceButtons();
        updateLinkButton();

        if (reschedule && runtimeSettings.enabled && (
            !previous.enabled ||
            previous.enable1001 !== runtimeSettings.enable1001 ||
            previous.autoSearch1001 !== runtimeSettings.autoSearch1001 ||
            previous.enableMixesDb !== runtimeSettings.enableMixesDb ||
            previous.enableTrackId !== runtimeSettings.enableTrackId
        )) {
            scheduleInitialization();
        }
    }

    async function prepareExtensionSettings() {
        if (!SETTINGS_API || !globalThis.chrome || !chrome.storage || !chrome.storage.local) return;
        try {
            const stored = await chrome.storage.local.get(SETTINGS_API.STORAGE_KEY);
            applyRuntimeSettings(stored[SETTINGS_API.STORAGE_KEY] || SETTINGS_API.DEFAULTS, false);
        } catch (error) {
            console.warn('[CD HUD] Could not load extension settings; using defaults.', error);
            applyRuntimeSettings(SETTINGS_API.DEFAULTS, false);
        }

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local' || !changes[SETTINGS_API.STORAGE_KEY]) return;
            applyRuntimeSettings(changes[SETTINGS_API.STORAGE_KEY].newValue || SETTINGS_API.DEFAULTS);
        });
    }

    function isSuccessfulHttpStatus(status) {
        return Number.isFinite(status) && status >= 200 && status < 300;
    }

    function normalizeAngleDelta(delta) {
        if (delta > Math.PI) return delta - Math.PI * 2;
        if (delta < -Math.PI) return delta + Math.PI * 2;
        return delta;
    }

    function angleDeltaToSeconds(delta) {
        return delta * DISC_SCRUB_SECONDS_PER_REVOLUTION / (Math.PI * 2);
    }

    function getBalancedDiscSize(viewportWidth, viewportHeight, titleSize) {
        const shorterSide = Math.min(Number(viewportWidth) || 0, Number(viewportHeight) || 0);
        const responsiveBase = clamp(shorterSide * 0.052, 44, 64);
        const typeScale = clamp((Number(titleSize) || DEFAULT_TITLE_SIZE) / DEFAULT_TITLE_SIZE, 0.8, 1.45);
        return clamp(responsiveBase * 1.2 * typeScale, 42, 92);
    }

    function getContentBalancedDiscSize(viewportWidth, viewportHeight, titleSize, contentHeight, scale = 1) {
        const responsiveSize = getBalancedDiscSize(viewportWidth, viewportHeight, titleSize);
        const balancedSize = Math.max(responsiveSize, Math.max(0, Number(contentHeight) || 0) + 10);
        return clamp(balancedSize * (Number(scale) || 1), 42, 148);
    }

    function chooseHudTitle(source, currentTrack, officialChapter) {
        const trackTitle = trim(currentTrack);
        if (source === '1001') return trackTitle || '1001 Tracklist';
        return trim(officialChapter) || trackTitle || 'Full Track Set';
    }

    function getGoogleTrackSearchUrl(trackTitle) {
        const query = trim(String(trackTitle || ''));
        return query
            ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
            : 'https://www.google.com/';
    }

    function getTracklistSourcePage(source, videoId, sourceUrls = {}) {
        const definitions = {
            youtube: {
                label: 'YT',
                url: videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '',
            },
            '1001': { label: '1001', url: String(sourceUrls.oneThousand || '') },
            mixesdb: { label: 'MIXESDB', url: String(sourceUrls.mixesDb || '') },
            trackid: { label: 'TRACKID', url: String(sourceUrls.trackId || '') },
            none: { label: 'NONE', url: '' },
        };
        return definitions[source] || definitions.none;
    }

    function calculateHudMinimumSize(metrics) {
        const paddingLeft = Math.max(0, Number(metrics.paddingLeft) || 0);
        const paddingRight = Math.max(0, Number(metrics.paddingRight) || 0);
        const paddingTop = Math.max(0, Number(metrics.paddingTop) || 0);
        const paddingBottom = Math.max(0, Number(metrics.paddingBottom) || 0);
        const sideWidth = Math.max(0, Number(metrics.sideWidth) || 0);
        const sideHeight = Math.max(0, Number(metrics.sideHeight) || 0);
        const rightRailReserve = Math.max(paddingRight, sideWidth + 8);
        return {
            width: Math.ceil(
                paddingLeft +
                Math.max(0, Number(metrics.discWidth) || 0) +
                Math.max(0, Number(metrics.gap) || 0) +
                Math.max(0, Number(metrics.infoWidth) || 0) +
                rightRailReserve +
                2
            ),
            height: Math.ceil(
                paddingTop +
                Math.max(
                    Math.max(0, Number(metrics.discHeight) || 0),
                    Math.max(0, Number(metrics.infoHeight) || 0),
                    sideHeight + 8
                ) +
                paddingBottom
            ),
        };
    }

    function resolveHudWidth(naturalWidth, preferredWidth, minimumWidth, maximumWidth) {
        const minimum = Math.max(1, Number(minimumWidth) || 1);
        const maximum = Math.max(minimum, Number(maximumWidth) || minimum);
        const preferred = Number(preferredWidth);
        const natural = Math.max(minimum, Number(naturalWidth) || minimum);
        return clamp(Number.isFinite(preferred) && preferred > 0 ? preferred : natural, minimum, maximum);
    }

    function getAdjacentTrackTime(tracks, currentTime, direction) {
        if (!Array.isArray(tracks) || !tracks.length) return NaN;
        const validTracks = tracks.filter(track => Number.isFinite(track.time) && track.time >= 0);
        if (!validTracks.length) return NaN;
        if (direction > 0) {
            const nextTrack = validTracks.find(track => track.time > currentTime + 0.75);
            return nextTrack ? nextTrack.time : validTracks[validTracks.length - 1].time;
        }
        let activeIndex = -1;
        for (let index = validTracks.length - 1; index >= 0; index--) {
            if (validTracks[index].time <= currentTime) {
                activeIndex = index;
                break;
            }
        }
        if (activeIndex < 0) return validTracks[0].time;
        const activeTrack = validTracks[activeIndex];
        if (currentTime - activeTrack.time > 3) return activeTrack.time;
        return validTracks[Math.max(0, activeIndex - 1)].time;
    }

    function getVideoId() {
        try {
            const url = new URL(window.location.href);
            const queryId = url.searchParams.get('v');
            if (queryId) return queryId;
            const pathMatch = /^\/(?:shorts|live|embed)\/([^/?#]+)/.exec(url.pathname);
            return pathMatch ? decodeURIComponent(pathMatch[1]) : '';
        } catch (error) {
            console.warn('[CD HUD] Cannot parse the current YouTube URL.', error);
            return '';
        }
    }

    function getVideoTitle() {
        const titleEl = document.querySelector([
            'ytd-watch-metadata h1 yt-formatted-string',
            '#above-the-fold #title h1 yt-formatted-string',
            '#title h1 yt-formatted-string',
            '#title h1',
        ].join(', '));
        if (titleEl) return trim(titleEl.textContent);
        const t = document.title.replace(/\s*-\s*YouTube$/, '');
        return t || '';
    }

    function normalizeSearchTitle(title) {
        return trim(String(title || '')
            .normalize('NFKC')
            .replace(/[\[(]\s*(?:official(?:\s+(?:music\s+)?video)?|live|hd|4k|8k|lyrics?|full\s+set|audio)\s*[\])]/gi, ' ')
            .replace(/\b(?:official(?:\s+(?:music\s+)?(?:video|audio))?|full\s+set|lyrics?\s+video)\b/gi, ' ')
            .replace(/\s*[|｜]\s*(?:youtube|official)\s*$/i, ' ')
            .replace(/\s+/g, ' '));
    }

    function getTitleTokens(title) {
        const stopWords = new Set(['the', 'and', 'with', 'from', 'live', 'official', 'video', 'audio', 'full', 'set']);
        return normalizeSearchTitle(title)
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .split(/[^\p{L}\p{N}]+/u)
            .filter(token => token.length > 1 && !stopWords.has(token));
    }

    function parseSearchResultDuration(value) {
        const text = trim(String(value || '')).toLowerCase();
        const hours = /(?:^|\s)(\d+(?:\.\d+)?)\s*h\b/.exec(text);
        const minutes = /(?:^|\s)(\d+(?:\.\d+)?)\s*m\b/.exec(text);
        if (!hours && !minutes) return 0;
        return Math.round((Number(hours && hours[1]) || 0) * 3600 + (Number(minutes && minutes[1]) || 0) * 60);
    }

    function create1001BridgeToken() {
        if (!globalThis.crypto) return '';
        if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
        if (typeof globalThis.crypto.getRandomValues !== 'function') return '';
        const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function register1001BridgeSession() {
        const token = create1001BridgeToken();
        if (!token || !globalThis.chrome?.runtime?.sendMessage) return Promise.resolve('');
        return new Promise(resolve => {
            globalThis.chrome.runtime.sendMessage({
                type: 'YT_CD_HUD_REGISTER_1001_BRIDGE',
                token,
            }, result => {
                if (globalThis.chrome.runtime.lastError || !result?.ok) {
                    resolve('');
                    return;
                }
                resolve(token);
            });
        });
    }

    function submit1001SearchVerification(request, openWindow = (...args) => window.open(...args), bridgeToken = '') {
        if (!request || request.method !== 'POST' || !request.fields) return false;
        let action;
        try {
            action = new URL(request.url);
        } catch (error) {
            return false;
        }
        if (!is1001TracklistsUrl(action.href) || action.pathname !== '/search/result.php') return false;

        let targetWindow = null;
        try {
            targetWindow = openWindow('', '_blank');
            if (!targetWindow || !targetWindow.document) return false;
            targetWindow.opener = null;
            const form = targetWindow.document.createElement('form');
            form.method = 'POST';
            if (bridgeToken) action.hash = `yt-cd-hud-session=${encodeURIComponent(bridgeToken)}`;
            form.action = action.href;
            Object.entries(request.fields).forEach(([name, value]) => {
                const input = targetWindow.document.createElement('input');
                input.type = 'hidden';
                input.name = name;
                input.value = String(value);
                form.appendChild(input);
            });
            (targetWindow.document.body || targetWindow.document.documentElement).appendChild(form);
            form.submit();
            return true;
        } catch (error) {
            console.warn('[CD HUD] Could not replay the blocked 1001Tracklists search.', error);
            if (targetWindow && typeof targetWindow.close === 'function') targetWindow.close();
            return false;
        }
    }

    async function open1001TracklistsPage() {
        if (pending1001VerificationRequest) {
            const targetWindow = window.open('', '_blank');
            const bridgeToken = await register1001BridgeSession();
            if (targetWindow) {
                if (pending1001VerificationRequest.method === 'POST' && submit1001SearchVerification(
                    pending1001VerificationRequest,
                    () => targetWindow,
                    bridgeToken
                )) {
                    arm1001VerificationReturn();
                    return;
                }
                if (pending1001VerificationRequest.method === 'GET') {
                    try {
                        const targetUrl = new URL(pending1001VerificationRequest.url);
                        if (is1001TracklistsUrl(targetUrl.href)) {
                            if (bridgeToken) {
                                targetUrl.hash = `yt-cd-hud-session=${encodeURIComponent(bridgeToken)}`;
                            }
                            targetWindow.opener = null;
                            targetWindow.location.replace(targetUrl.href);
                            arm1001VerificationReturn();
                            return;
                        }
                    } catch (error) {
                        console.warn('[CD HUD] Could not open the blocked 1001Tracklists candidate.', error);
                    }
                }
                if (typeof targetWindow.close === 'function') targetWindow.close();
            }
        }
        if (tracklistUrl1001) {
            window.open(tracklistUrl1001, '_blank', 'noopener,noreferrer');
            if (searchState === 'error' && pending1001VerificationRequest) {
                arm1001VerificationReturn();
            }
        }
    }

    function shouldRetry1001AfterVerificationReturn(awaiting, visibilityState, elapsedMs) {
        return Boolean(awaiting && visibilityState !== 'hidden' && elapsedMs >= 500);
    }

    function clear1001VerificationReturn() {
        awaiting1001VerificationReturn = false;
        awaiting1001VerificationVideoId = '';
        verificationPageOpenedAt = 0;
        if (verificationReturnRetryTimer !== null) {
            clearTimeout(verificationReturnRetryTimer);
            verificationReturnRetryTimer = null;
        }
    }

    function arm1001VerificationReturn() {
        awaiting1001VerificationReturn = true;
        awaiting1001VerificationVideoId = getVideoId();
        verificationPageOpenedAt = Date.now();
        searchStateDetail = '1001 搜尋頁已開啟；請保留該結果分頁並返回此 YouTube 分頁，將自動重新搜尋並切換至 1001 曲目。';
        updateStatusLight();
    }

    function handle1001VerificationReturn() {
        if (!shouldRetry1001AfterVerificationReturn(
            awaiting1001VerificationReturn,
            document.visibilityState,
            Date.now() - verificationPageOpenedAt
        )) return;
        if (!awaiting1001VerificationVideoId || getVideoId() !== awaiting1001VerificationVideoId) {
            clear1001VerificationReturn();
            return;
        }

        awaiting1001VerificationReturn = false;
        automaticSearchBlockedUntil = 0;
        searchStateDetail = '已返回 YouTube，正在重新讀取完成驗證後的 1001 曲目…';
        updateStatusLight();
        verificationReturnRetryTimer = setTimeout(() => {
            verificationReturnRetryTimer = null;
            awaiting1001VerificationVideoId = '';
            verificationPageOpenedAt = 0;
            retrySearch(true);
        }, 350);
    }

    function handle1001BridgeReadyMessage(message) {
        if (!message || message.type !== 'YT_CD_HUD_1001_BRIDGE_READY') return false;
        if (!awaiting1001VerificationReturn) return false;
        if (!awaiting1001VerificationVideoId || getVideoId() !== awaiting1001VerificationVideoId) {
            clear1001VerificationReturn();
            return false;
        }

        awaiting1001VerificationReturn = false;
        automaticSearchBlockedUntil = 0;
        searchStateDetail = '1001 驗證已完成，正在重新讀取曲目…';
        updateStatusLight();
        if (verificationReturnRetryTimer !== null) clearTimeout(verificationReturnRetryTimer);
        verificationReturnRetryTimer = setTimeout(() => {
            verificationReturnRetryTimer = null;
            awaiting1001VerificationVideoId = '';
            verificationPageOpenedAt = 0;
            retrySearch(true);
        }, 100);
        return false;
    }

    function collectTracklistCandidates(doc, title, expectedDuration = 0, limit = 5) {
        if (!doc || typeof doc.querySelectorAll !== 'function') return [];
        const queryTokens = [...new Set(getTitleTokens(title))];
        const seenUrls = new Set();
        const candidates = [];

        Array.from(doc.querySelectorAll('a[href*="/tracklist/"]')).forEach((link, index) => {
            if (typeof link.closest === 'function' && link.closest('nav, footer')) return;
            let href;
            try {
                href = new URL(link.getAttribute('href'), 'https://www.1001tracklists.com/').href;
            } catch (error) {
                return;
            }
            if (!is1001TracklistsUrl(href) || seenUrls.has(href)) return;
            seenUrls.add(href);

            const resultRow = typeof link.closest === 'function' ? link.closest('.bItm') : null;
            const dateText = resultRow && typeof resultRow.querySelector === 'function'
                ? resultRow.querySelector('[title="tracklist date"]')?.textContent || ''
                : '';
            const candidateTokens = new Set(getTitleTokens(`${link.textContent || ''} ${dateText}`));
            const matchedTokens = queryTokens.filter(token => candidateTokens.has(token)).length;
            const recall = queryTokens.length ? matchedTokens / queryTokens.length : 0;
            const precision = candidateTokens.size ? matchedTokens / candidateTokens.size : 0;
            const titleScore = recall * 0.75 + precision * 0.25;
            if (queryTokens.length && matchedTokens === 0) return;
            if (queryTokens.length >= 3 && (matchedTokens < 2 || recall < 0.3 || titleScore < 0.25)) return;

            const durationText = resultRow && typeof resultRow.querySelector === 'function'
                ? resultRow.querySelector('[title="play time"]')?.textContent || ''
                : '';
            const candidateDuration = parseSearchResultDuration(durationText);
            const durationDifference = expectedDuration > 0 && candidateDuration > 0
                ? Math.abs(candidateDuration - expectedDuration)
                : 0;
            const maximumDurationDifference = Math.max(900, Number(expectedDuration) * 0.35);
            if (durationDifference > maximumDurationDifference) return;
            const durationScale = Math.max(Number(expectedDuration) * 0.5, 900);
            const durationScore = expectedDuration > 0 && candidateDuration > 0
                ? Math.max(0, 1 - Math.abs(candidateDuration - expectedDuration) / durationScale)
                : 0.5;
            const score = titleScore * 0.9 + durationScore * 0.1;
            candidates.push({ href, score, index });
        });

        return candidates
            .sort((left, right) => right.score - left.score || left.index - right.index)
            .slice(0, limit)
            .map(candidate => candidate.href);
    }

    function parseRemoteHtml(html) {
        const markup = String(html || '')
            .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
            .replace(/<link\b[^>]*>/gi, '')
            .replace(/<label\b/gi, '<span data-cd-hud-remote-label')
            .replace(/<\/label\s*>/gi, '</span>');
        if (!markup.trim()) return null;

        if (window.trustedTypes && !remoteHtmlPolicy) {
            console.warn('[CD HUD] Trusted Types is enforced, but the scoped parser policy is unavailable.');
            return null;
        }

        try {
            const parserInput = remoteHtmlPolicy ? remoteHtmlPolicy.createHTML(markup) : markup;
            return new DOMParser().parseFromString(parserInput, 'text/html');
        } catch (error) {
            console.warn('[CD HUD] Inert HTML parsing failed.', error);
        }

        if (typeof Document.parseHTML === 'function') {
            try {
                return Document.parseHTML(markup);
            } catch (error) {
                console.warn('[CD HUD] Sanitized HTML fallback parsing failed.', error);
            }
        }

        return null;
    }

    function getResponseHeader(response, headerName) {
        const headers = String(response && response.responseHeaders || '');
        const match = new RegExp(`^${headerName}:\\s*([^\\r\\n]+)`, 'im').exec(headers);
        return match ? trim(match[1]) : '';
    }

    function getResponseText(response) {
        if (response && typeof response.responseText === 'string') return response.responseText;
        if (response && typeof response.response === 'string') return response.response;
        return '';
    }

    function requestJson(url) {
        return new Promise((resolve, reject) => {
            let rawRequest = null;
            let trackedRequest = null;
            let settled = false;
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                if (trackedRequest) activeSupplementalRequests.delete(trackedRequest);
                callback(value);
            };
            rawRequest = GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: { Accept: 'application/json' },
                timeout: runtimeSettings.requestTimeoutMs,
                onload: response => {
                    if (!isSuccessfulHttpStatus(response.status)) {
                        finish(reject, new Error(`HTTP ${response.status}`));
                        return;
                    }
                    try {
                        finish(resolve, JSON.parse(getResponseText(response)));
                    } catch (error) {
                        finish(reject, new Error('遠端回應不是有效 JSON。'));
                    }
                },
                onerror: error => finish(
                    reject,
                    error instanceof Error ? error : new Error(error && error.error || '網路請求失敗。')
                ),
                ontimeout: () => finish(reject, new Error('遠端請求逾時。')),
            });
            if (rawRequest && typeof rawRequest.abort === 'function') {
                trackedRequest = {
                    abort() {
                        rawRequest.abort();
                        finish(reject, new Error('遠端請求已取消。'));
                    },
                };
                activeSupplementalRequests.add(trackedRequest);
            }
        });
    }

    function getTitleMatchScore(queryTitle, candidateTitle) {
        const queryTokens = [...new Set(getTitleTokens(queryTitle))];
        if (!queryTokens.length) return 0;
        const candidateTokens = new Set(getTitleTokens(candidateTitle));
        return queryTokens.filter(token => candidateTokens.has(token)).length / queryTokens.length;
    }

    function getTrackTitleParts(title) {
        const normalized = normalizeSearchTitle(title);
        const parts = normalized.split(/\s+[-–—]\s+/);
        if (parts.length < 2) return { artist: '', track: normalized };
        return {
            artist: trim(parts.shift()),
            track: trim(parts.join(' - ')),
        };
    }

    function getCoreTrackTokens(title) {
        const { track } = getTrackTitleParts(title);
        return [...new Set(getTitleTokens(track.replace(/[[(][^\])]*[\])]/g, ' ')))]
            .filter(token => !['mix', 'remix', 'edit', 'version', 'remaster', 'remastered'].includes(token));
    }

    function getSignificantVersionTokens(title) {
        const bracketText = Array.from(String(title || '').matchAll(/[[(]([^\])]+)[\])]/g))
            .map(match => match[1])
            .join(' ');
        const genericTokens = new Set([
            'mix', 'remix', 'edit', 'version', 'original', 'extended', 'radio', 'club',
            'remaster', 'remastered', 'official', 'audio', 'video',
        ]);
        return [...new Set(getTitleTokens(bracketText))].filter(token => !genericTokens.has(token));
    }

    function rankTrackIdMusicCandidates(queryTitle, candidates) {
        const queryParts = getTrackTitleParts(queryTitle);
        const queryArtistTokens = [...new Set(getTitleTokens(queryParts.artist))];
        const queryCoreTokens = getCoreTrackTokens(queryTitle);
        const queryVersionTokens = getSignificantVersionTokens(queryTitle);
        if (!queryCoreTokens.length) return [];

        return (candidates || []).map(candidate => {
            const candidateArtistTokens = new Set(getTitleTokens(candidate.artist));
            const candidateCoreTokens = new Set(getCoreTrackTokens(candidate.title));
            const candidateAllTokens = new Set(getTitleTokens(`${candidate.artist || ''} ${candidate.title || ''}`));
            const artistScore = queryArtistTokens.length
                ? queryArtistTokens.filter(token => candidateArtistTokens.has(token)).length / queryArtistTokens.length
                : 1;
            const coreScore = queryCoreTokens.filter(token => candidateCoreTokens.has(token)).length / queryCoreTokens.length;
            const versionScore = queryVersionTokens.length
                ? queryVersionTokens.filter(token => candidateAllTokens.has(token)).length / queryVersionTokens.length
                : 1;
            return {
                ...candidate,
                artistScore,
                coreScore,
                versionScore,
                score: artistScore * 0.35 + coreScore * 0.45 + versionScore * 0.2,
            };
        }).filter(candidate => (
            candidate.artistScore >= 0.5 &&
            candidate.coreScore >= 0.8 &&
            candidate.versionScore >= 0.66
        )).sort((left, right) => right.score - left.score);
    }

    function selectSingleTrackMatch(queryTitle, tracks) {
        const candidates = (tracks || []).map((track, index) => {
            const parts = getTrackTitleParts(track.title);
            return {
                artist: parts.artist,
                title: parts.track,
                slug: String(index),
                originalTrack: track,
            };
        });
        const match = rankTrackIdMusicCandidates(queryTitle, candidates)[0];
        return match ? { time: 0, title: match.originalTrack.title } : null;
    }

    function isLikelySingleTrackVideo(title, duration) {
        if (!Number.isFinite(duration) || duration <= 0 || duration > SINGLE_TRACK_MAX_DURATION_SECONDS) return false;
        return !/\b(?:dj\s*set|podcast|radio\s*show|essential\s*mix|full\s*set|live\s*set)\b/i.test(title);
    }

    function getTrackIdMusicFallbackQuery(title) {
        return trim(normalizeSearchTitle(title).replace(/[[(][^\])]*[\])]/g, ' ').replace(/\s+/g, ' '));
    }

    function getTrackIdAudioSearchQueries(title) {
        const exactQuery = normalizeSearchTitle(title) || trim(title);
        const tokens = getTitleTokens(exactQuery);
        const tokenQuery = tokens.join(' ');
        const conciseQuery = tokens.length > 8 ? tokens.slice(0, 8).join(' ') : '';
        return [...new Set([exactQuery, tokenQuery, conciseQuery].filter(Boolean))];
    }

    function getMixesDbExactSourceLookupUrl(videoId) {
        if (!/^[\w-]{11}$/.test(String(videoId || ''))) return '';
        const apiUrl = new URL('https://www.mixesdb.com/w/api.php');
        apiUrl.search = new URLSearchParams({
            action: 'query',
            list: 'exturlusage',
            euprotocol: 'https',
            euquery: `www.youtube.com/watch?v=${videoId}`,
            eunamespace: '0',
            eulimit: 'max',
            format: 'json',
            formatversion: '2',
        }).toString();
        return apiUrl.href;
    }

    function getDurationDifferenceSeconds(durationText, videoDuration) {
        const candidateDuration = parseTimestampToSeconds(String(durationText || '').split('.')[0]);
        if (!Number.isFinite(candidateDuration) || !Number.isFinite(videoDuration) || videoDuration <= 0) return Infinity;
        return Math.abs(candidateDuration - videoDuration);
    }

    function stripWikiMarkup(value) {
        return trim(String(value || '')
            .replace(/<!--[^]*?-->/g, ' ')
            .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)]]/g, '$1')
            .replace(/\[(?:https?:\/\/\S+)\s+([^\]]+)]/g, '$1')
            .replace(/\{\{[^{}]*}}/g, ' ')
            .replace(/'{2,}/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' '));
    }

    function parseMixesDbWikitext(wikitext) {
        const tracks = [];
        const seen = new Set();
        String(wikitext || '').split(/\r?\n/).forEach(line => {
            if (!/^\s*[#*]/.test(line)) return;
            const match = line.match(/\[\s*(\d{1,3}:[0-5]\d(?::[0-5]\d)?)\s*]/);
            if (!match) return;
            const time = parseTimestampToSeconds(match[1]);
            const title = stripWikiMarkup(line.slice((match.index || 0) + match[0].length).replace(/^\s*[-–—:]?\s*/, ''));
            const key = `${time}\u0000${title}`;
            if (!Number.isFinite(time) || !title || seen.has(key)) return;
            seen.add(key);
            tracks.push({ time, title });
        });
        return tracks.sort((left, right) => left.time - right.time);
    }

    function parseTrackIdDetail(payload) {
        const result = payload && payload.result || {};
        const tracks = [];
        const seen = new Set();
        (result.detectionProcesses || []).forEach(process => {
            (process.detectionProcessMusicTracks || []).forEach(track => {
                const time = parseTimestampToSeconds(String(track.startTime || '').split('.')[0]);
                const title = trim([track.artist, track.title].filter(Boolean).join(' - '));
                const key = `${time}\u0000${title}`;
                if (!Number.isFinite(time) || !title || seen.has(key)) return;
                seen.add(key);
                tracks.push({ time, title });
            });
        });
        return tracks.sort((left, right) => left.time - right.time);
    }

    function isHtmlResponse(response, responseText) {
        const contentType = getResponseHeader(response, 'content-type').toLowerCase();
        if (contentType) {
            return contentType.includes('text/html') || contentType.includes('application/xhtml+xml');
        }
        return /^\s*(?:<!doctype\s+html|<html\b)/i.test(responseText);
    }

    function is1001TracklistsUrl(url) {
        try {
            return /(^|\.)1001tracklists\.com$/i.test(new URL(url).hostname);
        } catch (error) {
            return false;
        }
    }

    function detectBlockPage(doc, responseText, status) {
        if (status === 403) {
            return '1001Tracklists 拒絕自動請求並要求瀏覽器驗證（HTTP 403）；請用連結按鈕完成檢查後再返回重試。';
        }
        if (status === 429) return '1001Tracklists 暫時限制請求頻率（HTTP 429）。';
        const pageTitle = trim(doc && doc.title).toLowerCase();
        const sample = String(responseText || '').slice(0, 200000).toLowerCase();
        const siteCaptchaNode = doc && doc.querySelector(
            'form[action*="/info/unblock_ip.html"], input[name="captcha"], #captchaBtn'
        );
        if (
            siteCaptchaNode ||
            /too many requests in a short amount of time|fill out the captcha to unblock your ip|\/info\/unblock_ip\.html/.test(sample)
        ) {
            return '1001Tracklists 已限制請求頻率並要求 CAPTCHA；請用連結按鈕開啟網站完成驗證後再重試。';
        }
        const validTracklistContent = doc && doc.querySelector(
            '.bItm a[href*="/tracklist/"], input[id$="_cue_seconds"][value], input[name*="cue_seconds"][value]'
        );
        if (validTracklistContent) return '';
        const challengeNode = doc && doc.querySelector(
            '#challenge-form, #turnstile-container, .cf-turnstile, input[name="cf-turnstile-response"], ' +
            'input[name="cf_chl_opt"], input[name="bChk"]'
        );
        if (
            challengeNode ||
            /just a moment|checking your browser|attention required|access denied/.test(pageTitle) ||
            /cf-chl-|challenge-platform|cdn-cgi\/challenge-platform|onturnstileload|turnstile\.render|turnstile-container|please wait, you will be forwarded|please enable javascript/.test(sample)
        ) {
            return '1001Tracklists 要求瀏覽器驗證；請用連結按鈕開啟網站完成檢查後再重試。';
        }
        return '';
    }

    function cancelActiveRequests() {
        [activeSearchRequest, activeTracklistRequest].forEach(request => {
            if (!request || typeof request.abort !== 'function') return;
            try {
                request.abort();
            } catch (error) {
                console.warn('[CD HUD] Could not abort a stale request.', error);
            }
        });
        activeSearchRequest = null;
        activeTracklistRequest = null;
        activeSupplementalRequests.forEach(request => {
            try {
                request.abort();
            } catch (error) {
                console.warn('[CD HUD] Could not abort a stale supplemental request.', error);
            }
        });
        activeSupplementalRequests.clear();
        if (activeCandidateTimer !== null) {
            clearTimeout(activeCandidateTimer);
            activeCandidateTimer = null;
        }
    }

    function parseDescriptionTracks() {
        const description = document.querySelector([
            'ytd-watch-metadata #description-inline-expander',
            'ytd-watch-metadata #description',
            'ytd-text-inline-expander#description-inline-expander',
            '#description-inline-expander',
            '#description',
        ].join(', '));
        tracksFromYouTube = [];
        if (!description) {
            console.log('[CD HUD] No description element found.');
            return;
        }
        const text = description.innerText || '';
        const regex = /(\d{1,2}:\d{2}(?::\d{2})?)\s*[-\u2013/) ]*\s*([^\r\n]+)/g;
        let match;
        let found = 0;
        const seenTracks = new Set();
        while ((match = regex.exec(text)) !== null) {
            const title = trim(match[2].replace(/^[-\u2013/)\s]+/, ''));
            const time = parseTimestampToSeconds(match[1]);
            const trackKey = `${time}\u0000${title}`;
            if (title && Number.isFinite(time) && !seenTracks.has(trackKey)) {
                seenTracks.add(trackKey);
                tracksFromYouTube.push({ time, title });
                found++;
            }
        }
        tracksFromYouTube.sort((a, b) => a.time - b.time);
        console.log(`[CD HUD] Parsed ${found} tracks from description.`);
        if (currentSource === 'youtube' || !getAvailableRemoteSource()) {
            setActiveSource('youtube');
        }
    }

    function getAvailableRemoteSource() {
        if (tracksFrom1001.length) return '1001';
        if (tracksFromMixesDb.length) return 'mixesdb';
        if (tracksFromTrackId.length) return 'trackid';
        return '';
    }

    function applyProviderCandidate(source, index, activate = false) {
        const candidates = tracklistCandidates[source] || [];
        if (!candidates.length) return false;
        const selectedIndex = clamp(Number(index) || 0, 0, candidates.length - 1);
        const selected = candidates[selectedIndex];
        tracklistCandidateIndexes[source] = selectedIndex;
        if (source === '1001') {
            tracksFrom1001 = selected.tracks;
            tracklistUrl1001 = selected.url;
        } else if (source === 'mixesdb') {
            tracksFromMixesDb = selected.tracks;
            tracklistUrlMixesDb = selected.url;
        } else if (source === 'trackid') {
            tracksFromTrackId = selected.tracks;
            tracklistUrlTrackId = selected.url;
        }
        if (activate || currentSource === source) setActiveSource(source);
        else {
            updateSourceButtons();
            updateLinkButton();
            if (tracklistPanel && tracklistVisible) renderTracklist(tracklistPanel);
        }
        return true;
    }

    function replaceProviderCandidates(source, candidates, selectedIndex = 0) {
        tracklistCandidates[source] = normalizeCachedCandidates(candidates, source);
        tracklistCandidateIndexes[source] = 0;
        return applyProviderCandidate(source, selectedIndex, false);
    }

    function appendProviderCandidate(source, tracks, url) {
        const next = normalizeCachedCandidates([
            ...(tracklistCandidates[source] || []),
            { tracks, url },
        ], source);
        const added = next.length > (tracklistCandidates[source] || []).length;
        tracklistCandidates[source] = next;
        if (added && next.length === 1) applyProviderCandidate(source, 0, false);
        return added;
    }

    function resetProviderCandidates(source) {
        tracklistCandidates[source] = [];
        tracklistCandidateIndexes[source] = 0;
        if (source === '1001') {
            tracksFrom1001 = [];
            tracklistUrl1001 = '';
        } else if (source === 'mixesdb') {
            tracksFromMixesDb = [];
            tracklistUrlMixesDb = '';
        } else if (source === 'trackid') {
            tracksFromTrackId = [];
            tracklistUrlTrackId = '';
        }
    }

    function cycleTracklistCandidate(source) {
        const candidates = tracklistCandidates[source] || [];
        if (candidates.length <= 1) return false;
        const index = tracklistCandidateIndexes[source] || 0;
        if (index >= candidates.length - 1) return false;
        applyProviderCandidate(source, index + 1, true);
        searchStateDetail = `${source.toUpperCase()} 候選（${index + 2}/${candidates.length}）`;
        updateStatusLight();
        cacheCurrentTracklists(getVideoId());
        return true;
    }

    function cacheCurrentTracklists(videoId) {
        if (!videoId || !getAvailableRemoteSource()) return;
        const activeRemoteSource = ['youtube', '1001', 'mixesdb', 'trackid'].includes(currentSource)
            ? currentSource
            : getAvailableRemoteSource();
        tracklistCache[videoId] = {
            savedAt: Date.now(),
            activeSource: activeRemoteSource,
            tracks1001: normalizeCachedTracks(tracksFrom1001),
            tracksMixesDb: normalizeCachedTracks(tracksFromMixesDb),
            tracksTrackId: normalizeCachedTracks(tracksFromTrackId),
            url1001: tracklistUrl1001,
            urlMixesDb: tracklistUrlMixesDb,
            urlTrackId: tracklistUrlTrackId,
            candidates1001: tracklistCandidates['1001'],
            candidatesMixesDb: tracklistCandidates.mixesdb,
            candidatesTrackId: tracklistCandidates.trackid,
            candidateIndex1001: tracklistCandidateIndexes['1001'],
            candidateIndexMixesDb: tracklistCandidateIndexes.mixesdb,
            candidateIndexTrackId: tracklistCandidateIndexes.trackid,
        };
        tracklistCache = normalizeTracklistCache(tracklistCache);
        scheduleTracklistCachePersist();
    }

    function restoreCachedTracklists(videoId) {
        const cached = tracklistCache[videoId];
        if (!cached) return false;
        if (Number(cached.savedAt) <= Date.now() - TRACKLIST_CACHE_TTL_MS) {
            delete tracklistCache[videoId];
            scheduleTracklistCachePersist();
            return false;
        }
        const restoreCandidates = (source, candidates, tracks, url, index) => {
            const normalized = normalizeCachedCandidates(candidates, source);
            replaceProviderCandidates(source, normalized.length ? normalized : [{ tracks, url }], index);
        };
        if (runtimeSettings.enable1001) {
            restoreCandidates('1001', cached.candidates1001, cached.tracks1001, cached.url1001, cached.candidateIndex1001);
        }
        if (runtimeSettings.enableMixesDb) {
            restoreCandidates('mixesdb', cached.candidatesMixesDb, cached.tracksMixesDb, cached.urlMixesDb, cached.candidateIndexMixesDb);
        }
        if (runtimeSettings.enableTrackId) {
            restoreCandidates('trackid', cached.candidatesTrackId, cached.tracksTrackId, cached.urlTrackId, cached.candidateIndexTrackId);
        }
        const availableSource = (
            cached.activeSource === '1001' && tracksFrom1001.length ? '1001' :
            cached.activeSource === 'mixesdb' && tracksFromMixesDb.length ? 'mixesdb' :
            cached.activeSource === 'trackid' && tracksFromTrackId.length ? 'trackid' :
            getAvailableRemoteSource()
        );
        if (!availableSource) return false;
        currentSource = availableSource;
        parsedTracks = availableSource === '1001'
            ? tracksFrom1001
            : availableSource === 'mixesdb' ? tracksFromMixesDb : tracksFromTrackId;
        cacheHitVideoId = videoId;
        searchState = 'success';
        searchStateDetail = `快取：${availableSource.toUpperCase()}（${parsedTracks.length} 首）`;
        lastSearchTitle = getVideoTitle();
        console.log(`[CD HUD] Restored ${parsedTracks.length} ${availableSource} tracks from local cache.`);
        return cached.activeSource || availableSource;
    }

    function setActiveSource(source) {
        if (source === 'youtube' && tracksFromYouTube.length) {
            parsedTracks = tracksFromYouTube;
            currentSource = 'youtube';
        } else if (source === '1001' && tracksFrom1001.length) {
            parsedTracks = tracksFrom1001;
            currentSource = '1001';
        } else if (source === 'mixesdb' && tracksFromMixesDb.length) {
            parsedTracks = tracksFromMixesDb;
            currentSource = 'mixesdb';
        } else if (source === 'trackid' && tracksFromTrackId.length) {
            parsedTracks = tracksFromTrackId;
            currentSource = 'trackid';
        } else {
            if (tracksFromYouTube.length) {
                parsedTracks = tracksFromYouTube;
                currentSource = 'youtube';
            } else if (tracksFrom1001.length) {
                parsedTracks = tracksFrom1001;
                currentSource = '1001';
            } else if (tracksFromMixesDb.length) {
                parsedTracks = tracksFromMixesDb;
                currentSource = 'mixesdb';
            } else if (tracksFromTrackId.length) {
                parsedTracks = tracksFromTrackId;
                currentSource = 'trackid';
            } else {
                parsedTracks = [];
                currentSource = 'none';
            }
        }
        if (tracklistPanel && tracklistVisible) {
            renderTracklist(tracklistPanel);
        }
        if (currentVideo) {
            updateTracklistHighlight(currentVideo.currentTime);
            updateHud();
        }
        updateSourceButtons();
        updateLinkButton();
        updateTransportButtons();
    }

    function fetchTracklistFrom1001(title, videoId, force = false, manual = false, activateOnSuccess = false) {
        if (!title || !videoId) return;
        if (!runtimeSettings.enable1001) return;
        if (!force && !runtimeSettings.autoSearch1001) return;
        if (!force && (videoId === lastVideoIdFor1001 && title === lastSearchTitle)) return;
        if (!manual && Date.now() < automaticSearchBlockedUntil) {
            searchState = 'error';
            searchStateDetail = '1001Tracklists 自動查詢已暫停 5 分鐘，避免持續觸發 IP 限制；完成 CAPTCHA 後可按 RETRY SEARCH。';
            if (!tracklistUrl1001) tracklistUrl1001 = 'https://www.1001tracklists.com/search/';
            updateStatusLight();
            updateLinkButton();
            return;
        }
        lastVideoIdFor1001 = videoId;
        lastSearchTitle = title;
        const searchToken = ++activeSearchToken;
        cancelActiveRequests();
        resetProviderCandidates('1001');
        pending1001VerificationRequest = null;
        searchState = 'searching';
        searchStateDetail = '';
        updateStatusLight();
        const searchTitle = normalizeSearchTitle(title) || title;
        console.log(`[CD HUD] Searching 1001tracklists for: "${searchTitle}"`);

        const isCurrentSearch = () => (
            searchToken === activeSearchToken && getVideoId() === videoId
        );
        const markSearchError = (message, details, blocked = false) => {
            if (!isCurrentSearch()) return;
            if (details) console.warn(`[CD HUD] ${message}`, details);
            else console.warn(`[CD HUD] ${message}`);
            if (blocked) automaticSearchBlockedUntil = Date.now() + AUTOMATIC_SEARCH_BLOCK_COOLDOWN_MS;
            searchState = 'error';
            searchStateDetail = message;
            if (!tracklistUrl1001) tracklistUrl1001 = searchPageUrl;
            updateStatusLight();
            updateLinkButton();
        };

        const searchUrl = 'https://www.1001tracklists.com/search/result.php';
        const searchPageUrl = 'https://www.1001tracklists.com/search/';
        const searchData = new URLSearchParams({
            main_search: searchTitle,
            search_selection: '9',
        }).toString();

        activeSearchRequest = GM_xmlhttpRequest({
            method: 'POST',
            url: searchUrl,
            data: searchData,
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            },
            timeout: runtimeSettings.requestTimeoutMs,
            onload: function (resp) {
                activeSearchRequest = null;
                if (!isCurrentSearch()) return;
                const responseText = getResponseText(resp);
                const contentType = getResponseHeader(resp, 'content-type') || 'unknown';
                const finalUrl = resp.finalUrl || searchUrl;
                if (!is1001TracklistsUrl(finalUrl)) {
                    markSearchError('1001Tracklists 搜尋被重新導向到非預期網站。');
                    return;
                }
                if (!isSuccessfulHttpStatus(resp.status)) {
                    const errorDocument = isHtmlResponse(resp, responseText)
                        ? parseRemoteHtml(responseText)
                        : null;
                    const blockReason = detectBlockPage(errorDocument, responseText, resp.status);
                    if (blockReason) {
                        tracklistUrl1001 = searchUrl;
                        pending1001VerificationRequest = {
                            method: 'POST',
                            url: searchUrl,
                            fields: { main_search: searchTitle, search_selection: '9' },
                        };
                    }
                    markSearchError(
                        blockReason || `1001Tracklists 搜尋失敗（HTTP ${resp.status}，${contentType}）。`,
                        blockReason ? {
                            phase: 'search',
                            status: resp.status,
                            finalUrl,
                            contentType,
                        } : undefined,
                        Boolean(blockReason)
                    );
                    return;
                }
                if (!isHtmlResponse(resp, responseText)) {
                    markSearchError(`搜尋回應不是 HTML（${contentType}）。`);
                    return;
                }
                const doc = parseRemoteHtml(responseText);
                if (!doc) {
                    markSearchError('瀏覽器無法安全解析 1001Tracklists 搜尋回應。');
                    return;
                }
                const blockReason = detectBlockPage(doc, responseText, resp.status);
                if (blockReason) {
                    tracklistUrl1001 = searchUrl;
                    pending1001VerificationRequest = {
                        method: 'POST',
                        url: searchUrl,
                        fields: { main_search: searchTitle, search_selection: '9' },
                    };
                    markSearchError(blockReason, {
                        phase: 'search',
                        status: resp.status,
                        finalUrl,
                        contentType,
                    }, true);
                    return;
                }
                const candidates = collectTracklistCandidates(
                    doc,
                    searchTitle,
                    Number(currentVideo && currentVideo.duration) || 0
                )
                    .slice(0, runtimeSettings.maxCandidates);
                if (!candidates.length) {
                    markSearchError('搜尋完成，但找不到符合的 1001Tracklists 曲目頁。');
                    return;
                }
                const stopAdditionalCandidateCollection = reason => {
                    if (!tracklistCandidates['1001'].length) return false;
                    console.warn(`[CD HUD] Stopped collecting additional 1001 candidates: ${reason}`);
                    searchState = 'success';
                    searchStateDetail = `1001Tracklists：${tracklistCandidates['1001'].length} 個候選`;
                    updateStatusLight();
                    updateLinkButton();
                    cacheCurrentTracklists(videoId);
                    return true;
                };
                const loadCandidate = candidateIndex => {
                    if (!isCurrentSearch()) return;
                    if (candidateIndex >= candidates.length) {
                        if (tracklistCandidates['1001'].length) {
                            searchState = 'success';
                            searchStateDetail = `1001Tracklists：${tracklistCandidates['1001'].length} 個候選`;
                            updateStatusLight();
                            updateLinkButton();
                            cacheCurrentTracklists(videoId);
                            return;
                        }
                        markSearchError(
                            `已嘗試 ${candidates.length} 個候選曲目頁，但都沒有可解析的時間戳。`
                        );
                        return;
                    }

                    const href = candidates[candidateIndex];
                    if (!tracklistCandidates['1001'].length) tracklistUrl1001 = href;
                    console.log(
                        `[CD HUD] Trying tracklist candidate ${candidateIndex + 1}/${candidates.length}: ${href}`
                    );

                    activeTracklistRequest = GM_xmlhttpRequest({
                        method: 'GET',
                        url: href,
                        headers: {
                            Accept: 'text/html,application/xhtml+xml',
                        },
                        timeout: runtimeSettings.requestTimeoutMs,
                        onload: function (resp2) {
                            activeTracklistRequest = null;
                            if (!isCurrentSearch()) return;
                            const tracklistText = getResponseText(resp2);
                            const tracklistContentType = getResponseHeader(resp2, 'content-type') || 'unknown';
                            const finalTracklistUrl = resp2.finalUrl || href;
                            if (!is1001TracklistsUrl(finalTracklistUrl)) {
                                if (stopAdditionalCandidateCollection('重新導向到非預期網站')) return;
                                markSearchError('曲目頁被重新導向到非預期網站。');
                                return;
                            }
                            if (!isSuccessfulHttpStatus(resp2.status)) {
                                const errorDocument = isHtmlResponse(resp2, tracklistText)
                                    ? parseRemoteHtml(tracklistText)
                                    : null;
                                const pageBlockReason = detectBlockPage(errorDocument, tracklistText, resp2.status);
                                if (stopAdditionalCandidateCollection(pageBlockReason || `HTTP ${resp2.status}`)) return;
                                if (pageBlockReason) {
                                    tracklistUrl1001 = finalTracklistUrl;
                                    pending1001VerificationRequest = { method: 'GET', url: finalTracklistUrl };
                                }
                                markSearchError(
                                    pageBlockReason ||
                                    `曲目頁載入失敗（HTTP ${resp2.status}，${tracklistContentType}）。`,
                                    pageBlockReason ? {
                                        phase: 'tracklist',
                                        candidate: candidateIndex + 1,
                                        status: resp2.status,
                                        finalUrl: finalTracklistUrl,
                                        contentType: tracklistContentType,
                                    } : undefined,
                                    Boolean(pageBlockReason)
                                );
                                return;
                            }
                            if (!isHtmlResponse(resp2, tracklistText)) {
                                if (stopAdditionalCandidateCollection('回應不是 HTML')) return;
                                markSearchError(`曲目頁回應不是 HTML（${tracklistContentType}）。`);
                                return;
                            }
                            const tracklistDocument = parseRemoteHtml(tracklistText);
                            if (!tracklistDocument) {
                                if (stopAdditionalCandidateCollection('無法安全解析頁面')) return;
                                markSearchError('瀏覽器無法安全解析 1001Tracklists 曲目頁。');
                                return;
                            }
                            const pageBlockReason = detectBlockPage(tracklistDocument, tracklistText, resp2.status);
                            if (pageBlockReason) {
                                if (stopAdditionalCandidateCollection(pageBlockReason)) return;
                                tracklistUrl1001 = finalTracklistUrl;
                                pending1001VerificationRequest = { method: 'GET', url: finalTracklistUrl };
                                markSearchError(pageBlockReason, {
                                    phase: 'tracklist',
                                    candidate: candidateIndex + 1,
                                    status: resp2.status,
                                    finalUrl: finalTracklistUrl,
                                    contentType: tracklistContentType,
                                }, true);
                                return;
                            }
                            const tracks = parseTracklistDocument(tracklistDocument);
                            if (!tracks.length) {
                                console.warn(`[CD HUD] Candidate has no timestamped tracks: ${href}`);
                                scheduleCandidate(candidateIndex + 1);
                                return;
                            }

                            const duration = Number(currentVideo && currentVideo.duration) || 0;
                            const isSingleTrack = isLikelySingleTrackVideo(title, duration);
                            const singleTrackMatch = isSingleTrack
                                ? selectSingleTrackMatch(title, tracks)
                                : null;
                            if (isSingleTrack && !singleTrackMatch) {
                                console.warn(`[CD HUD] Candidate does not contain the requested single track: ${href}`);
                                scheduleCandidate(candidateIndex + 1);
                                return;
                            }
                            const resolvedTracks = singleTrackMatch ? [singleTrackMatch] : tracks;

                            console.log(`[CD HUD] Loaded ${resolvedTracks.length} tracks from 1001.`);
                            const isFirstCandidate = tracklistCandidates['1001'].length === 0;
                            appendProviderCandidate('1001', resolvedTracks, finalTracklistUrl);
                            pending1001VerificationRequest = null;
                            searchState = 'success';
                            searchStateDetail = `1001Tracklists：${tracklistCandidates['1001'].length} 個候選`;
                            automaticSearchBlockedUntil = 0;
                            if (isFirstCandidate && (activateOnSuccess || runtimeSettings.prefer1001 || !tracksFromYouTube.length)) {
                                setActiveSource('1001');
                            } else if (isFirstCandidate && currentSource === '1001') {
                                setActiveSource('1001');
                            } else {
                                updateSourceButtons();
                            }
                            updateLinkButton();
                            updateStatusLight();
                            cacheCurrentTracklists(videoId);
                            scheduleCandidate(candidateIndex + 1);
                        },
                        onerror: function (err) {
                            activeTracklistRequest = null;
                            if (tracklistCandidates['1001'].length) {
                                console.warn('[CD HUD] Stopped collecting additional 1001 candidates after a network error.', err);
                                searchState = 'success';
                                searchStateDetail = `1001Tracklists：${tracklistCandidates['1001'].length} 個候選`;
                                updateStatusLight();
                                return;
                            }
                            markSearchError('曲目頁網路請求失敗；請檢查連線權限或阻擋器。', err);
                        },
                        ontimeout: function () {
                            activeTracklistRequest = null;
                            if (tracklistCandidates['1001'].length) {
                                searchState = 'success';
                                searchStateDetail = `1001Tracklists：${tracklistCandidates['1001'].length} 個候選`;
                                updateStatusLight();
                                return;
                            }
                            markSearchError('曲目頁請求逾時。');
                        },
                    });
                };

                const scheduleCandidate = candidateIndex => {
                    if (!isCurrentSearch()) return;
                    if (activeCandidateTimer !== null) clearTimeout(activeCandidateTimer);
                    activeCandidateTimer = setTimeout(() => {
                        activeCandidateTimer = null;
                        loadCandidate(candidateIndex);
                    }, CANDIDATE_REQUEST_DELAY_MS);
                };

                scheduleCandidate(0);
            },
            onerror: function (err) {
                activeSearchRequest = null;
                markSearchError('1001Tracklists 搜尋網路請求失敗；請檢查連線權限或阻擋器。', err);
            },
            ontimeout: function () {
                activeSearchRequest = null;
                markSearchError('1001Tracklists 搜尋請求逾時。');
            },
        });
    }

    async function fetchTracklistFromMixesDb(title, videoId) {
        if (!runtimeSettings.enableMixesDb || !title || !videoId) return;
        resetProviderCandidates('mixesdb');
        searchState = 'searching';
        searchStateDetail = '正在搜尋 MixesDB…';
        updateStatusLight();
        const searchTitle = normalizeSearchTitle(title) || title;
        const apiUrl = new URL('https://www.mixesdb.com/w/api.php');
        apiUrl.search = new URLSearchParams({
            action: 'query',
            list: 'search',
            srsearch: searchTitle,
            srnamespace: '0',
            srlimit: String(runtimeSettings.maxCandidates),
            format: 'json',
            formatversion: '2',
        }).toString();

        try {
            const exactSourceLookupUrl = getMixesDbExactSourceLookupUrl(videoId);
            let exactSourcePayload = null;
            if (exactSourceLookupUrl) {
                try {
                    exactSourcePayload = await requestJson(exactSourceLookupUrl);
                } catch (error) {
                    console.warn('[CD HUD] MixesDB exact-source lookup failed; continuing with title search.', error);
                }
            }
            if (getVideoId() !== videoId) return;
            const searchPayload = await requestJson(apiUrl.href);
            if (getVideoId() !== videoId) return;
            const exactSourceCandidates = (
                exactSourcePayload && exactSourcePayload.query && exactSourcePayload.query.exturlusage || []
            ).map(candidate => ({
                title: candidate.title,
                score: 1,
                exactSource: true,
            }));
            const titleCandidates = (searchPayload.query && searchPayload.query.search || [])
                .map(candidate => ({
                    title: candidate.title,
                    score: getTitleMatchScore(searchTitle, candidate.title),
                    exactSource: false,
                }))
                .filter(candidate => candidate.score >= 0.35);
            const candidates = [...new Map(
                [...titleCandidates, ...exactSourceCandidates]
                    .map(candidate => [candidate.title, candidate])
            ).values()]
                .sort((left, right) => right.score - left.score)
                .slice(0, runtimeSettings.maxCandidates);

            const matchedCandidates = [];
            for (const candidate of candidates) {
                const detailUrl = new URL('https://www.mixesdb.com/w/api.php');
                detailUrl.search = new URLSearchParams({
                    action: 'query',
                    prop: 'revisions|extlinks',
                    titles: candidate.title,
                    rvprop: 'content',
                    rvslots: 'main',
                    ellimit: 'max',
                    format: 'json',
                    formatversion: '2',
                }).toString();
                const detailPayload = await requestJson(detailUrl.href);
                if (getVideoId() !== videoId) return;
                const page = detailPayload.query && detailPayload.query.pages && detailPayload.query.pages[0];
                const revision = page && page.revisions && page.revisions[0];
                const wikitext = revision && revision.slots && revision.slots.main && revision.slots.main.content || '';
                const tracks = parseMixesDbWikitext(wikitext);
                const externalUrls = (page && page.extlinks || []).map(link => link.url || link['*'] || '');
                const exactSource = candidate.exactSource || externalUrls.some(url => String(url).includes(videoId));
                const lastCue = tracks.length ? tracks[tracks.length - 1].time : 0;
                const duration = Number(currentVideo && currentVideo.duration) || 0;
                const plausibleCoverage = !duration || (lastCue <= duration + 300 && lastCue >= duration * 0.45);
                if (!tracks.length || (!exactSource && (candidate.score < 0.55 || !plausibleCoverage))) continue;

                matchedCandidates.push({
                    tracks,
                    url: `https://www.mixesdb.com/w/${encodeURIComponent(candidate.title.replace(/ /g, '_'))}`,
                });
            }
            if (!matchedCandidates.length) throw new Error('找不到標題與錄音長度均可信的曲目頁。');
            replaceProviderCandidates('mixesdb', matchedCandidates);
            searchState = 'success';
            searchStateDetail = `MixesDB：${matchedCandidates.length} 個候選`;
            setActiveSource('mixesdb');
            updateSourceButtons();
            updateLinkButton();
            updateStatusLight();
            cacheCurrentTracklists(videoId);
        } catch (error) {
            if (getVideoId() !== videoId) return;
            searchState = 'error';
            searchStateDetail = `MixesDB 搜尋失敗：${error && error.message || error}`;
            updateStatusLight();
            updateLinkButton();
        }
    }

    async function fetchTrackIdMusicTrack(title, videoId) {
        const exactQuery = normalizeSearchTitle(title) || title;
        const fallbackQuery = getTrackIdMusicFallbackQuery(exactQuery);
        const loadCandidates = async keywords => {
            const query = new URLSearchParams({
                keywords,
                pageSize: String(Math.max(runtimeSettings.maxCandidates, 10)),
                currentPage: '0',
            });
            const payload = await requestJson(`https://trackid.net/api/public/musictracks?${query}`);
            return payload.result && payload.result.musicTracks || [];
        };

        let candidates = await loadCandidates(exactQuery);
        if (!candidates.length && fallbackQuery && fallbackQuery !== exactQuery) {
            candidates = await loadCandidates(fallbackQuery);
        }
        if (getVideoId() !== videoId) return false;
        const matchedCandidates = rankTrackIdMusicCandidates(exactQuery, candidates)
            .filter(candidate => candidate.slug)
            .slice(0, runtimeSettings.maxCandidates)
            .map(candidate => ({
                tracks: [{
                    time: 0,
                    title: trim([candidate.artist, candidate.title].filter(Boolean).join(' - ')),
                }],
                url: `https://trackid.net/musictracks/${encodeURIComponent(candidate.slug)}`,
            }));
        if (!matchedCandidates.length) return false;

        replaceProviderCandidates('trackid', matchedCandidates);
        searchState = 'success';
        searchStateDetail = `TrackId.net：${matchedCandidates.length} 個單曲候選`;
        setActiveSource('trackid');
        updateSourceButtons();
        updateLinkButton();
        updateStatusLight();
        cacheCurrentTracklists(videoId);
        return true;
    }

    async function fetchTracklistFromTrackId(title, videoId) {
        if (!runtimeSettings.enableTrackId || !title || !videoId) return;
        resetProviderCandidates('trackid');
        searchState = 'searching';
        searchStateDetail = '正在搜尋 TrackId.net…';
        updateStatusLight();
        const searchTitle = normalizeSearchTitle(title) || title;

        try {
            const rawCandidates = [];
            const seenCandidateKeys = new Set();
            for (const keywords of getTrackIdAudioSearchQueries(searchTitle)) {
                const query = new URLSearchParams({
                    keywords,
                    pageSize: String(Math.max(runtimeSettings.maxCandidates, 10)),
                    currentPage: '0',
                    sortField: '',
                    sortDirection: '',
                    audioStreamType: '',
                    status: '3',
                    styles: '',
                    minAddedOn: '',
                    maxAddedOn: '',
                    username: '',
                    channel: '',
                });
                const payload = await requestJson(`https://trackid.net/api/public/audiostreams?${query}`);
                (payload.result && payload.result.audiostreams || []).forEach(candidate => {
                    const key = String(candidate.slug || candidate.externalId || candidate.url || '');
                    if (!key || seenCandidateKeys.has(key)) return;
                    seenCandidateKeys.add(key);
                    rawCandidates.push(candidate);
                });
                if (rawCandidates.some(candidate => (
                    candidate.externalId === videoId || String(candidate.url || '').includes(videoId)
                ))) break;
            }
            if (getVideoId() !== videoId) return;
            const duration = Number(currentVideo && currentVideo.duration) || 0;
            const candidates = rawCandidates
                .map(candidate => {
                    const exactSource = candidate.externalId === videoId || String(candidate.url || '').includes(videoId);
                    const titleScore = getTitleMatchScore(searchTitle, candidate.title);
                    const durationDifference = getDurationDifferenceSeconds(candidate.duration, duration);
                    const durationTolerance = Math.max(120, duration * 0.1);
                    return { ...candidate, exactSource, titleScore, durationDifference, durationTolerance };
                })
                .filter(candidate => candidate.exactSource || (
                    candidate.titleScore >= 0.6 && candidate.durationDifference <= candidate.durationTolerance
                ))
                .sort((left, right) => (
                    Number(right.exactSource) - Number(left.exactSource) ||
                    right.titleScore - left.titleScore ||
                    left.durationDifference - right.durationDifference
                ));
            if (!candidates.some(candidate => candidate.slug)) {
                if (isLikelySingleTrackVideo(searchTitle, duration)) {
                    const matchedMusicTrack = await fetchTrackIdMusicTrack(searchTitle, videoId);
                    if (matchedMusicTrack) return;
                    throw new Error('單曲索引沒有版本資訊足夠一致的結果。');
                }
                throw new Error('找不到影片 ID，或標題與錄音長度均可信的結果。');
            }

            const matchedCandidates = [];
            for (const candidate of candidates.slice(0, runtimeSettings.maxCandidates)) {
                if (!candidate.slug) continue;
                try {
                    const detailPayload = await requestJson(`https://trackid.net/api/public/audiostreams/${encodeURIComponent(candidate.slug)}`);
                    if (getVideoId() !== videoId) return;
                    const tracks = parseTrackIdDetail(detailPayload);
                    if (!tracks.length) continue;
                    matchedCandidates.push({
                        tracks,
                        url: `https://trackid.net/audiostreams/${encodeURIComponent(candidate.slug)}`,
                    });
                } catch (error) {
                    console.warn('[CD HUD] Could not load an additional TrackId.net candidate.', error);
                }
            }
            if (!matchedCandidates.length && isLikelySingleTrackVideo(searchTitle, duration)) {
                const matchedMusicTrack = await fetchTrackIdMusicTrack(searchTitle, videoId);
                if (matchedMusicTrack) return;
            }
            if (!matchedCandidates.length) throw new Error('候選頁沒有可用的時間戳曲目。');
            replaceProviderCandidates('trackid', matchedCandidates);
            searchState = 'success';
            searchStateDetail = `TrackId.net：${matchedCandidates.length} 個候選`;
            setActiveSource('trackid');
            updateSourceButtons();
            updateLinkButton();
            updateStatusLight();
            cacheCurrentTracklists(videoId);
        } catch (error) {
            if (getVideoId() !== videoId) return;
            searchState = 'error';
            searchStateDetail = `TrackId.net 搜尋失敗：${error && error.message || error}`;
            updateStatusLight();
            updateLinkButton();
        }
    }

    function parseTracklistDocument(doc) {
        if (!doc || typeof doc.querySelectorAll !== 'function') return [];
        const tracks = [];
        const seenTracks = new Set();

        const addTrack = (timeText, titleText, directSeconds = '') => {
            const timeMatch = trim(timeText).match(/\b\d{1,3}:[0-5]\d(?::[0-5]\d)?\b/);
            const secondsText = trim(directSeconds);
            const numericSeconds = secondsText ? Number(secondsText) : NaN;
            const time = Number.isFinite(numericSeconds) && numericSeconds >= 0
                ? numericSeconds
                : (timeMatch ? parseTimestampToSeconds(timeMatch[0]) : NaN);
            const title = trim(titleText).replace(/\s+/g, ' ');
            if (!Number.isFinite(time) || !title) return;
            const trackKey = `${time}\u0000${title}`;
            if (seenTracks.has(trackKey)) return;
            seenTracks.add(trackKey);
            tracks.push({ time, title });
        };

        const selectors = [
            '.bItm',
            'tr.tlpItem',
            'tr[id^="tlp"]',
            '.tlRow',
            '.tracklist-row',
            '.tl-item',
            '.tracklist-item',
            '.tl-entry',
            '.track-entry'
        ];
        let rows = [];
        for (const sel of selectors) {
            const found = doc.querySelectorAll(sel);
            if (found.length) {
                rows = found;
                break;
            }
        }

        if (rows.length) {
            rows.forEach(row => {
                const timeEl = row.querySelector(
                    '.cue, .cueValueField, .tlTime, .tl-time, .time, .timestamp, .duration'
                );
                const titleEl = row.querySelector(
                    '.trackValue, .trackFormat, .tlTrack, .tl-track, .track-name, .title, .track, .track-title'
                );
                const secondsInput = row.querySelector(
                    'input[id$="_cue_seconds"][value], input[name*="cue_seconds"][value]'
                );
                const cueAction = row.querySelector('[onclick*="cue"]');
                const cueActionMatch = cueAction
                    ? /\bcue\s*:\s*['"]?(\d+)/i.exec(cueAction.getAttribute('onclick') || '')
                    : null;
                const metadataTitle = row.querySelector('[itemprop="name"][content]');
                const metadataText = metadataTitle
                    ? metadataTitle.getAttribute('content')
                    : '';
                addTrack(
                    timeEl ? timeEl.textContent : '',
                    titleEl ? titleEl.textContent : metadataText,
                    secondsInput
                        ? secondsInput.getAttribute('value')
                        : (cueActionMatch ? cueActionMatch[1] : '')
                );
            });
        }

        if (!tracks.length) {
            const pageText = doc.body ? (doc.body.innerText || doc.body.textContent || '') : '';
            const regex = /(?:^|\n)\s*(\d{1,3}:[0-5]\d(?::[0-5]\d)?)\s+([^\n]+)/g;
            let match;
            while ((match = regex.exec(pageText)) !== null) {
                addTrack(match[1], match[2]);
            }
        }

        tracks.sort((a, b) => a.time - b.time);
        return tracks;
    }

    function getCurrentTrack(currentTime) {
        for (let i = parsedTracks.length - 1; i >= 0; i--) {
            if (currentTime >= parsedTracks[i].time) return parsedTracks[i].title;
        }
        return null;
    }

    function extractColorFromImage(imgUrl, videoId, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            if (videoId !== latestColorRequestVideoId) {
                callback(null);
                return;
            }
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const sampleSize = 100;
            canvas.width = sampleSize;
            canvas.height = sampleSize;
            ctx.drawImage(img, 0, 0, sampleSize, sampleSize);

            let r = 0, g = 0, b = 0, count = 0;
            const start = Math.floor(sampleSize * 0.2);
            const end = Math.floor(sampleSize * 0.8);

            try {
                const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
                const data = imageData.data;
                for (let y = start; y < end; y++) {
                    for (let x = start; x < end; x++) {
                        const idx = (y * sampleSize + x) * 4;
                        r += data[idx];
                        g += data[idx + 1];
                        b += data[idx + 2];
                        count++;
                    }
                }
            } catch (e) {
                console.warn('[CD HUD] Cannot extract color from canvas (tainted), using default theme.');
                callback(null);
                return;
            }

            if (count === 0) {
                callback(null);
                return;
            }
            const avgR = Math.round(r / count);
            const avgG = Math.round(g / count);
            const avgB = Math.round(b / count);
            callback({ r: avgR, g: avgG, b: avgB });
        };
        img.onerror = function () {
            callback(null);
        };
        img.src = imgUrl;
    }

    function applyColorScheme(color) {
        const root = document.documentElement;
        if (!color) {
            root.style.setProperty('--hud-cover-accent', 'rgba(160, 174, 192, .5)');
            root.style.setProperty('--hud-cover-glow', 'rgba(99, 179, 237, .18)');
            return;
        }
        const { r, g, b } = color;
        root.style.setProperty('--hud-cover-accent', `rgba(${r}, ${g}, ${b}, .58)`);
        root.style.setProperty('--hud-cover-glow', `rgba(${r}, ${g}, ${b}, .24)`);
    }

    function updateCoverAndColor() {
        const videoId = getVideoId();
        const art = document.getElementById('cd-art');
        if (!art || !videoId) return;
        const url = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
        art.style.backgroundImage = `url("${url}")`;
        latestColorRequestVideoId = videoId;
        extractColorFromImage(url, videoId, color => {
            if (getVideoId() !== videoId || latestColorRequestVideoId !== videoId) return;
            if (color) {
                applyColorScheme(color);
            } else {
                applyColorScheme(null);
            }
        });
    }

    function injectStyles() {
        if (document.getElementById('yt-cd-hud-style')) return;
        const style = document.createElement('style');
        style.id = 'yt-cd-hud-style';
        const css = `
            :root {
                --hud-primary: #e2e8f0;
                --hud-secondary: #a0aec0;
                --hud-title: #f7fafc;
                --hud-text: #cbd5e0;
                --hud-muted: #718096;
                --hud-surface: rgba(26, 32, 44, .85);
                --hud-surface-raised: #2d3748;
                --hud-border: #4a5568;
                --hud-focus: #63b3ed;
                --hud-success: #48bb78;
                --hud-warning: #ecc94b;
                --hud-error: #f56565;
                --hud-cover-accent: rgba(160, 174, 192, .5);
                --hud-cover-glow: rgba(99, 179, 237, .18);
                --hud-shadow: 0 4px 6px -1px rgba(0, 0, 0, .3), 0 2px 4px -1px rgba(0, 0, 0, .2);
                --hud-font: "Cascadia Mono", "Cascadia Code", "Lucida Console", Consolas, monospace;
                --hud-disc-size: clamp(52.8px, 6.24vmin, 76.8px);
            }
            #yt-cd-hud {
                box-sizing: border-box;
                position: absolute;
                top: 20px;
                left: 20px;
                z-index: 60;
                background: transparent;
                border: 0;
                padding: 0 42px 0 0;
                display: flex;
                align-items: center;
                gap: 6px;
                width: max-content;
                min-width: 0;
                min-height: 118px;
                font-family: var(--hud-font);
                box-shadow: none;
                pointer-events: none;
                cursor: default;
                user-select: none;
                -webkit-user-select: none;
                touch-action: none;
                transition: opacity .2s ease, transform .2s ease, border-color .15s ease;
                transform-origin: top left;
                will-change: transform;
            }
            .hud-panel-surface {
                position: absolute;
                inset: 0 0 0 calc(var(--hud-balanced-disc-size, var(--hud-disc-size)) / 2);
                z-index: 0;
                overflow: hidden;
                background:
                    linear-gradient(180deg, rgba(45, 55, 72, .3), transparent 42%),
                    var(--hud-surface);
                backdrop-filter: blur(8px) saturate(.86);
                -webkit-backdrop-filter: blur(8px) saturate(.86);
                border: 1px solid var(--hud-border);
                border-radius: 2px;
                box-shadow: var(--hud-shadow), inset 3px 0 0 rgba(99, 179, 237, .72), inset 0 1px 0 rgba(247, 250, 252, .04);
                pointer-events: auto;
                cursor: grab;
                transition: opacity .2s ease, border-color .15s ease;
            }
            #yt-cd-hud.yt-cd-hud-dragging .hud-panel-surface { cursor: grabbing; }
            #yt-cd-hud.resizing { cursor: ew-resize; }
            #yt-cd-hud.ytcd-hide-disc .cd-disc-wrapper {
                visibility: hidden;
                pointer-events: none;
            }
            #yt-cd-hud.ytcd-hide-transport .hud-transport-controls { display: none; }
            #yt-cd-hud.ytcd-hide-1001 .hud-status-button { display: none; }
            .hud-panel-surface:after {
                content: "";
                position: absolute;
                left: 10px;
                right: 10px;
                bottom: 4px;
                height: 1px;
                background: linear-gradient(90deg, var(--hud-focus) 0 18%, transparent 18% 21%, var(--hud-border) 21% 100%);
                opacity: .72;
            }
            .cd-disc-wrapper {
                position: relative;
                z-index: 2;
                width: var(--hud-disc-size);
                height: var(--hud-disc-size);
                flex-shrink: 0;
                border-radius: 50%;
                filter: drop-shadow(0 2px 3px rgba(0, 0, 0, .5));
                cursor: grab;
                touch-action: none;
                margin: 0 2px 0 0;
                pointer-events: auto;
            }
            .cd-disc {
                position: absolute;
                inset: 0;
                overflow: hidden;
                border: 1px solid var(--hud-cover-accent);
                border-radius: 50%;
                background: #111827;
                box-shadow: 0 0 0 1px rgba(15, 23, 42, .86), 0 0 8px var(--hud-cover-glow);
            }
            .cd-disc:before {
                content: "";
                position: absolute;
                inset: 0;
                z-index: 3;
                border-radius: 50%;
                background:
                    radial-gradient(circle at var(--cd-reflection-x, 34%) var(--cd-reflection-y, 24%),
                        rgba(255, 255, 255, .72) 0 3%,
                        rgba(226, 232, 240, .3) 7%,
                        rgba(99, 179, 237, .12) 15%,
                        transparent 29%),
                    linear-gradient(var(--cd-reflection-angle, 135deg),
                        transparent 24%,
                        rgba(255, 255, 255, .18) 43%,
                        rgba(160, 174, 192, .06) 52%,
                        transparent 70%);
                mix-blend-mode: screen;
                opacity: var(--cd-reflection-opacity, 0);
                transition: opacity .18s ease;
                pointer-events: none;
            }
            .cd-art {
                position: absolute;
                inset: 0;
                z-index: 1;
                border-radius: 50%;
                clip-path: circle(50% at 50% 50%);
                background-color: #111827;
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;
                animation: cd-spin 3.5s linear infinite;
                animation-play-state: paused;
                will-change: transform;
                cursor: inherit;
            }
            .cd-disc:after {
                content: "";
                position: absolute;
                inset: 0;
                z-index: 2;
                border-radius: 50%;
                background:
                    radial-gradient(circle at center,
                        rgba(17, 24, 39, .98) 0 7%,
                        rgba(226, 232, 240, .92) 7.5% 9%,
                        rgba(17, 24, 39, .94) 9.5% 12%,
                        transparent 12.5%),
                    repeating-radial-gradient(circle at center,
                        transparent 0 3px,
                        rgba(247, 250, 252, .055) 3.5px 4px),
                    linear-gradient(125deg,
                        rgba(247, 250, 252, .2),
                        transparent 34%,
                        rgba(15, 23, 42, .26) 74%,
                        rgba(247, 250, 252, .08));
                box-shadow: inset 0 0 0 1px rgba(247, 250, 252, .1), inset 0 0 10px rgba(15, 23, 42, .28);
                pointer-events: none;
            }
            .cd-art.playing { animation-play-state: running; }
            .cd-disc-wrapper.scrubbing { cursor: grabbing; }
            .cd-disc-wrapper.scrubbing .cd-art {
                animation: none;
                transform: rotate(var(--cd-scrub-angle, 0deg));
            }
            .cd-disc-wrapper.scrub-forward .cd-disc {
                border-color: var(--hud-focus);
                box-shadow: 0 0 0 1px rgba(15, 23, 42, .86), 0 0 9px rgba(99, 179, 237, .42);
            }
            .cd-disc-wrapper.scrub-reverse .cd-disc {
                border-color: var(--hud-warning);
                box-shadow: 0 0 0 1px rgba(15, 23, 42, .86), 0 0 9px rgba(236, 201, 75, .46);
            }
            @keyframes cd-spin { 100% { transform: rotate(360deg); } }

            .hud-info {
                position: relative;
                z-index: 1;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: flex-start;
                min-width: 0;
                overflow: visible;
                padding: 2px 0;
                pointer-events: auto;
            }
            .hud-chapter {
                font-size: ${DEFAULT_TITLE_SIZE}px;
                font-weight: 700;
                line-height: 1.4;
                color: var(--hud-title);
                max-width: none;
                white-space: normal;
                overflow: visible;
                overflow-wrap: anywhere;
                letter-spacing: .2px;
                text-shadow: 0 1px 1px rgba(0, 0, 0, .85);
                text-decoration: none;
                cursor: pointer;
                transition: color .15s ease, text-decoration-color .15s ease;
            }
            .hud-chapter:hover {
                color: #fff;
                text-decoration: underline;
                text-decoration-color: var(--hud-focus);
                text-underline-offset: 3px;
            }
            .hud-chapter:focus-visible {
                outline: 1px solid var(--hud-focus);
                outline-offset: 2px;
            }
            .hud-time {
                font-size: ${DEFAULT_TIME_SIZE}px;
                font-weight: 500;
                line-height: 1.2;
                color: var(--hud-secondary);
                letter-spacing: .75px;
                margin-top: 2px;
                font-variant-numeric: tabular-nums;
                text-shadow: 0 1px 1px rgba(0, 0, 0, .9);
            }
            .hud-control-button {
                min-width: 20px;
                height: 18px;
                padding: 0;
                border: 1px solid var(--hud-border);
                border-radius: 0;
                background: var(--hud-surface-raised);
                color: var(--hud-primary);
                font: 500 11px/16px var(--hud-font);
                cursor: pointer;
                box-shadow: none;
                pointer-events: auto;
                transition: color .15s ease, background-color .15s ease, border-color .15s ease, transform .15s ease;
            }
            .hud-control-button:hover {
                color: #fff;
                border-color: var(--hud-secondary);
                background: var(--hud-border);
            }
            .hud-control-button:active {
                color: #1a202c;
                background: var(--hud-text);
                transform: translateY(1px);
            }
            .hud-control-button:focus-visible,
            .status-light:focus-visible {
                outline: 1px solid var(--hud-focus);
                outline-offset: 2px;
                box-shadow: 0 0 0 1px var(--hud-focus);
            }
            .hud-control-button:disabled {
                opacity: .4;
                cursor: not-allowed;
            }
            .hud-side-controls {
                position: absolute;
                top: 4px;
                right: 4px;
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: 3px;
                padding-left: 4px;
                border-left: 1px solid rgba(74, 85, 104, .72);
                z-index: 2;
                pointer-events: auto;
            }
            .hud-side-controls .hud-control-button {
                width: 26px;
                min-width: 26px;
                height: 18px;
                font-size: 10px;
                line-height: 15px;
            }
            .hud-close-button {
                color: var(--hud-secondary);
                font-size: 14px;
            }
            .hud-close-button:hover {
                color: #fff;
                border-color: var(--hud-error);
                background: rgba(245, 101, 101, .22);
            }
            .hud-text-size-button {
                font-size: 9px;
                letter-spacing: -.4px;
            }
            .status-light {
                width: 9px;
                height: 9px;
                border: 1px solid rgba(247, 250, 252, .18);
                border-radius: 50%;
                display: inline-block;
                flex-shrink: 0;
                background: var(--hud-muted);
                transition: background-color .2s ease, opacity .2s ease;
                box-shadow: inset 0 0 0 1px rgba(15, 23, 42, .42);
                margin: 0;
                cursor: inherit;
            }
            .status-light.idle { background: var(--hud-muted); }
            .status-light.searching {
                background: var(--hud-warning);
                animation: blink-status .8s infinite alternate;
            }
            .status-light.success { background: var(--hud-success); }
            .status-light.error { background: var(--hud-error); }
            @keyframes blink-status {
                0% { opacity: .35; }
                100% { opacity: 1; }
            }
            .hud-source-actions {
                display: flex;
                align-items: center;
                flex-wrap: nowrap;
                gap: 3px;
                width: max-content;
                max-width: 100%;
                margin-top: 6px;
                padding-top: 5px;
                border-top: 1px solid rgba(74, 85, 104, .62);
            }
            .hud-source-actions .hud-control-button {
                width: auto;
                min-width: 0;
                height: 22px;
                padding: 0 7px;
                color: var(--hud-secondary);
                font-size: 9px;
                line-height: 19px;
                letter-spacing: .45px;
            }
            .hud-source-actions .hud-control-button:hover,
            .hud-source-actions .hud-control-button.active {
                color: var(--hud-title);
                border-color: var(--hud-focus);
                background: var(--hud-user-accent-soft, rgba(99, 179, 237, .13));
            }
            .hud-source-selector {
                display: inline-flex;
                align-items: stretch;
                position: relative;
            }
            .hud-source-caption {
                display: inline-flex;
                align-items: center;
                height: 20px;
                padding: 0 5px;
                border: 1px solid var(--hud-border);
                color: var(--hud-muted);
                background: rgba(15, 23, 42, .56);
                font-size: 8px;
                font-weight: 600;
                line-height: 20px;
                letter-spacing: .7px;
            }
            .hud-source-selector .hud-source-option {
                min-width: 28px;
                margin-left: -1px;
                padding: 0 6px;
            }
            .hud-source-selector .hud-source-option.active {
                position: relative;
                z-index: 1;
                color: #1a202c;
                border-color: var(--hud-primary);
                background: var(--hud-primary);
            }
            .hud-source-selector .hud-tracklist-button {
                min-width: 28px;
                margin-left: -1px;
                padding: 0 6px;
                color: var(--hud-secondary);
            }
            .hud-source-selector .hud-tracklist-button[aria-expanded="true"] {
                position: relative;
                z-index: 1;
                color: var(--hud-title);
                border-color: var(--hud-focus);
                background: var(--hud-user-accent-soft, rgba(99, 179, 237, .13));
            }
            .hud-status-button {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                min-width: 58px;
                margin-left: -1px;
            }
            .hud-status-button.has-error {
                border-color: rgba(245, 101, 101, .72);
            }
            .hud-status-label {
                line-height: 1;
            }
            .hud-1001-chevron {
                color: var(--hud-muted);
                font-size: 8px;
                transition: transform .15s ease;
            }
            .hud-status-button[aria-expanded="true"] .hud-1001-chevron {
                transform: rotate(180deg);
            }
            .hud-1001-menu {
                position: absolute;
                top: calc(100% + 4px);
                right: 0;
                z-index: 5;
                display: none;
                grid-template-columns: 1fr;
                gap: 3px;
                width: 132px;
                padding: 5px;
                border: 1px solid var(--hud-border);
                background: rgba(17, 24, 39, .97);
                box-shadow: var(--hud-shadow), inset 2px 0 0 var(--hud-focus);
            }
            .hud-1001-menu.expanded { display: grid; }
            .hud-1001-menu .hud-control-button {
                justify-content: flex-start;
                width: 100%;
                margin: 0;
                text-align: left;
            }
            .hud-transport-controls {
                display: inline-flex;
                align-items: center;
                flex: 0 0 auto;
                gap: 3px;
                margin-left: 6px;
                padding-left: 7px;
                border-left: 1px solid rgba(113, 128, 150, .72);
            }
            .hud-transport-controls .hud-control-button {
                flex: 0 0 auto;
                width: 58px;
                min-width: 58px;
                height: 22px;
                color: var(--hud-secondary);
                font-size: 9px;
                letter-spacing: .45px;
            }
            .resize-handle {
                position: absolute;
                right: 0;
                bottom: 0;
                z-index: 8;
                width: 22px;
                height: 22px;
                padding: 0;
                border: 0;
                cursor: nwse-resize;
                touch-action: none;
                background:
                    linear-gradient(135deg, transparent 0 54%, var(--hud-border) 55% 61%, transparent 62% 70%, var(--hud-focus) 71% 78%, transparent 79%);
                opacity: .82;
                pointer-events: auto;
            }
            .resize-handle:hover,
            .resize-handle:focus-visible {
                opacity: 1;
                filter: drop-shadow(0 0 3px var(--hud-focus));
                outline: 1px solid var(--hud-focus);
                outline-offset: -3px;
            }
            .hud-resize-handle {
                right: 4px;
                bottom: 4px;
                z-index: 12;
                width: 26px;
                height: 26px;
                border-top: 1px solid rgba(74, 85, 104, .72);
                border-left: 1px solid rgba(74, 85, 104, .72);
                background-color: rgba(15, 23, 42, .34);
                cursor: ew-resize;
            }

            .yt-tracklist-panel {
                box-sizing: border-box;
                position: absolute;
                z-index: 61;
                background:
                    linear-gradient(180deg, rgba(45, 55, 72, .24), transparent 32%),
                    rgba(26, 32, 44, .88);
                backdrop-filter: blur(8px) saturate(.86);
                -webkit-backdrop-filter: blur(8px) saturate(.86);
                border: 1px solid var(--hud-border);
                border-radius: 2px;
                width: 280px;
                height: 260px;
                min-width: 220px;
                min-height: 120px;
                max-width: calc(100% - 20px);
                max-height: calc(100% - 20px);
                overflow: hidden;
                font-family: var(--hud-font);
                color: var(--hud-text);
                font-size: 11px;
                line-height: 1.5;
                box-shadow: var(--hud-shadow), inset 3px 0 0 rgba(99, 179, 237, .5);
                cursor: grab;
                user-select: none;
                -webkit-user-select: none;
                touch-action: none;
                display: none;
                pointer-events: auto;
                transition: opacity .2s ease, transform .2s ease;
            }
            .yt-tracklist-panel.dragging { cursor: grabbing; }
            .yt-tracklist-panel.resizing { cursor: nwse-resize; }
            .tracklist-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                height: 28px;
                padding: 0 5px 0 9px;
                border-bottom: 1px solid var(--hud-border);
                color: var(--hud-title);
                background: rgba(15, 23, 42, .66);
                font-size: 9px;
                font-weight: 600;
                letter-spacing: .8px;
                text-transform: uppercase;
            }
            .tracklist-heading {
                display: inline-flex;
                align-items: center;
                min-width: 0;
                gap: 7px;
            }
            .tracklist-source-link {
                display: inline-flex;
                align-items: center;
                height: 18px;
                padding: 0 5px;
                border-left: 1px solid var(--hud-border);
                color: var(--hud-focus);
                font-size: 8px;
                letter-spacing: .55px;
                text-decoration: none;
                cursor: pointer;
            }
            .tracklist-source-link:hover {
                color: #fff;
                text-decoration: underline;
                text-underline-offset: 2px;
            }
            .tracklist-source-link:focus-visible {
                outline: 1px solid var(--hud-focus);
                outline-offset: 1px;
            }
            .tracklist-source-link.is-unavailable {
                color: var(--hud-muted);
                cursor: default;
                text-decoration: none;
            }
            .tracklist-control-button {
                width: 18px;
                min-width: 18px;
                height: 18px;
            }
            .tracklist-list {
                box-sizing: border-box;
                height: calc(100% - 28px);
                padding: 6px 8px 12px;
                overflow: auto;
                cursor: default;
            }
            .tracklist-list::-webkit-scrollbar { width: 4px; }
            .tracklist-list::-webkit-scrollbar-track { background: rgba(15, 23, 42, .45); }
            .tracklist-list::-webkit-scrollbar-thumb { background: var(--hud-border); }
            .tracklist-item {
                padding: 4px 5px;
                border-bottom: 1px solid rgba(74, 85, 104, .68);
                cursor: pointer;
                white-space: nowrap;
                display: flex;
                align-items: baseline;
                transition: color .15s ease, background-color .15s ease;
            }
            .tracklist-item.active {
                background: rgba(99, 179, 237, .14);
                color: var(--hud-title);
                box-shadow: inset 2px 0 0 var(--hud-focus);
                font-weight: 600;
            }
            .tracklist-item:hover { background: rgba(160, 174, 192, .1); }
            .tracklist-time {
                color: var(--hud-secondary);
                margin-right: 8px;
                flex-shrink: 0;
                font-variant-numeric: tabular-nums;
            }
            .tracklist-title {
                overflow: hidden;
                text-overflow: ellipsis;
            }
            @media (max-width: 640px) {
                #yt-cd-hud {
                    top: 10px;
                    left: 10px;
                    gap: 10px;
                    padding: 0 40px 0 0;
                }
                .yt-tracklist-panel { max-width: calc(100% - 20px); }
            }
            @media (prefers-reduced-motion: reduce) {
                #yt-cd-hud,
                .yt-tracklist-panel,
                .hud-control-button {
                    transition: none;
                }
                .cd-art,
                .status-light.searching {
                    animation: none;
                }
                .cd-disc:before { transition: none; }
            }
        `;
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    function updateHud() {
        const video = currentVideo;
        const timeEl = document.getElementById('hud-time');
        const chapterEl = document.getElementById('hud-chapter');
        if (!video || !timeEl || !chapterEl) return;
        timeEl.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
        const officialChapter = document.querySelector('.ytp-chapter-title-content');
        const chapterText = officialChapter ? trim(officialChapter.textContent) : '';
        const displayedTrack = chooseHudTitle(
            currentSource,
            getCurrentTrack(video.currentTime),
            chapterText
        );
        chapterEl.textContent = displayedTrack;
        chapterEl.href = getGoogleTrackSearchUrl(displayedTrack);
        chapterEl.title = `使用 Google 搜尋：${displayedTrack}`;
        chapterEl.setAttribute('aria-label', `使用 Google 搜尋曲目：${displayedTrack}`);
        updateTracklistHighlight(video.currentTime);
        syncHudContentBounds();
    }

    function updatePlayingState() {
        const art = document.getElementById('cd-art');
        if (!art || !currentVideo) return;
        art.classList.toggle('playing', !currentVideo.paused);
    }

    function playVideo(video) {
        const playResult = video.play();
        if (playResult && typeof playResult.catch === 'function') {
            playResult.catch(error => {
                console.warn('[CD HUD] 無法恢復影片播放。', error);
            });
        }
    }

    function bindDiscReflection(wrapper) {
        if (!wrapper || wrapper._ytCdReflectionBound) return;
        wrapper._ytCdReflectionBound = true;

        const hideReflection = () => {
            wrapper.style.setProperty('--cd-reflection-opacity', '0');
        };
        const updateReflection = event => {
            if (wrapper.classList.contains('scrubbing')) {
                hideReflection();
                return;
            }
            const rect = wrapper.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
            const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
            const angle = Math.atan2(y - 0.5, x - 0.5) * 180 / Math.PI + 90;
            wrapper.style.setProperty('--cd-reflection-x', `${(x * 100).toFixed(1)}%`);
            wrapper.style.setProperty('--cd-reflection-y', `${(y * 100).toFixed(1)}%`);
            wrapper.style.setProperty('--cd-reflection-angle', `${angle.toFixed(1)}deg`);
            wrapper.style.setProperty('--cd-reflection-opacity', '.92');
        };

        wrapper.addEventListener('pointerenter', updateReflection, true);
        wrapper.addEventListener('pointermove', updateReflection, true);
        wrapper.addEventListener('pointerleave', hideReflection, true);
        wrapper.addEventListener('pointerdown', hideReflection, true);
    }

    function bindDiscScrubbing(wrapper) {
        if (!wrapper || wrapper._ytCdScrubBound) return;
        wrapper._ytCdScrubBound = true;
        wrapper.title = '按住唱片：順時針快轉，逆時針循環短取樣；放開後繼續播放';

        let scrubState = null;
        let sampleFrame = null;

        const stopSampleLoop = () => {
            if (sampleFrame !== null) {
                cancelAnimationFrame(sampleFrame);
                sampleFrame = null;
            }
        };

        const getMaximumTime = video => (
            Number.isFinite(video.duration) && video.duration > 0
                ? Math.max(0, video.duration - 0.01)
                : Infinity
        );

        const setVideoTime = (video, time) => {
            const maximumTime = getMaximumTime(video);
            video.currentTime = clamp(time, 0, maximumTime);
        };

        const updateSampleWindow = () => {
            if (!scrubState) return;
            const maximumTime = getMaximumTime(scrubState.video);
            let sampleStart = clamp(scrubState.position, 0, maximumTime);
            if (Number.isFinite(maximumTime) && sampleStart + DISC_SAMPLE_SECONDS > maximumTime) {
                sampleStart = Math.max(0, maximumTime - DISC_SAMPLE_SECONDS);
            }
            scrubState.sampleStart = sampleStart;
            scrubState.sampleEnd = Number.isFinite(maximumTime)
                ? Math.min(maximumTime, sampleStart + DISC_SAMPLE_SECONDS)
                : sampleStart + DISC_SAMPLE_SECONDS;
            setVideoTime(scrubState.video, sampleStart);
        };

        const runSampleLoop = () => {
            sampleFrame = null;
            if (!scrubState || scrubState.direction !== 'reverse') return;
            const { video, sampleStart, sampleEnd } = scrubState;
            if (video.currentTime >= sampleEnd || video.currentTime < sampleStart - 0.02) {
                setVideoTime(video, sampleStart);
            }
            sampleFrame = requestAnimationFrame(runSampleLoop);
        };

        const startSampleLoop = () => {
            if (!scrubState) return;
            updateSampleWindow();
            playVideo(scrubState.video);
            if (sampleFrame === null) sampleFrame = requestAnimationFrame(runSampleLoop);
        };

        const finishScrubbing = (resumePlayback = true) => {
            if (!scrubState) return;
            const completedState = scrubState;
            scrubState = null;
            stopSampleLoop();
            wrapper.classList.remove('scrubbing', 'scrub-forward', 'scrub-reverse');
            wrapper.style.removeProperty('--cd-scrub-angle');
            if (typeof wrapper.hasPointerCapture === 'function' &&
                wrapper.hasPointerCapture(completedState.pointerId)) {
                wrapper.releasePointerCapture(completedState.pointerId);
            }
            if (resumePlayback && completedState.video.isConnected) {
                playVideo(completedState.video);
            }
            updatePlayingState();
        };

        const pointerAngle = event => {
            const rect = wrapper.getBoundingClientRect();
            return Math.atan2(
                event.clientY - (rect.top + rect.height / 2),
                event.clientX - (rect.left + rect.width / 2)
            );
        };

        wrapper.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.isPrimary === false || !currentVideo) return;
            event.preventDefault();
            event.stopPropagation();
            if (scrubState) finishScrubbing(false);
            const video = currentVideo;
            video.pause();
            scrubState = {
                pointerId: event.pointerId,
                video,
                lastAngle: pointerAngle(event),
                accumulatedDegrees: 0,
                position: video.currentTime,
                direction: 'hold',
                sampleStart: video.currentTime,
                sampleEnd: video.currentTime + DISC_SAMPLE_SECONDS,
            };
            wrapper.classList.add('scrubbing');
            if (typeof wrapper.setPointerCapture === 'function') {
                wrapper.setPointerCapture(event.pointerId);
            }
            updatePlayingState();
        }, true);

        wrapper.addEventListener('pointermove', event => {
            if (!scrubState || event.pointerId !== scrubState.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            const nextAngle = pointerAngle(event);
            const angleDelta = normalizeAngleDelta(nextAngle - scrubState.lastAngle);
            scrubState.lastAngle = nextAngle;
            if (Math.abs(angleDelta) < 0.002) return;

            scrubState.accumulatedDegrees += angleDelta * 180 / Math.PI;
            scrubState.position = clamp(
                scrubState.position + angleDeltaToSeconds(angleDelta),
                0,
                getMaximumTime(scrubState.video)
            );
            wrapper.style.setProperty('--cd-scrub-angle', `${scrubState.accumulatedDegrees}deg`);

            if (angleDelta > 0) {
                scrubState.direction = 'forward';
                stopSampleLoop();
                scrubState.video.pause();
                setVideoTime(scrubState.video, scrubState.position);
                wrapper.classList.add('scrub-forward');
                wrapper.classList.remove('scrub-reverse');
            } else {
                scrubState.direction = 'reverse';
                wrapper.classList.add('scrub-reverse');
                wrapper.classList.remove('scrub-forward');
                startSampleLoop();
            }
            updateHud();
        }, true);

        const finishFromPointer = event => {
            if (!scrubState || event.pointerId !== scrubState.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            finishScrubbing(true);
        };

        wrapper.addEventListener('pointerup', finishFromPointer, true);
        wrapper.addEventListener('pointercancel', finishFromPointer, true);
        wrapper.addEventListener('lostpointercapture', event => {
            if (scrubState && event.pointerId === scrubState.pointerId) finishScrubbing(true);
        }, true);

        stopDiscScrubbing = finishScrubbing;
    }

    function bindVideo(video) {
        if (!video || video === currentVideo) return;
        if (stopDiscScrubbing) stopDiscScrubbing(false);
        if (currentVideo) {
            currentVideo.removeEventListener('timeupdate', updateHud);
            currentVideo.removeEventListener('durationchange', updateHud);
            currentVideo.removeEventListener('play', updatePlayingState);
            currentVideo.removeEventListener('pause', updatePlayingState);
        }
        currentVideo = video;
        video.addEventListener('timeupdate', updateHud, false);
        video.addEventListener('durationchange', updateHud, false);
        video.addEventListener('play', updatePlayingState, false);
        video.addEventListener('pause', updatePlayingState, false);
        updateHud();
        updatePlayingState();
        updateTransportButtons();
    }

    function getElementOuterSize(element) {
        if (!element || element.offsetParent === null) return { width: 0, height: 0 };
        const style = getComputedStyle(element);
        return {
            width: element.offsetWidth + (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0),
            height: element.offsetHeight + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0),
        };
    }

    function getContentHeight(element) {
        if (!element) return 0;
        const children = Array.from(element.children).filter(child => child.offsetParent !== null);
        if (!children.length) return element.offsetHeight;
        const top = Math.min(...children.map(child => child.offsetTop));
        const bottom = Math.max(...children.map(child => child.offsetTop + child.offsetHeight));
        return Math.max(element.offsetHeight, bottom - top);
    }

    function getTextContentWidth(element) {
        if (!element || !element.firstChild) return 0;
        const range = document.createRange();
        range.selectNodeContents(element);
        const width = range.getBoundingClientRect().width;
        if (typeof range.detach === 'function') range.detach();
        return Math.ceil(width) + 2;
    }

    function syncHudContentBounds(force = false) {
        const hud = document.getElementById('yt-cd-hud');
        const player = hud && hud.parentElement;
        const chapter = document.getElementById('hud-chapter');
        const time = document.getElementById('hud-time');
        const disc = hud && hud.querySelector('.cd-disc-wrapper');
        const info = hud && hud.querySelector('.hud-info');
        const sourceActions = hud && hud.querySelector('.hud-source-actions');
        const transport = hud && hud.querySelector('.hud-transport-controls');
        const sideControls = hud && hud.querySelector('.hud-side-controls');
        if (!hud || !player || !chapter || !time || !disc || !info || !sideControls) {
            return { width: 300, height: 118 };
        }

        const signature = [
            chapter.textContent,
            chapter.style.fontSize,
            time.style.fontSize,
            time.textContent.length,
            runtimeSettings.discScale,
            runtimeSettings.fontFamily,
            runtimeSettings.showDisc,
            runtimeSettings.showTransport,
            runtimeSettings.enable1001,
            hudPreferredWidth,
            player.clientWidth,
            player.clientHeight,
        ].join('|');
        if (!force && hud._ytCdContentSignature === signature) {
            const lockedWidth = parseFloat(hud.style.width) || hud.offsetWidth || 1;
            const lockedHeight = parseFloat(hud.style.minHeight) || 118;
            hud.style.width = `${lockedWidth}px`;
            hud.style.height = `${lockedHeight}px`;
            return {
                width: lockedWidth,
                height: lockedHeight,
            };
        }

        const hudStyle = getComputedStyle(hud);
        const sideSize = getElementOuterSize(sideControls);
        const paddingLeft = parseFloat(hudStyle.paddingLeft) || 0;
        const paddingRight = parseFloat(hudStyle.paddingRight) || 0;
        const paddingTop = parseFloat(hudStyle.paddingTop) || 0;
        const paddingBottom = parseFloat(hudStyle.paddingBottom) || 0;
        const gap = parseFloat(hudStyle.columnGap || hudStyle.gap) || 0;
        let viewportMaximumWidth = Math.max(1, player.clientWidth - hud.offsetLeft);
        const maximumHeight = Math.max(118, player.clientHeight - hud.offsetTop);
        const rightRailReserve = Math.max(paddingRight, sideSize.width + 8);
        const controlWidth = Math.max(
            time.scrollWidth,
            sourceActions ? Math.max(sourceActions.scrollWidth, sourceActions.offsetWidth) : 0,
            transport ? Math.max(transport.scrollWidth, transport.offsetWidth) : 0
        );
        const controlHeight = Math.max(
            time.offsetHeight + (sourceActions ? sourceActions.offsetHeight + 13 : 0),
            sideSize.height
        );
        const balancedDiscSize = getContentBalancedDiscSize(
            window.innerWidth,
            window.innerHeight,
            hudTitleFontSize,
            controlHeight,
            runtimeSettings.discScale
        );
        hud.style.setProperty('--hud-balanced-disc-size', `${balancedDiscSize}px`);
        disc.style.width = `${balancedDiscSize}px`;
        disc.style.height = `${balancedDiscSize}px`;
        const discSize = getElementOuterSize(disc);
        const fixedWidth = paddingLeft + discSize.width + gap + rightRailReserve + 2;
        chapter.style.width = 'auto';
        chapter.style.maxWidth = 'none';
        const previousWhiteSpace = chapter.style.whiteSpace;
        chapter.style.whiteSpace = 'nowrap';
        const fullChapterWidth = Math.max(1, getTextContentWidth(chapter));
        chapter.style.whiteSpace = previousWhiteSpace;
        const minimum = calculateHudMinimumSize({
            paddingLeft,
            paddingRight,
            paddingTop,
            paddingBottom,
            discWidth: discSize.width,
            discHeight: discSize.height,
            gap,
            infoWidth: controlWidth,
            infoHeight: controlHeight,
            sideWidth: sideSize.width,
            sideHeight: sideSize.height,
        });
        const natural = calculateHudMinimumSize({
            paddingLeft,
            paddingRight,
            paddingTop,
            paddingBottom,
            discWidth: discSize.width,
            discHeight: discSize.height,
            gap,
            infoWidth: Math.max(fullChapterWidth, controlWidth),
            infoHeight: controlHeight,
            sideWidth: sideSize.width,
            sideHeight: sideSize.height,
        });
        if (minimum.width <= player.clientWidth && hud.offsetLeft + minimum.width > player.clientWidth) {
            const correctedLeft = Math.max(0, player.clientWidth - minimum.width);
            hud.style.left = `${Math.round(correctedLeft)}px`;
            viewportMaximumWidth = Math.max(1, player.clientWidth - correctedLeft);
        }
        const minimumWidth = Math.min(minimum.width, viewportMaximumWidth);
        const contentMaximumWidth = Math.max(
            minimumWidth,
            Math.min(natural.width, viewportMaximumWidth)
        );
        const targetWidth = resolveHudWidth(
            natural.width,
            hudPreferredWidth,
            minimumWidth,
            contentMaximumWidth
        );
        const availableInfoWidth = Math.max(1, targetWidth - fixedWidth);
        const requiredChapterWidth = Math.min(fullChapterWidth, availableInfoWidth);
        chapter.style.width = `${requiredChapterWidth}px`;
        chapter.style.maxWidth = `${requiredChapterWidth}px`;

        const infoHeight = getContentHeight(info);
        const resolvedHeight = calculateHudMinimumSize({
            paddingLeft,
            paddingRight,
            paddingTop,
            paddingBottom,
            discWidth: discSize.width,
            discHeight: discSize.height,
            gap,
            infoWidth: Math.max(requiredChapterWidth, controlWidth),
            infoHeight,
            sideWidth: sideSize.width,
            sideHeight: sideSize.height,
        });
        const targetHeight = Math.min(resolvedHeight.height, maximumHeight);
        hud.style.minWidth = `${minimumWidth}px`;
        hud.style.maxWidth = `${contentMaximumWidth}px`;
        hud.style.minHeight = `${targetHeight}px`;
        hud.style.maxHeight = `${targetHeight}px`;
        hud.style.width = `${targetWidth}px`;
        hud.style.height = `${targetHeight}px`;
        hud._ytCdMinimumWidth = minimumWidth;
        hud._ytCdMaximumWidth = contentMaximumWidth;
        hud._ytCdContentSignature = signature;
        return { width: targetWidth, height: targetHeight, minimumWidth, maximumWidth: contentMaximumWidth };
    }

    function applySizing() {
        const titleEl = document.getElementById('hud-chapter');
        const timeEl = document.getElementById('hud-time');
        if (titleEl) titleEl.style.fontSize = hudTitleFontSize + 'px';
        if (timeEl) timeEl.style.fontSize = hudTimeFontSize + 'px';
        syncHudContentBounds(true);
    }

    function adjustHudTextSize(delta) {
        const direction = Math.sign(Number(delta) || 0);
        if (!direction) return;
        hudTitleFontSize = clamp(hudTitleFontSize + direction, 9, 28);
        hudTimeFontSize = clamp(hudTimeFontSize + direction, 10, 29);
        applySizing();
    }

    function isControlTarget(target, hud) {
        if (!target || typeof target.closest !== 'function') return false;
        const control = target.closest('.hud-control-button, .status-light, .hud-chapter, .cd-disc-wrapper, .resize-handle');
        return Boolean(control && hud.contains(control));
    }

    function bindHudDragging(hud, player) {
        if (!hud || !player || hud._ytCdDragBound) return;
        hud._ytCdDragBound = true;
        let dragState = null;

        const stopDragging = () => {
            if (!dragState) return;
            dragState = null;
            hud.classList.remove('yt-cd-hud-dragging');
            document.removeEventListener('mousemove', moveHudMouse, true);
            document.removeEventListener('mouseup', stopDragging, true);
            document.removeEventListener('touchmove', moveHudTouch, true);
            document.removeEventListener('touchend', stopDraggingTouch, true);
        };

        const moveHud = (clientX, clientY) => {
            if (!dragState) return;
            const rect = player.getBoundingClientRect();
            let left = dragState.startLeft + clientX - dragState.startX;
            let top = dragState.startTop + clientY - dragState.startY;
            const maxLeft = Math.max(0, rect.width - hud.offsetWidth);
            const maxTop = Math.max(0, rect.height - hud.offsetHeight);
            left = clamp(left, 0, maxLeft);
            top = clamp(top, 0, maxTop);
            hud.style.left = Math.round(left) + 'px';
            hud.style.top = Math.round(top) + 'px';
        };

        const moveHudMouse = (event) => {
            if (!dragState) return;
            event.preventDefault();
            event.stopPropagation();
            moveHud(event.clientX, event.clientY);
        };

        const moveHudTouch = (event) => {
            if (!dragState || !event.touches.length) return;
            event.preventDefault();
            event.stopPropagation();
            const touch = event.touches[0];
            moveHud(touch.clientX, touch.clientY);
        };

        const stopDraggingTouch = (event) => {
            stopDragging();
        };

        const startDrag = (clientX, clientY) => {
            dragState = {
                startX: clientX,
                startY: clientY,
                startLeft: hud.offsetLeft,
                startTop: hud.offsetTop
            };
            hud.classList.add('yt-cd-hud-dragging');
            document.addEventListener('mousemove', moveHudMouse, true);
            document.addEventListener('mouseup', stopDragging, true);
            document.addEventListener('touchmove', moveHudTouch, { capture: true, passive: false });
            document.addEventListener('touchend', stopDraggingTouch, true);
        };

        hud.addEventListener('mousedown', (event) => {
            if (event.button !== 0 || isControlTarget(event.target, hud)) return;
            event.preventDefault();
            event.stopPropagation();
            startDrag(event.clientX, event.clientY);
        }, true);

        hud.addEventListener('touchstart', (event) => {
            if (isControlTarget(event.target, hud)) return;
            if (event.touches.length === 1) {
                event.preventDefault();
                event.stopPropagation();
                const touch = event.touches[0];
                startDrag(touch.clientX, touch.clientY);
            }
        }, true);

        hud.addEventListener('click', (event) => {
            if (isControlTarget(event.target, hud)) return;
            event.preventDefault();
            event.stopPropagation();
        }, true);
    }

    function bindElementResizing(element, container, minimumSize, scaleProvider = () => 1) {
        if (!element || !container || element._ytCdResizeBound) return;
        const handle = Array.from(element.children).find(child => child.classList.contains('resize-handle'));
        if (!handle) return;
        element._ytCdResizeBound = true;
        let resizeState = null;

        const finishResize = event => {
            if (!resizeState || (event && event.pointerId !== resizeState.pointerId)) return;
            resizeState = null;
            element.classList.remove('resizing');
        };

        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.isPrimary === false) return;
            event.preventDefault();
            event.stopPropagation();
            resizeState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                startWidth: element.offsetWidth,
                startHeight: element.offsetHeight,
            };
            element.classList.add('resizing');
            if (typeof handle.setPointerCapture === 'function') handle.setPointerCapture(event.pointerId);
        }, true);

        handle.addEventListener('pointermove', event => {
            if (!resizeState || event.pointerId !== resizeState.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            const scale = Math.max(0.1, Number(scaleProvider()) || 1);
            const resolvedMinimum = typeof minimumSize === 'function' ? minimumSize() : minimumSize;
            const minimumWidth = Math.max(1, Number(resolvedMinimum && resolvedMinimum.width) || 1);
            const minimumHeight = Math.max(1, Number(resolvedMinimum && resolvedMinimum.height) || 1);
            const maxWidth = Math.max(minimumWidth, (container.clientWidth - element.offsetLeft) / scale);
            const maxHeight = Math.max(minimumHeight, (container.clientHeight - element.offsetTop) / scale);
            const width = clamp(resizeState.startWidth + (event.clientX - resizeState.startX) / scale, minimumWidth, maxWidth);
            const height = clamp(resizeState.startHeight + (event.clientY - resizeState.startY) / scale, minimumHeight, maxHeight);
            element.style.width = `${Math.round(width)}px`;
            element.style.height = `${Math.round(height)}px`;
        }, true);

        handle.addEventListener('pointerup', finishResize, true);
        handle.addEventListener('pointercancel', finishResize, true);
        handle.addEventListener('lostpointercapture', finishResize, true);
    }

    function bindHudWidthResizing(hud, container) {
        if (!hud || !container || hud._ytCdWidthResizeBound) return;
        const handle = Array.from(hud.children).find(child => child.classList.contains('hud-resize-handle'));
        if (!handle) return;
        hud._ytCdWidthResizeBound = true;
        let resizeState = null;

        const finishResize = event => {
            if (!resizeState || (event && event.pointerId !== resizeState.pointerId)) return;
            resizeState = null;
            hud.classList.remove('resizing');
        };

        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.isPrimary === false) return;
            event.preventDefault();
            event.stopPropagation();
            syncHudContentBounds(true);
            resizeState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startWidth: Math.max(1, hud.offsetWidth),
            };
            hud.classList.add('resizing');
            if (typeof handle.setPointerCapture === 'function') handle.setPointerCapture(event.pointerId);
        }, true);

        handle.addEventListener('pointermove', event => {
            if (!resizeState || event.pointerId !== resizeState.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            const minimumWidth = Math.max(1, Number(hud._ytCdMinimumWidth) || 1);
            const maximumWidth = Math.max(
                minimumWidth,
                Math.min(Number(hud._ytCdMaximumWidth) || Infinity, container.clientWidth - hud.offsetLeft)
            );
            hudPreferredWidth = clamp(
                resizeState.startWidth + event.clientX - resizeState.startX,
                minimumWidth,
                maximumWidth
            );
            syncHudContentBounds(true);
        }, true);

        handle.addEventListener('pointerup', finishResize, true);
        handle.addEventListener('pointercancel', finishResize, true);
        handle.addEventListener('lostpointercapture', finishResize, true);
        handle.addEventListener('keydown', event => {
            if (!['ArrowRight', 'ArrowLeft', 'Home'].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Home') {
                hudPreferredWidth = null;
            } else {
                const minimumWidth = Math.max(1, Number(hud._ytCdMinimumWidth) || 1);
                const maximumWidth = Math.max(minimumWidth, Number(hud._ytCdMaximumWidth) || minimumWidth);
                hudPreferredWidth = clamp(
                    (Number(hudPreferredWidth) || hud.offsetWidth) + (event.key === 'ArrowRight' ? 20 : -20),
                    minimumWidth,
                    maximumWidth
                );
            }
            syncHudContentBounds(true);
        });
    }

    function bindTracklistDragging(element, container) {
        if (!element || !container || element._ytTracklistDragBound) return;
        element._ytTracklistDragBound = true;
        let dragState = null;

        const stopDragging = () => {
            if (!dragState) return;
            dragState = null;
            element.classList.remove('dragging');
            document.removeEventListener('mousemove', movePanelMouse, true);
            document.removeEventListener('mouseup', stopDragging, true);
            document.removeEventListener('touchmove', movePanelTouch, true);
            document.removeEventListener('touchend', stopDraggingTouch, true);
        };

        const movePanel = (clientX, clientY) => {
            if (!dragState) return;
            const rect = container.getBoundingClientRect();
            let left = dragState.startLeft + clientX - dragState.startX;
            let top = dragState.startTop + clientY - dragState.startY;
            const maxLeft = Math.max(0, rect.width - element.offsetWidth);
            const maxTop = Math.max(0, rect.height - element.offsetHeight);
            left = clamp(left, 0, maxLeft);
            top = clamp(top, 0, maxTop);
            element.style.left = Math.round(left) + 'px';
            element.style.top = Math.round(top) + 'px';
            element.style.right = 'auto';
        };

        const movePanelMouse = (event) => {
            if (!dragState) return;
            event.preventDefault();
            event.stopPropagation();
            movePanel(event.clientX, event.clientY);
        };

        const movePanelTouch = (event) => {
            if (!dragState || !event.touches.length) return;
            event.preventDefault();
            event.stopPropagation();
            const touch = event.touches[0];
            movePanel(touch.clientX, touch.clientY);
        };

        const stopDraggingTouch = (event) => {
            stopDragging();
        };

        const startDrag = (clientX, clientY) => {
            dragState = {
                startX: clientX,
                startY: clientY,
                startLeft: element.offsetLeft,
                startTop: element.offsetTop
            };
            element.classList.add('dragging');
            document.addEventListener('mousemove', movePanelMouse, true);
            document.addEventListener('mouseup', stopDragging, true);
            document.addEventListener('touchmove', movePanelTouch, { capture: true, passive: false });
            document.addEventListener('touchend', stopDraggingTouch, true);
        };

        element.addEventListener('mousedown', (event) => {
            if (!event.target.closest('.tracklist-header') || event.target.closest('.tracklist-header-action')) return;
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            startDrag(event.clientX, event.clientY);
        }, true);

        element.addEventListener('touchstart', (event) => {
            if (!event.target.closest('.tracklist-header') || event.target.closest('.tracklist-header-action')) return;
            if (event.touches.length === 1) {
                event.preventDefault();
                event.stopPropagation();
                const touch = event.touches[0];
                startDrag(touch.clientX, touch.clientY);
            }
        }, true);

        element.addEventListener('click', (event) => {
            if (!event.target.closest('.tracklist-item, .tracklist-header-action, .resize-handle')) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, true);
    }

    function createControlButton(symbol, title, action) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hud-control-button';
        btn.textContent = symbol;
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.addEventListener('mousedown', e => e.stopPropagation(), true);
        btn.addEventListener('touchstart', e => e.stopPropagation(), true);
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            action();
        }, true);
        return btn;
    }

    function set1001MenuExpanded(expanded) {
        if (!oneThousandMenu || !statusBtn) return;
        oneThousandMenu.classList.toggle('expanded', expanded);
        statusBtn.setAttribute('aria-expanded', String(expanded));
    }

    function updateStatusLight() {
        if (!statusLight) return;
        statusLight.className = 'status-light';
        if (searchState === 'idle') statusLight.classList.add('idle');
        else if (searchState === 'searching') statusLight.classList.add('searching');
        else if (searchState === 'success') statusLight.classList.add('success');
        else if (searchState === 'error') statusLight.classList.add('error');
        const titles = {
            idle: '尚未搜尋',
            searching: '搜尋中...',
            success: '已獲取曲目',
            error: '搜尋失敗'
        };
        const statusTitle = searchStateDetail || titles[searchState] || '';
        statusBtn = statusBtn || statusLight.closest('.hud-status-button');
        if (statusBtn) {
            statusBtn.title = statusTitle;
            statusBtn.setAttribute('aria-label', `${statusTitle}；展開曲目資料來源控制`);
            statusBtn.classList.toggle('has-error', searchState === 'error');
        }
    }

    function updateSourceButtons() {
        if (!youtubeSourceBtn || !tracklistSource1001Btn || !tracklistSourceMixesDbBtn || !tracklistSourceTrackIdBtn) return;
        const hasYouTube = tracksFromYouTube.length > 0;
        const has1001 = tracksFrom1001.length > 0;
        const hasMixesDb = tracksFromMixesDb.length > 0;
        const hasTrackId = tracksFromTrackId.length > 0;
        youtubeSourceBtn.disabled = !hasYouTube;
        tracklistSource1001Btn.disabled = !has1001;
        tracklistSourceMixesDbBtn.disabled = !hasMixesDb;
        tracklistSourceTrackIdBtn.disabled = !hasTrackId;
        tracklistSource1001Btn.style.display = runtimeSettings.enable1001 ? '' : 'none';
        tracklistSourceMixesDbBtn.style.display = runtimeSettings.enableMixesDb ? '' : 'none';
        tracklistSourceTrackIdBtn.style.display = runtimeSettings.enableTrackId ? '' : 'none';
        youtubeSourceBtn.classList.toggle('active', currentSource === 'youtube' && hasYouTube);
        tracklistSource1001Btn.classList.toggle('active', currentSource === '1001' && has1001);
        tracklistSourceMixesDbBtn.classList.toggle('active', currentSource === 'mixesdb' && hasMixesDb);
        tracklistSourceTrackIdBtn.classList.toggle('active', currentSource === 'trackid' && hasTrackId);
        if (statusBtn) statusBtn.classList.toggle('active', currentSource !== 'youtube' && currentSource !== 'none');
        youtubeSourceBtn.setAttribute('aria-pressed', String(currentSource === 'youtube' && hasYouTube));
        tracklistSource1001Btn.setAttribute('aria-pressed', String(currentSource === '1001' && has1001));
        tracklistSourceMixesDbBtn.setAttribute('aria-pressed', String(currentSource === 'mixesdb' && hasMixesDb));
        tracklistSourceTrackIdBtn.setAttribute('aria-pressed', String(currentSource === 'trackid' && hasTrackId));
        youtubeSourceBtn.title = hasYouTube ? '使用 YouTube 章節曲目' : '目前沒有 YouTube 章節曲目';
        tracklistSource1001Btn.title = has1001 ? '使用 1001Tracklists 曲目' : '目前沒有可用的 1001Tracklists 曲目';
        tracklistSourceMixesDbBtn.title = hasMixesDb ? '使用 MixesDB 曲目' : '目前沒有可用的 MixesDB 曲目';
        tracklistSourceTrackIdBtn.title = hasTrackId ? '使用 TrackId.net 曲目' : '目前沒有可用的 TrackId.net 曲目';
        if (mixesDbSearchBtn) mixesDbSearchBtn.style.display = runtimeSettings.enableMixesDb ? '' : 'none';
        if (trackIdSearchBtn) trackIdSearchBtn.style.display = runtimeSettings.enableTrackId ? '' : 'none';
        if (retryBtn) retryBtn.style.display = runtimeSettings.enable1001 ? '' : 'none';
    }

    function updateLinkButton() {
        if (!linkBtn || !mixesDbLinkBtn || !trackIdLinkBtn) return;
        if (tracklistUrl1001 && (tracksFrom1001.length > 0 || searchState === 'error')) {
            linkBtn.style.display = 'flex';
            linkBtn.title = tracksFrom1001.length > 0
                ? '在 1001Tracklists 查看原頁面'
                : '開啟 1001Tracklists 檢查或完成瀏覽器驗證';
        } else {
            linkBtn.style.display = 'none';
        }
        mixesDbLinkBtn.style.display = tracklistUrlMixesDb && tracksFromMixesDb.length ? 'flex' : 'none';
        trackIdLinkBtn.style.display = tracklistUrlTrackId && tracksFromTrackId.length ? 'flex' : 'none';
        if (tracklistPanel) updateTracklistSourceLink(tracklistPanel);
    }

    function updateTransportButtons() {
        const disabled = !currentVideo || !parsedTracks.length;
        if (previousTrackBtn) previousTrackBtn.disabled = disabled;
        if (nextTrackBtn) nextTrackBtn.disabled = disabled;
    }

    function jumpTrack(direction) {
        if (!currentVideo) return;
        const targetTime = getAdjacentTrackTime(parsedTracks, currentVideo.currentTime, direction);
        if (!Number.isFinite(targetTime)) return;
        currentVideo.currentTime = targetTime;
        if (currentVideo.paused) playVideo(currentVideo);
        updateHud();
    }

    function retrySearch(activateOnSuccess = false) {
        if (!activateOnSuccess) clear1001VerificationReturn();
        const title = getVideoTitle();
        const id = getVideoId();
        if (title && id) {
            console.log('[CD HUD] Manual retry triggered.');
            fetchTracklistFrom1001(title, id, true, true, activateOnSuccess);
        } else {
            console.warn('[CD HUD] Cannot retry: missing title or video ID.');
        }
    }

    function renderTracklist(container) {
        updateTracklistSourceLink(container);
        const list = container.querySelector('.tracklist-list') || container;
        list.replaceChildren();
        if (!parsedTracks.length) {
            const noTrack = document.createElement('div');
            noTrack.className = 'tracklist-item';
            noTrack.textContent = 'No tracklist found';
            list.appendChild(noTrack);
            return;
        }
        parsedTracks.forEach((track, index) => {
            const item = document.createElement('div');
            item.className = 'tracklist-item';
            item.setAttribute('data-index', index);
            const timeSpan = document.createElement('span');
            timeSpan.className = 'tracklist-time';
            timeSpan.textContent = formatTime(track.time);
            const titleSpan = document.createElement('span');
            titleSpan.className = 'tracklist-title';
            titleSpan.textContent = track.title;
            item.appendChild(timeSpan);
            item.appendChild(titleSpan);
            item.addEventListener('mousedown', e => e.stopPropagation(), true);
            item.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                if (currentVideo && track.time >= 0) {
                    currentVideo.currentTime = track.time;
                    if (currentVideo.paused) currentVideo.play();
                }
            }, true);
            list.appendChild(item);
        });
    }

    function updateTracklistSourceLink(container) {
        const sourceLink = container && container.querySelector('.tracklist-source-link');
        if (!sourceLink) return;
        const sourcePage = getTracklistSourcePage(currentSource, getVideoId(), {
            oneThousand: tracklistUrl1001,
            mixesDb: tracklistUrlMixesDb,
            trackId: tracklistUrlTrackId,
        });
        const action = getCandidateActionState(
            tracklistCandidates[currentSource],
            tracklistCandidateIndexes[currentSource]
        );
        sourceLink.textContent = `${sourcePage.label}${action.suffix}${sourcePage.url && action.willOpen ? ' ↗' : ''}`;
        sourceLink.classList.toggle('is-unavailable', !sourcePage.url);
        sourceLink.setAttribute('aria-label', sourcePage.url
            ? action.count > 1 && !action.willOpen
                ? `切換至 ${sourcePage.label} 候選 ${action.index + 2}，共 ${action.count} 個候選`
                : `開啟 ${sourcePage.label} 曲目來源頁面`
            : `${sourcePage.label} 尚無可用來源頁面`);
        if (sourcePage.url) {
            sourceLink.href = sourcePage.url;
            sourceLink.removeAttribute('aria-disabled');
        } else {
            sourceLink.removeAttribute('href');
            sourceLink.setAttribute('aria-disabled', 'true');
        }
    }

    function updateTracklistHighlight(currentTime) {
        if (!tracklistPanel || tracklistPanel.style.display === 'none') return;
        const items = tracklistPanel.querySelectorAll('.tracklist-item');
        if (!items.length || (items.length === 1 && items[0].textContent === 'No tracklist found')) return;
        let activeIndex = -1;
        for (let i = parsedTracks.length - 1; i >= 0; i--) {
            if (currentTime >= parsedTracks[i].time) {
                activeIndex = i;
                break;
            }
        }
        items.forEach((item, idx) => {
            item.classList.toggle('active', idx === activeIndex);
        });
    }

    function toggleTracklist() {
        tracklistVisible = !tracklistVisible;
        if (!tracklistPanel) return;
        tracklistPanel.style.display = tracklistVisible ? 'block' : 'none';
        if (tracklistBtn) {
            tracklistBtn.classList.toggle('active', tracklistVisible);
            tracklistBtn.setAttribute('aria-expanded', String(tracklistVisible));
        }
        if (tracklistVisible) {
            renderTracklist(tracklistPanel);
            if (currentVideo) updateTracklistHighlight(currentVideo.currentTime);
        }
    }

    function createTracklistPanel(player) {
        let panel = document.getElementById('yt-tracklist-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'yt-tracklist-panel';
            panel.className = 'yt-tracklist-panel';
            panel.style.top = '96px';
            panel.style.right = '20px';

            const header = document.createElement('div');
            header.className = 'tracklist-header';
            const heading = document.createElement('div');
            heading.className = 'tracklist-heading';
            const headerTitle = document.createElement('span');
            headerTitle.className = 'tracklist-heading-title';
            headerTitle.textContent = 'TRACKLIST';
            const sourceLink = document.createElement('a');
            sourceLink.className = 'tracklist-source-link tracklist-header-action';
            sourceLink.target = '_blank';
            sourceLink.rel = 'noopener noreferrer';
            sourceLink.addEventListener('mousedown', event => event.stopPropagation(), true);
            sourceLink.addEventListener('touchstart', event => event.stopPropagation(), true);
            sourceLink.addEventListener('click', event => {
                if (!cycleTracklistCandidate(currentSource)) return;
                event.preventDefault();
                event.stopPropagation();
            });
            heading.appendChild(headerTitle);
            heading.appendChild(sourceLink);
            const closeButton = createControlButton('×', '關閉曲目清單', () => {
                tracklistVisible = false;
                panel.style.display = 'none';
                if (tracklistBtn) {
                    tracklistBtn.classList.remove('active');
                    tracklistBtn.setAttribute('aria-expanded', 'false');
                }
            });
            closeButton.classList.add('tracklist-control-button', 'tracklist-header-action');
            header.appendChild(heading);
            header.appendChild(closeButton);

            const list = document.createElement('div');
            list.className = 'tracklist-list';
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle tracklist-resize-handle';
            resizeHandle.setAttribute('aria-hidden', 'true');
            panel.appendChild(header);
            panel.appendChild(list);
            panel.appendChild(resizeHandle);
            player.appendChild(panel);
            bindTracklistDragging(panel, player);
            bindElementResizing(panel, player, { width: 220, height: 120 });
        } else if (panel.parentNode !== player) {
            player.appendChild(panel);
        }
        panel.style.display = tracklistVisible ? 'block' : 'none';
        if (tracklistVisible) {
            renderTracklist(panel);
            if (currentVideo) updateTracklistHighlight(currentVideo.currentTime);
        }
        tracklistPanel = panel;
    }

    function createHud(player) {
        let hud = document.getElementById('yt-cd-hud');
        if (!hud) {
            hud = document.createElement('div');
            hud.id = 'yt-cd-hud';

            const panelSurface = document.createElement('div');
            panelSurface.className = 'hud-panel-surface';
            panelSurface.setAttribute('aria-hidden', 'true');

            const wrapper = document.createElement('div');
            wrapper.className = 'cd-disc-wrapper';
            const disc = document.createElement('div');
            disc.className = 'cd-disc';
            const art = document.createElement('div');
            art.className = 'cd-art';
            art.id = 'cd-art';
            disc.appendChild(art);
            wrapper.appendChild(disc);

            const info = document.createElement('div');
            info.className = 'hud-info';
            const chapter = document.createElement('a');
            chapter.className = 'hud-chapter';
            chapter.id = 'hud-chapter';
            chapter.textContent = 'Album Mode';
            chapter.href = getGoogleTrackSearchUrl(chapter.textContent);
            chapter.target = '_blank';
            chapter.rel = 'noopener noreferrer';
            chapter.title = '使用 Google 搜尋目前曲目';
            const time = document.createElement('div');
            time.className = 'hud-time';
            time.id = 'hud-time';
            time.textContent = '00:00 / 00:00';
            info.appendChild(chapter);
            info.appendChild(time);

            const sourceActions = document.createElement('div');
            sourceActions.className = 'hud-source-actions';

            const sourceSelector = document.createElement('div');
            sourceSelector.className = 'hud-source-selector';
            sourceSelector.setAttribute('role', 'group');
            sourceSelector.setAttribute('aria-label', '曲目來源');
            const sourceCaption = document.createElement('span');
            sourceCaption.className = 'hud-source-caption';
            sourceCaption.textContent = 'SRC';
            youtubeSourceBtn = createControlButton('YT', '使用 YouTube 章節曲目', () => {
                set1001MenuExpanded(false);
                setActiveSource('youtube');
            });
            youtubeSourceBtn.classList.add('hud-source-option', 'hud-source-youtube');
            sourceSelector.appendChild(sourceCaption);
            sourceSelector.appendChild(youtubeSourceBtn);

            statusBtn = document.createElement('button');
            statusBtn.type = 'button';
            statusBtn.className = 'hud-control-button hud-status-button';
            statusBtn.setAttribute('aria-expanded', 'false');
            statusLight = document.createElement('span');
            statusLight.className = 'status-light idle';
            statusLight.setAttribute('aria-hidden', 'true');
            const statusLabel = document.createElement('span');
            statusLabel.className = 'hud-status-label';
            statusLabel.textContent = 'DB';
            oneThousandChevron = document.createElement('span');
            oneThousandChevron.className = 'hud-1001-chevron';
            oneThousandChevron.textContent = '▼';
            statusBtn.appendChild(statusLight);
            statusBtn.appendChild(statusLabel);
            statusBtn.appendChild(oneThousandChevron);
            statusBtn.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                set1001MenuExpanded(statusBtn.getAttribute('aria-expanded') !== 'true');
            });
            sourceSelector.appendChild(statusBtn);

            oneThousandMenu = document.createElement('div');
            oneThousandMenu.className = 'hud-1001-menu';
            tracklistSource1001Btn = createControlButton('USE 1001', '使用 1001Tracklists 曲目', () => {
                setActiveSource('1001');
                set1001MenuExpanded(false);
            });
            tracklistSource1001Btn.classList.add('hud-source-1001');
            tracklistSourceMixesDbBtn = createControlButton('USE MIXESDB', '使用 MixesDB 曲目', () => {
                setActiveSource('mixesdb');
                set1001MenuExpanded(false);
            });
            tracklistSourceMixesDbBtn.classList.add('hud-source-mixesdb');
            tracklistSourceTrackIdBtn = createControlButton('USE TRACKID', '使用 TrackId.net 曲目', () => {
                setActiveSource('trackid');
                set1001MenuExpanded(false);
            });
            tracklistSourceTrackIdBtn.classList.add('hud-source-trackid');
            retryBtn = createControlButton('RETRY SEARCH', '重新搜尋 1001Tracklists', () => {
                set1001MenuExpanded(false);
                retrySearch();
            });
            linkBtn = createControlButton('OPEN 1001 ↗', '開啟 1001Tracklists 頁面', () => {
                set1001MenuExpanded(false);
                void open1001TracklistsPage();
            });
            linkBtn.classList.add('hud-1001-link');
            linkBtn.style.display = 'none';
            mixesDbSearchBtn = createControlButton('SEARCH MIXESDB', '搜尋 MixesDB', () => {
                set1001MenuExpanded(false);
                void fetchTracklistFromMixesDb(getVideoTitle(), getVideoId());
            });
            mixesDbSearchBtn.classList.add('hud-search-mixesdb');
            trackIdSearchBtn = createControlButton('SEARCH TRACKID', '搜尋 TrackId.net 既有曲目', () => {
                set1001MenuExpanded(false);
                void fetchTracklistFromTrackId(getVideoTitle(), getVideoId());
            });
            trackIdSearchBtn.classList.add('hud-search-trackid');
            mixesDbLinkBtn = createControlButton('OPEN MIXESDB ↗', '開啟 MixesDB 頁面', () => {
                set1001MenuExpanded(false);
                if (tracklistUrlMixesDb) window.open(tracklistUrlMixesDb, '_blank', 'noopener,noreferrer');
            });
            mixesDbLinkBtn.classList.add('hud-mixesdb-link');
            mixesDbLinkBtn.style.display = 'none';
            trackIdLinkBtn = createControlButton('OPEN TRACKID ↗', '開啟 TrackId.net 頁面', () => {
                set1001MenuExpanded(false);
                if (tracklistUrlTrackId) window.open(tracklistUrlTrackId, '_blank', 'noopener,noreferrer');
            });
            trackIdLinkBtn.classList.add('hud-trackid-link');
            trackIdLinkBtn.style.display = 'none';
            oneThousandMenu.appendChild(tracklistSource1001Btn);
            oneThousandMenu.appendChild(tracklistSourceMixesDbBtn);
            oneThousandMenu.appendChild(tracklistSourceTrackIdBtn);
            oneThousandMenu.appendChild(retryBtn);
            oneThousandMenu.appendChild(linkBtn);
            oneThousandMenu.appendChild(mixesDbSearchBtn);
            oneThousandMenu.appendChild(mixesDbLinkBtn);
            oneThousandMenu.appendChild(trackIdSearchBtn);
            oneThousandMenu.appendChild(trackIdLinkBtn);
            sourceSelector.appendChild(oneThousandMenu);
            tracklistBtn = createControlButton('≡', '顯示／隱藏曲目清單', toggleTracklist);
            tracklistBtn.classList.add('hud-tracklist-button');
            tracklistBtn.setAttribute('aria-expanded', 'false');
            sourceSelector.appendChild(tracklistBtn);
            sourceActions.appendChild(sourceSelector);

            info.appendChild(sourceActions);

            const transportControls = document.createElement('div');
            transportControls.className = 'hud-transport-controls';
            previousTrackBtn = createControlButton('◀ PREV', '跳到上一首曲目', () => jumpTrack(-1));
            previousTrackBtn.classList.add('hud-previous-track');
            nextTrackBtn = createControlButton('NEXT ▶', '跳到下一首曲目', () => jumpTrack(1));
            nextTrackBtn.classList.add('hud-next-track');
            transportControls.appendChild(previousTrackBtn);
            transportControls.appendChild(nextTrackBtn);
            sourceActions.appendChild(transportControls);

            const sideControls = document.createElement('div');
            sideControls.className = 'hud-side-controls';

            const closeBtn = createControlButton('×', '關閉 HUD（重新載入後恢復）', () => {
                if (stopDiscScrubbing) stopDiscScrubbing(false);
                tracklistVisible = false;
                if (tracklistPanel) tracklistPanel.style.display = 'none';
                hud.style.display = 'none';
            });
            closeBtn.classList.add('hud-close-button');

            const textSizeBtn = createControlButton(
                'T±',
                '左鍵或 Enter 放大字級；右鍵縮小；方向鍵可增減',
                () => adjustHudTextSize(1)
            );
            textSizeBtn.classList.add('hud-text-size-button');
            textSizeBtn.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowRight ArrowDown ArrowLeft');
            textSizeBtn.addEventListener('contextmenu', event => {
                event.preventDefault();
                event.stopPropagation();
                adjustHudTextSize(-1);
            }, true);
            textSizeBtn.addEventListener('keydown', event => {
                if (!['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(event.key)) return;
                event.preventDefault();
                event.stopPropagation();
                adjustHudTextSize(['ArrowUp', 'ArrowRight'].includes(event.key) ? 1 : -1);
            }, true);

            sideControls.appendChild(closeBtn);
            sideControls.appendChild(textSizeBtn);

            const resizeHandle = document.createElement('button');
            resizeHandle.type = 'button';
            resizeHandle.className = 'resize-handle hud-resize-handle';
            resizeHandle.setAttribute('aria-label', '拖曳或使用左右方向鍵調整 HUD 寬度；Home 恢復自動寬度');
            resizeHandle.title = '拖曳調整 HUD 寬度；Home 恢復自動寬度';

            hud.appendChild(panelSurface);
            hud.appendChild(wrapper);
            hud.appendChild(info);
            hud.appendChild(sideControls);
            hud.appendChild(resizeHandle);
            player.appendChild(hud);

            bindHudDragging(hud, player);
            bindHudWidthResizing(hud, player);
            applySizing();
        } else if (hud.parentNode !== player) {
            player.appendChild(hud);
        }

        bindDiscReflection(hud.querySelector('.cd-disc-wrapper'));
        bindDiscScrubbing(hud.querySelector('.cd-disc-wrapper'));

        if (!statusLight) statusLight = document.querySelector('#yt-cd-hud .status-light');
        if (!statusBtn) statusBtn = document.querySelector('#yt-cd-hud .hud-status-button');
        if (!youtubeSourceBtn) youtubeSourceBtn = document.querySelector('#yt-cd-hud .hud-source-youtube');
        if (!tracklistSource1001Btn) tracklistSource1001Btn = document.querySelector('#yt-cd-hud .hud-source-1001');
        if (!tracklistSourceMixesDbBtn) tracklistSourceMixesDbBtn = document.querySelector('#yt-cd-hud .hud-source-mixesdb');
        if (!tracklistSourceTrackIdBtn) tracklistSourceTrackIdBtn = document.querySelector('#yt-cd-hud .hud-source-trackid');
        if (!oneThousandMenu) oneThousandMenu = document.querySelector('#yt-cd-hud .hud-1001-menu');
        if (!oneThousandChevron) oneThousandChevron = document.querySelector('#yt-cd-hud .hud-1001-chevron');
        if (!linkBtn) linkBtn = document.querySelector('#yt-cd-hud .hud-1001-link');
        if (!mixesDbLinkBtn) mixesDbLinkBtn = document.querySelector('#yt-cd-hud .hud-mixesdb-link');
        if (!trackIdLinkBtn) trackIdLinkBtn = document.querySelector('#yt-cd-hud .hud-trackid-link');
        if (!mixesDbSearchBtn) mixesDbSearchBtn = document.querySelector('#yt-cd-hud .hud-search-mixesdb');
        if (!trackIdSearchBtn) trackIdSearchBtn = document.querySelector('#yt-cd-hud .hud-search-trackid');
        if (!retryBtn) retryBtn = document.querySelector('#yt-cd-hud [title*="重新搜尋 1001"]');
        if (!tracklistBtn) tracklistBtn = document.querySelector('#yt-cd-hud .hud-tracklist-button');
        if (!previousTrackBtn) previousTrackBtn = document.querySelector('#yt-cd-hud .hud-previous-track');
        if (!nextTrackBtn) nextTrackBtn = document.querySelector('#yt-cd-hud .hud-next-track');
        applyRuntimeAppearance();
        updateStatusLight();
        updateSourceButtons();
        updateLinkButton();
        updateTransportButtons();

        return hud;
    }

    function initialize() {
        if (!runtimeSettings.enabled) {
            applyRuntimeAppearance();
            return true;
        }
        const player = document.querySelector('#movie_player');
        const video = document.querySelector('#movie_player video, video.html5-main-video');
        injectStyles();
        if (!player || !video) return false;

        const videoId = getVideoId();
        const title = getVideoTitle();
        let restoredCacheSource = '';

        if (videoId && videoId !== lastVideoIdFor1001) {
            activeSearchToken++;
            cancelActiveRequests();
            tracksFromYouTube = [];
            resetProviderCandidates('1001');
            resetProviderCandidates('mixesdb');
            resetProviderCandidates('trackid');
            parsedTracks = [];
            currentSource = 'none';
            searchState = 'idle';
            searchStateDetail = '';
            pending1001VerificationRequest = null;
            clear1001VerificationReturn();
            lastVideoIdFor1001 = videoId;
            lastSearchTitle = '';
            cacheHitVideoId = '';
            restoredCacheSource = restoreCachedTracklists(videoId);
        }

        parseDescriptionTracks();
        if (restoredCacheSource === 'youtube' && tracksFromYouTube.length) {
            setActiveSource('youtube');
        }
        if (restoredCacheSource) {
            searchStateDetail = `快取：${currentSource.toUpperCase()}（${parsedTracks.length} 首）`;
        }

        if (runtimeSettings.enable1001 && runtimeSettings.autoSearch1001 && searchState === 'idle' && title && videoId) {
            fetchTracklistFrom1001(title, videoId);
        }

        createHud(player);
        bindVideo(video);
        updateCoverAndColor();
        updateHud();
        createTracklistPanel(player);

        updateSourceButtons();
        updateLinkButton();
        updateStatusLight();

        return true;
    }

    function scheduleMetadataRefresh(videoId) {
        metadataRefreshTimers.forEach(timer => clearTimeout(timer));
        metadataRefreshTimers = [1000, 3000, 7000].map(delay => setTimeout(() => {
            if (!videoId || getVideoId() !== videoId) return;
            parseDescriptionTracks();
            const refreshedTitle = getVideoTitle();
            if (
                runtimeSettings.enable1001 &&
                runtimeSettings.autoSearch1001 &&
                cacheHitVideoId !== videoId &&
                refreshedTitle &&
                refreshedTitle !== lastSearchTitle
            ) {
                fetchTracklistFrom1001(refreshedTitle, videoId, true);
            }
            updateHud();
        }, delay));
    }

    function scheduleInitialization() {
        if (!runtimeSettings.enabled) {
            applyRuntimeAppearance();
            return;
        }
        let attempts = 0;
        if (initTimer) clearInterval(initTimer);
        const scheduledVideoId = getVideoId();
        if (scheduledVideoId && scheduledVideoId !== lastVideoIdFor1001) {
            activeSearchToken++;
            cancelActiveRequests();
        }
        metadataRefreshTimers.forEach(timer => clearTimeout(timer));
        metadataRefreshTimers = [];
        initTimer = setInterval(() => {
            attempts++;
            if (initialize()) {
                clearInterval(initTimer);
                initTimer = null;
                scheduleMetadataRefresh(getVideoId());
            } else if (attempts >= 30) {
                clearInterval(initTimer);
                initTimer = null;
                console.warn('[CD HUD] YouTube player was not found after 15 seconds.');
            }
        }, 500);
    }

    function cleanup() {
        activeSearchToken++;
        cancelActiveRequests();
        clear1001VerificationReturn();
        if (stopDiscScrubbing) stopDiscScrubbing(false);
        if (initTimer) {
            clearInterval(initTimer);
            initTimer = null;
        }
        metadataRefreshTimers.forEach(timer => clearTimeout(timer));
        metadataRefreshTimers = [];
        if (cachePersistTimer !== null) {
            clearTimeout(cachePersistTimer);
            cachePersistTimer = null;
            void persistTracklistCache();
        }
        window.removeEventListener('resize', applySizing, false);
        window.removeEventListener('focus', handle1001VerificationReturn, false);
        document.removeEventListener('visibilitychange', handle1001VerificationReturn, false);
        if (globalThis.chrome?.runtime?.onMessage?.removeListener) {
            globalThis.chrome.runtime.onMessage.removeListener(handle1001BridgeReadyMessage);
        }
        if (currentVideo) {
            currentVideo.removeEventListener('timeupdate', updateHud);
            currentVideo.removeEventListener('durationchange', updateHud);
            currentVideo.removeEventListener('play', updatePlayingState);
            currentVideo.removeEventListener('pause', updatePlayingState);
            currentVideo = null;
        }
    }

    if (IS_TEST_MODE) {
        globalThis.__YT_CD_HUD_TEST_EXPORTS__ = {
            collectTracklistCandidates,
            angleDeltaToSeconds,
            calculateHudMinimumSize,
            chooseHudTitle,
            detectBlockPage,
            getAdjacentTrackTime,
            getBalancedDiscSize,
            getContentBalancedDiscSize,
            getGoogleTrackSearchUrl,
            getCandidateActionState,
            getMixesDbExactSourceLookupUrl,
            getTracklistSourcePage,
            getTrackIdAudioSearchQueries,
            getTrackIdMusicFallbackQuery,
            isSuccessfulHttpStatus,
            isLikelySingleTrackVideo,
            normalizeSearchTitle,
            normalizeTracklistCache,
            normalizeAngleDelta,
            parseRemoteHtml,
            parseSearchResultDuration,
            submit1001SearchVerification,
            parseMixesDbWikitext,
            parseTrackIdDetail,
            parseTimestampToSeconds,
            parseTracklistDocument,
            rankTrackIdMusicCandidates,
            resolveHudWidth,
            selectSingleTrackMatch,
            shouldRetry1001AfterVerificationReturn,
        };
        return;
    }

    async function boot() {
        await prepareExtensionSettings();
        await loadTracklistCache();
        document.addEventListener('yt-navigate-finish', scheduleInitialization, false);
        window.addEventListener('load', scheduleInitialization, false);
        window.addEventListener('resize', applySizing, false);
        window.addEventListener('focus', handle1001VerificationReturn, false);
        document.addEventListener('visibilitychange', handle1001VerificationReturn, false);
        if (globalThis.chrome?.runtime?.onMessage?.addListener) {
            globalThis.chrome.runtime.onMessage.addListener(handle1001BridgeReadyMessage);
        }
        window.addEventListener('pagehide', cleanup, { once: true });
        scheduleInitialization();
    }

    void boot();
})();

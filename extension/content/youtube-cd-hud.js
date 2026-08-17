// Generated from src/youtube-cd-hud.user.js. Run npm run build:extension after source changes.

(function () {
    'use strict';

    const IS_TEST_MODE = Boolean(globalThis.__YT_CD_HUD_TEST_MODE__);

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
        requestTimeoutMs: 15000,
        maxCandidates: 5,
        titleFontSize: DEFAULT_TITLE_SIZE,
        timeFontSize: DEFAULT_TIME_SIZE,
        discScale: 1,
        surfaceOpacity: 85,
        accentColor: '#63b3ed',
        showDisc: true,
        showTransport: true,
        customCss: '',
    });
    const SCALE_STEP = 1.2;
    const MIN_SCALE = 0.4;
    const MAX_SCALE = 2.5;
    const DISC_SCRUB_SECONDS_PER_REVOLUTION = 24;
    const DISC_SAMPLE_SECONDS = 0.08;
    const CANDIDATE_REQUEST_DELAY_MS = 1200;
    const AUTOMATIC_SEARCH_BLOCK_COOLDOWN_MS = 5 * 60 * 1000;
    let runtimeSettings = SETTINGS_API
        ? SETTINGS_API.normalize(SETTINGS_API.DEFAULTS)
        : { ...RUNTIME_DEFAULTS };

    let currentVideo = null;
    let parsedTracks = [];
    let tracksFromYouTube = [];
    let tracksFrom1001 = [];
    let currentSource = 'youtube';
    let searchState = 'idle';
    let searchStateDetail = '';
    let tracklistUrl1001 = '';
    let lastVideoIdFor1001 = '';
    let lastSearchTitle = '';

    let initTimer = null;
    let metadataRefreshTimers = [];
    let activeSearchToken = 0;
    let activeSearchRequest = null;
    let activeTracklistRequest = null;
    let activeCandidateTimer = null;
    let automaticSearchBlockedUntil = 0;
    let hudScale = 1.0;
    let hudTitleFontSize = DEFAULT_TITLE_SIZE;
    let hudTimeFontSize = DEFAULT_TIME_SIZE;
    let latestColorRequestVideoId = '';

    let tracklistPanel = null;
    let tracklistVisible = false;
    let statusLight = null;
    let statusBtn = null;
    let youtubeSourceBtn = null;
    let tracklistSource1001Btn = null;
    let oneThousandMenu = null;
    let oneThousandChevron = null;
    let linkBtn = null;
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

        const hud = document.getElementById('yt-cd-hud');
        if (hud) {
            hud.classList.toggle('ytcd-hide-disc', !runtimeSettings.showDisc);
            hud.classList.toggle('ytcd-hide-transport', !runtimeSettings.showTransport);
            hud.classList.toggle('ytcd-hide-1001', !runtimeSettings.enable1001);
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
            tracksFrom1001 = [];
            searchState = 'idle';
            searchStateDetail = '';
            tracklistUrl1001 = '';
            lastSearchTitle = '';
            if (currentSource === '1001') setActiveSource(tracksFromYouTube.length ? 'youtube' : 'none');
        }

        applyRuntimeAppearance();
        updateStatusLight();
        updateSourceButtons();
        updateLinkButton();

        if (reschedule && runtimeSettings.enabled && (
            !previous.enabled ||
            previous.enable1001 !== runtimeSettings.enable1001 ||
            previous.autoSearch1001 !== runtimeSettings.autoSearch1001
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
            .replace(/\b(?:official\s+(?:music\s+)?video|official\s+audio|full\s+set|lyrics?\s+video)\b/gi, ' ')
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

    function collectTracklistCandidates(doc, title, limit = 5) {
        if (!doc || typeof doc.querySelectorAll !== 'function') return [];
        const queryTokens = getTitleTokens(title);
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

            const candidateText = `${link.textContent || ''} ${href}`
                .toLowerCase()
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, ' ');
            const matchedTokens = queryTokens.filter(token => candidateText.includes(token)).length;
            const score = queryTokens.length ? matchedTokens / queryTokens.length : 0;
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
        if (status === 403) return '1001Tracklists 拒絕了請求（HTTP 403）。';
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
        const challengeNode = doc && doc.querySelector(
            '#challenge-form, .cf-turnstile, input[name="cf-turnstile-response"], input[name="cf_chl_opt"]'
        );
        if (
            challengeNode ||
            /just a moment|checking your browser|attention required|access denied/.test(pageTitle) ||
            /cf-chl-|challenge-platform|cdn-cgi\/challenge-platform/.test(sample)
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
        if (currentSource === 'youtube' || !tracksFrom1001.length) {
            setActiveSource('youtube');
        }
    }

    function setActiveSource(source) {
        if (source === 'youtube' && tracksFromYouTube.length) {
            parsedTracks = tracksFromYouTube;
            currentSource = 'youtube';
        } else if (source === '1001' && tracksFrom1001.length) {
            parsedTracks = tracksFrom1001;
            currentSource = '1001';
        } else {
            if (tracksFromYouTube.length) {
                parsedTracks = tracksFromYouTube;
                currentSource = 'youtube';
            } else if (tracksFrom1001.length) {
                parsedTracks = tracksFrom1001;
                currentSource = '1001';
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

    function fetchTracklistFrom1001(title, videoId, force = false, manual = false) {
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
        tracklistUrl1001 = '';
        tracksFrom1001 = [];
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
                    if (blockReason) tracklistUrl1001 = searchPageUrl;
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
                    tracklistUrl1001 = searchPageUrl;
                    markSearchError(blockReason, {
                        phase: 'search',
                        status: resp.status,
                        finalUrl,
                        contentType,
                    }, true);
                    return;
                }
                const candidates = collectTracklistCandidates(doc, searchTitle)
                    .slice(0, runtimeSettings.maxCandidates);
                if (!candidates.length) {
                    markSearchError('搜尋完成，但找不到符合的 1001Tracklists 曲目頁。');
                    return;
                }
                const loadCandidate = candidateIndex => {
                    if (!isCurrentSearch()) return;
                    if (candidateIndex >= candidates.length) {
                        markSearchError(
                            `已嘗試 ${candidates.length} 個候選曲目頁，但都沒有可解析的時間戳。`
                        );
                        return;
                    }

                    const href = candidates[candidateIndex];
                    tracklistUrl1001 = href;
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
                                markSearchError('曲目頁被重新導向到非預期網站。');
                                return;
                            }
                            if (!isSuccessfulHttpStatus(resp2.status)) {
                                const errorDocument = isHtmlResponse(resp2, tracklistText)
                                    ? parseRemoteHtml(tracklistText)
                                    : null;
                                const pageBlockReason = detectBlockPage(errorDocument, tracklistText, resp2.status);
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
                                markSearchError(`曲目頁回應不是 HTML（${tracklistContentType}）。`);
                                return;
                            }
                            const tracklistDocument = parseRemoteHtml(tracklistText);
                            if (!tracklistDocument) {
                                markSearchError('瀏覽器無法安全解析 1001Tracklists 曲目頁。');
                                return;
                            }
                            const pageBlockReason = detectBlockPage(tracklistDocument, tracklistText, resp2.status);
                            if (pageBlockReason) {
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

                            console.log(`[CD HUD] Loaded ${tracks.length} tracks from 1001.`);
                            tracksFrom1001 = tracks;
                            tracklistUrl1001 = finalTracklistUrl;
                            searchState = 'success';
                            searchStateDetail = '';
                            automaticSearchBlockedUntil = 0;
                            if (runtimeSettings.prefer1001 || !tracksFromYouTube.length) {
                                setActiveSource('1001');
                            } else if (currentSource === '1001') {
                                setActiveSource('1001');
                            } else {
                                updateSourceButtons();
                            }
                            updateLinkButton();
                            updateStatusLight();
                        },
                        onerror: function (err) {
                            activeTracklistRequest = null;
                            markSearchError('曲目頁網路請求失敗；請檢查連線權限或阻擋器。', err);
                        },
                        ontimeout: function () {
                            activeTracklistRequest = null;
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
                --hud-font: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
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
                gap: 14px;
                min-width: 300px;
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
            #yt-cd-hud.resizing { cursor: nwse-resize; }
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
                margin: 0 10px 0 0;
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
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                letter-spacing: .2px;
                text-shadow: 0 1px 1px rgba(0, 0, 0, .85);
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
                right: 2px;
                bottom: 2px;
                z-index: 8;
                width: 14px;
                height: 14px;
                cursor: nwse-resize;
                touch-action: none;
                background:
                    linear-gradient(135deg, transparent 0 48%, var(--hud-border) 49% 56%, transparent 57% 67%, var(--hud-focus) 68% 75%, transparent 76%);
                opacity: .82;
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
        chapterEl.textContent = chooseHudTitle(
            currentSource,
            getCurrentTrack(video.currentTime),
            chapterText
        );
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
            runtimeSettings.showDisc,
            runtimeSettings.showTransport,
            runtimeSettings.enable1001,
            player.clientWidth,
            player.clientHeight,
        ].join('|');
        if (!force && hud._ytCdContentSignature === signature) {
            const lockedWidth = parseFloat(hud.style.minWidth) || 300;
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
        const scale = Math.max(0.1, Number(hudScale) || 1);
        const maximumWidth = Math.max(300, (player.clientWidth - hud.offsetLeft) / scale);
        const maximumHeight = Math.max(118, (player.clientHeight - hud.offsetTop) / scale);
        const rightRailReserve = Math.max(paddingRight, sideSize.width + 8);
        const infoHeight = getContentHeight(info);
        const balancedDiscSize = getContentBalancedDiscSize(
            window.innerWidth,
            window.innerHeight,
            hudTitleFontSize,
            Math.max(infoHeight, sideSize.height),
            runtimeSettings.discScale
        );
        hud.style.setProperty('--hud-balanced-disc-size', `${balancedDiscSize}px`);
        disc.style.width = `${balancedDiscSize}px`;
        disc.style.height = `${balancedDiscSize}px`;
        const discSize = getElementOuterSize(disc);
        const fixedWidth = paddingLeft + discSize.width + gap + rightRailReserve + 2;
        const availableInfoWidth = Math.max(120, maximumWidth - fixedWidth);

        chapter.style.maxWidth = 'none';
        const fullChapterWidth = Math.max(chapter.scrollWidth, getTextContentWidth(chapter));
        const requiredChapterWidth = Math.min(fullChapterWidth, availableInfoWidth);
        chapter.style.width = `${requiredChapterWidth}px`;
        chapter.style.maxWidth = `${requiredChapterWidth}px`;

        const infoWidth = Math.max(
            requiredChapterWidth,
            time.scrollWidth,
            sourceActions ? sourceActions.offsetWidth : 0,
            transport ? transport.offsetWidth : 0
        );
        const minimum = calculateHudMinimumSize({
            paddingLeft,
            paddingRight,
            paddingTop,
            paddingBottom,
            discWidth: discSize.width,
            discHeight: discSize.height,
            gap,
            infoWidth,
            infoHeight,
            sideWidth: sideSize.width,
            sideHeight: sideSize.height,
        });
        minimum.width = Math.min(minimum.width, maximumWidth);
        minimum.height = Math.min(minimum.height, maximumHeight);
        hud.style.minWidth = `${minimum.width}px`;
        hud.style.maxWidth = `${minimum.width}px`;
        hud.style.minHeight = `${minimum.height}px`;
        hud.style.maxHeight = `${minimum.height}px`;
        hud.style.width = `${minimum.width}px`;
        hud.style.height = `${minimum.height}px`;
        hud._ytCdContentSignature = signature;
        return minimum;
    }

    function applySizing() {
        const titleEl = document.getElementById('hud-chapter');
        const timeEl = document.getElementById('hud-time');
        if (titleEl) titleEl.style.fontSize = hudTitleFontSize + 'px';
        if (timeEl) timeEl.style.fontSize = hudTimeFontSize + 'px';
        syncHudContentBounds(true);
    }

    function updateScale(scaleFactor) {
        const newScale = clamp(hudScale * scaleFactor, MIN_SCALE, MAX_SCALE);
        if (newScale === hudScale) return;
        hudScale = newScale;
        const hud = document.getElementById('yt-cd-hud');
        if (hud) {
            hud.style.transform = `scale(${hudScale})`;
        }
    }

    function isControlTarget(target, hud) {
        if (!target || typeof target.closest !== 'function') return false;
        const control = target.closest('.hud-control-button, .status-light, .cd-disc-wrapper, .resize-handle');
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
            const maxLeft = Math.max(0, rect.width - hud.offsetWidth * hudScale);
            const maxTop = Math.max(0, rect.height - hud.offsetHeight * hudScale);
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

    function bindHudScaling(hud, container) {
        if (!hud || !container || hud._ytCdScaleBound) return;
        const handle = Array.from(hud.children).find(child => child.classList.contains('hud-resize-handle'));
        if (!handle) return;
        hud._ytCdScaleBound = true;
        let scaleState = null;

        const finishScaling = event => {
            if (!scaleState || (event && event.pointerId !== scaleState.pointerId)) return;
            scaleState = null;
            hud.classList.remove('resizing');
        };

        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.isPrimary === false) return;
            event.preventDefault();
            event.stopPropagation();
            syncHudContentBounds(true);
            scaleState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                startScale: hudScale,
                startWidth: Math.max(1, hud.offsetWidth),
                startHeight: Math.max(1, hud.offsetHeight),
            };
            hud.classList.add('resizing');
            if (typeof handle.setPointerCapture === 'function') handle.setPointerCapture(event.pointerId);
        }, true);

        handle.addEventListener('pointermove', event => {
            if (!scaleState || event.pointerId !== scaleState.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            const widthDelta = (event.clientX - scaleState.startX) / scaleState.startWidth;
            const heightDelta = (event.clientY - scaleState.startY) / scaleState.startHeight;
            const requestedScale = scaleState.startScale * (1 + (widthDelta + heightDelta) / 2);
            const availableWidth = Math.max(1, container.clientWidth - hud.offsetLeft);
            const availableHeight = Math.max(1, container.clientHeight - hud.offsetTop);
            const boundaryScale = Math.min(
                MAX_SCALE,
                availableWidth / scaleState.startWidth,
                availableHeight / scaleState.startHeight
            );
            hudScale = clamp(requestedScale, MIN_SCALE, Math.max(MIN_SCALE, boundaryScale));
            hud.style.transform = `scale(${hudScale})`;
        }, true);

        handle.addEventListener('pointerup', finishScaling, true);
        handle.addEventListener('pointercancel', finishScaling, true);
        handle.addEventListener('lostpointercapture', finishScaling, true);
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
            if (!event.target.closest('.tracklist-header') || event.target.closest('.tracklist-control-button')) return;
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            startDrag(event.clientX, event.clientY);
        }, true);

        element.addEventListener('touchstart', (event) => {
            if (!event.target.closest('.tracklist-header') || event.target.closest('.tracklist-control-button')) return;
            if (event.touches.length === 1) {
                event.preventDefault();
                event.stopPropagation();
                const touch = event.touches[0];
                startDrag(touch.clientX, touch.clientY);
            }
        }, true);

        element.addEventListener('click', (event) => {
            if (!event.target.closest('.tracklist-item, .tracklist-control-button, .resize-handle')) {
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
        const statusTitle = searchState === 'error' && searchStateDetail
            ? searchStateDetail
            : (titles[searchState] || '');
        statusBtn = statusBtn || statusLight.closest('.hud-status-button');
        if (statusBtn) {
            statusBtn.title = statusTitle;
            statusBtn.setAttribute('aria-label', `${statusTitle}；展開 1001Tracklists 控制`);
            statusBtn.classList.toggle('has-error', searchState === 'error');
        }
    }

    function updateSourceButtons() {
        if (!youtubeSourceBtn || !tracklistSource1001Btn) return;
        const hasYouTube = tracksFromYouTube.length > 0;
        const has1001 = tracksFrom1001.length > 0;
        youtubeSourceBtn.disabled = !hasYouTube;
        tracklistSource1001Btn.disabled = !has1001;
        youtubeSourceBtn.classList.toggle('active', currentSource === 'youtube' && hasYouTube);
        tracklistSource1001Btn.classList.toggle('active', currentSource === '1001' && has1001);
        if (statusBtn) statusBtn.classList.toggle('active', currentSource === '1001' && has1001);
        youtubeSourceBtn.setAttribute('aria-pressed', String(currentSource === 'youtube' && hasYouTube));
        tracklistSource1001Btn.setAttribute('aria-pressed', String(currentSource === '1001' && has1001));
        youtubeSourceBtn.title = hasYouTube ? '使用 YouTube 章節曲目' : '目前沒有 YouTube 章節曲目';
        tracklistSource1001Btn.title = has1001 ? '使用 1001Tracklists 曲目' : '目前沒有可用的 1001Tracklists 曲目';
    }

    function updateLinkButton() {
        if (!linkBtn) return;
        if (tracklistUrl1001 && (tracksFrom1001.length > 0 || searchState === 'error')) {
            linkBtn.style.display = 'flex';
            linkBtn.title = tracksFrom1001.length > 0
                ? '在 1001Tracklists 查看原頁面'
                : '開啟 1001Tracklists 檢查或完成瀏覽器驗證';
        } else {
            linkBtn.style.display = 'none';
        }
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

    function retrySearch() {
        const title = getVideoTitle();
        const id = getVideoId();
        if (title && id) {
            console.log('[CD HUD] Manual retry triggered.');
            fetchTracklistFrom1001(title, id, true, true);
        } else {
            console.warn('[CD HUD] Cannot retry: missing title or video ID.');
        }
    }

    function renderTracklist(container) {
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
            const headerTitle = document.createElement('span');
            headerTitle.textContent = 'TRACKLIST';
            const closeButton = createControlButton('×', '關閉曲目清單', () => {
                tracklistVisible = false;
                panel.style.display = 'none';
                if (tracklistBtn) {
                    tracklistBtn.classList.remove('active');
                    tracklistBtn.setAttribute('aria-expanded', 'false');
                }
            });
            closeButton.classList.add('tracklist-control-button');
            header.appendChild(headerTitle);
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
            const chapter = document.createElement('div');
            chapter.className = 'hud-chapter';
            chapter.id = 'hud-chapter';
            chapter.textContent = 'Album Mode';
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
            statusLabel.textContent = '1001';
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
            retryBtn = createControlButton('RETRY SEARCH', '重新搜尋 1001Tracklists', () => {
                set1001MenuExpanded(false);
                retrySearch();
            });
            linkBtn = createControlButton('OPEN 1001 ↗', '開啟 1001Tracklists 頁面', () => {
                set1001MenuExpanded(false);
                if (tracklistUrl1001) {
                    window.open(tracklistUrl1001, '_blank', 'noopener,noreferrer');
                }
            });
            linkBtn.classList.add('hud-1001-link');
            linkBtn.style.display = 'none';
            oneThousandMenu.appendChild(tracklistSource1001Btn);
            oneThousandMenu.appendChild(retryBtn);
            oneThousandMenu.appendChild(linkBtn);
            sourceSelector.appendChild(oneThousandMenu);
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

            const textDecreaseBtn = createControlButton('T−', '縮小字級', () => {
                hudTitleFontSize = clamp(hudTitleFontSize - 1, 9, 28);
                hudTimeFontSize = clamp(hudTimeFontSize - 1, 10, 29);
                applySizing();
            });
            textDecreaseBtn.classList.add('hud-text-size-button');

            const textIncreaseBtn = createControlButton('T+', '放大字級', () => {
                hudTitleFontSize = clamp(hudTitleFontSize + 1, 9, 28);
                hudTimeFontSize = clamp(hudTimeFontSize + 1, 10, 29);
                applySizing();
            });
            textIncreaseBtn.classList.add('hud-text-size-button');

            tracklistBtn = createControlButton('≡', '顯示／隱藏曲目清單', toggleTracklist);
            tracklistBtn.classList.add('hud-tracklist-button');
            tracklistBtn.setAttribute('aria-expanded', 'false');

            sideControls.appendChild(closeBtn);
            sideControls.appendChild(textDecreaseBtn);
            sideControls.appendChild(textIncreaseBtn);
            sideControls.appendChild(tracklistBtn);

            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle hud-resize-handle';
            resizeHandle.setAttribute('aria-hidden', 'true');

            hud.appendChild(panelSurface);
            hud.appendChild(wrapper);
            hud.appendChild(info);
            hud.appendChild(sideControls);
            hud.appendChild(resizeHandle);
            player.appendChild(hud);

            hud.addEventListener('wheel', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const delta = e.deltaY > 0 ? 1 / SCALE_STEP : SCALE_STEP;
                updateScale(delta);
            }, { passive: false });

            bindHudDragging(hud, player);
            bindHudScaling(hud, player);
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
        if (!oneThousandMenu) oneThousandMenu = document.querySelector('#yt-cd-hud .hud-1001-menu');
        if (!oneThousandChevron) oneThousandChevron = document.querySelector('#yt-cd-hud .hud-1001-chevron');
        if (!linkBtn) linkBtn = document.querySelector('#yt-cd-hud .hud-1001-link');
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

        if (videoId && videoId !== lastVideoIdFor1001) {
            activeSearchToken++;
            cancelActiveRequests();
            tracksFromYouTube = [];
            tracksFrom1001 = [];
            parsedTracks = [];
            currentSource = 'none';
            searchState = 'idle';
            searchStateDetail = '';
            tracklistUrl1001 = '';
            lastVideoIdFor1001 = videoId;
            lastSearchTitle = '';
        }

        parseDescriptionTracks();

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
        if (stopDiscScrubbing) stopDiscScrubbing(false);
        if (initTimer) {
            clearInterval(initTimer);
            initTimer = null;
        }
        metadataRefreshTimers.forEach(timer => clearTimeout(timer));
        metadataRefreshTimers = [];
        window.removeEventListener('resize', applySizing, false);
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
            isSuccessfulHttpStatus,
            normalizeSearchTitle,
            normalizeAngleDelta,
            parseRemoteHtml,
            parseTimestampToSeconds,
            parseTracklistDocument,
        };
        return;
    }

    async function boot() {
        await prepareExtensionSettings();
        document.addEventListener('yt-navigate-finish', scheduleInitialization, false);
        window.addEventListener('load', scheduleInitialization, false);
        window.addEventListener('resize', applySizing, false);
        window.addEventListener('pagehide', cleanup, { once: true });
        scheduleInitialization();
    }

    void boot();
})();

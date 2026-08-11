// ==UserScript==
// @name         YouTube CD Album & HUD Overlay (with Tracklist + 1001Tracklists) v5.4.0
// @namespace    http://tampermonkey.net/
// @version      5.4.0
// @description  強化 1001Tracklists 搜尋配對、多候選回退、時間戳解析、Trusted Types 與換片請求清理
// @author       You
// @match        https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      1001tracklists.com
// @connect      www.1001tracklists.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const IS_TEST_MODE = Boolean(globalThis.__YT_CD_HUD_TEST_MODE__);

    let remoteHtmlPolicy = null;
    if (window.trustedTypes && typeof window.trustedTypes.createPolicy === 'function') {
        try {
            remoteHtmlPolicy = window.trustedTypes.createPolicy('yt-cd-hud-v540-remote-parser', {
                createHTML: input => input,
            });
        } catch (error) {
            console.warn('[CD HUD] Could not create the scoped remote-HTML parser policy.', error);
        }
    }

    const DEFAULT_TITLE_SIZE = 12;
    const DEFAULT_TIME_SIZE = 13;
    const DEFAULT_DISC_SIZE = 36;
    const SCALE_STEP = 1.2;
    const MIN_SCALE = 0.4;
    const MAX_SCALE = 2.5;

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
    let hudScale = 1.0;
    let hudTitleFontSize = DEFAULT_TITLE_SIZE;
    let hudTimeFontSize = DEFAULT_TIME_SIZE;
    let hudDiscSize = DEFAULT_DISC_SIZE;
    let latestColorRequestVideoId = '';

    let tracklistPanel = null;
    let tracklistVisible = false;
    let statusLight = null;
    let switchBtn = null;
    let linkBtn = null;
    let retryBtn = null;

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

        if (typeof Document.parseHTML === 'function') {
            try {
                return Document.parseHTML(markup);
            } catch (error) {
                console.warn('[CD HUD] Sanitized HTML parsing failed; trying the inert parser.', error);
            }
        }

        if (window.trustedTypes && !remoteHtmlPolicy) {
            console.warn('[CD HUD] Trusted Types is enforced, but the scoped parser policy is unavailable.');
            return null;
        }

        try {
            const parserInput = remoteHtmlPolicy ? remoteHtmlPolicy.createHTML(markup) : markup;
            return new DOMParser().parseFromString(parserInput, 'text/html');
        } catch (error) {
            console.warn('[CD HUD] Inert HTML parsing failed.', error);
            return null;
        }
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
        updateSwitchButton();
        updateLinkButton();
    }

    function fetchTracklistFrom1001(title, videoId, force = false) {
        if (!title || !videoId) return;
        if (!force && (videoId === lastVideoIdFor1001 && title === lastSearchTitle)) return;
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
        const markSearchError = (message, details) => {
            if (!isCurrentSearch()) return;
            if (details) console.warn(`[CD HUD] ${message}`, details);
            else console.warn(`[CD HUD] ${message}`);
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
            timeout: 15000,
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
                if (resp.status !== 200) {
                    const errorDocument = isHtmlResponse(resp, responseText)
                        ? parseRemoteHtml(responseText)
                        : null;
                    const blockReason = detectBlockPage(errorDocument, responseText, resp.status);
                    if (blockReason) tracklistUrl1001 = searchPageUrl;
                    markSearchError(blockReason || `1001Tracklists 搜尋失敗（HTTP ${resp.status}，${contentType}）。`);
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
                    markSearchError(blockReason);
                    return;
                }
                const candidates = collectTracklistCandidates(doc, searchTitle);
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
                        timeout: 15000,
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
                            if (resp2.status !== 200) {
                                const errorDocument = isHtmlResponse(resp2, tracklistText)
                                    ? parseRemoteHtml(tracklistText)
                                    : null;
                                const pageBlockReason = detectBlockPage(errorDocument, tracklistText, resp2.status);
                                markSearchError(
                                    pageBlockReason ||
                                    `曲目頁載入失敗（HTTP ${resp2.status}，${tracklistContentType}）。`
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
                                markSearchError(pageBlockReason);
                                return;
                            }
                            const tracks = parseTracklistDocument(tracklistDocument);
                            if (!tracks.length) {
                                console.warn(`[CD HUD] Candidate has no timestamped tracks: ${href}`);
                                loadCandidate(candidateIndex + 1);
                                return;
                            }

                            console.log(`[CD HUD] Loaded ${tracks.length} tracks from 1001.`);
                            tracksFrom1001 = tracks;
                            tracklistUrl1001 = finalTracklistUrl;
                            searchState = 'success';
                            searchStateDetail = '';
                            if (!tracksFromYouTube.length) {
                                setActiveSource('1001');
                            } else if (currentSource === '1001') {
                                setActiveSource('1001');
                            } else {
                                updateSwitchButton();
                            }
                            updateLinkButton();
                            updateStatusLight();
                        },
                        onerror: function (err) {
                            activeTracklistRequest = null;
                            markSearchError('曲目頁網路請求失敗；請檢查 @connect 權限或阻擋器。', err);
                        },
                        ontimeout: function () {
                            activeTracklistRequest = null;
                            markSearchError('曲目頁請求逾時。');
                        },
                    });
                };

                loadCandidate(0);
            },
            onerror: function (err) {
                activeSearchRequest = null;
                markSearchError('1001Tracklists 搜尋網路請求失敗；請檢查 @connect 權限或阻擋器。', err);
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
            root.style.setProperty('--hud-border', 'rgba(128,226,238,.24)');
            root.style.setProperty('--hud-glow', 'rgba(66,220,234,.13)');
            root.style.setProperty('--hud-text-shadow', '0 0 4px rgba(187,238,242,.14)');
            root.style.setProperty('--hud-time-shadow', '0 0 5px rgba(67,223,234,.28)');
            return;
        }
        const { r, g, b } = color;
        root.style.setProperty('--hud-border', `rgba(${r},${g},${b},0.4)`);
        root.style.setProperty('--hud-glow', `rgba(${r},${g},${b},0.2)`);
        root.style.setProperty('--hud-text-shadow', `0 0 6px rgba(${r},${g},${b},0.3)`);
        root.style.setProperty('--hud-time-shadow', `0 0 8px rgba(${r},${g},${b},0.5)`);
    }

    function updateCoverAndColor() {
        const videoId = getVideoId();
        const art = document.getElementById('cd-art');
        if (!art || !videoId) return;
        const url = `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
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
                --hud-border: rgba(128,226,238,.24);
                --hud-glow: rgba(66,220,234,.13);
                --hud-text-shadow: 0 0 4px rgba(187,238,242,.14);
                --hud-time-shadow: 0 0 5px rgba(67,223,234,.28);
            }
            #yt-cd-hud {
                position: absolute;
                top: 20px;
                left: 20px;
                z-index: 60;
                background: linear-gradient(145deg, rgba(18,24,30,.92), rgba(5,9,13,.88));
                backdrop-filter: blur(9px);
                -webkit-backdrop-filter: blur(9px);
                border: 1px solid var(--hud-border);
                border-radius: 9px;
                padding: 8px 13px 8px 9px;
                display: flex;
                align-items: center;
                gap: 11px;
                font-family: Consolas, "Courier New", monospace;
                box-shadow: 0 2px 7px rgba(0,0,0,.72), 0 0 7px var(--hud-glow), inset 0 1px 0 rgba(255,255,255,.05);
                pointer-events: auto;
                cursor: grab;
                user-select: none;
                -webkit-user-select: none;
                touch-action: none;
                transition: opacity .3s ease;
                transform-origin: top left;
                will-change: transform;
            }
            #yt-cd-hud.yt-cd-hud-dragging { cursor: grabbing; }
            #yt-cd-hud:after {
                content: "";
                position: absolute;
                left: 8px;
                right: 8px;
                bottom: 3px;
                height: 1px;
                background: linear-gradient(90deg, transparent, rgba(83,229,240,.48), rgba(239,176,78,.3), transparent);
            }
            .cd-disc-wrapper {
                position: relative;
                width: ${DEFAULT_DISC_SIZE}px;
                height: ${DEFAULT_DISC_SIZE}px;
                flex-shrink: 0;
                border-radius: 50%;
            }
            .cd-disc { position: absolute; inset: 0; border-radius: 50%; }
            .cd-art {
                position: absolute;
                inset: 0;
                border-radius: 50%;
                clip-path: circle(50% at 50% 50%);
                background-size: auto 100%;
                background-position: 50% 50%;
                background-repeat: no-repeat;
                box-shadow: 0 2px 5px rgba(0,0,0,.62), 0 0 7px rgba(72,224,235,.24);
                animation: cd-spin 3.5s linear infinite;
                animation-play-state: paused;
                will-change: transform;
                cursor: pointer;
            }
            .cd-art:after {
                content: "";
                position: absolute;
                inset: 0;
                border-radius: 50%;
                background: linear-gradient(125deg, rgba(255,255,255,.16), transparent 38%, rgba(0,0,0,.2));
            }
            .cd-art.playing { animation-play-state: running; }
            @keyframes cd-spin { 100% { transform: rotate(360deg); } }

            .hud-info {
                display: flex;
                flex-direction: column;
                justify-content: center;
                overflow: hidden;
            }
            .hud-chapter {
                font-size: ${DEFAULT_TITLE_SIZE}px;
                font-weight: 600;
                color: #d9e5e8;
                max-width: 300px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                letter-spacing: .15px;
                text-shadow: -1px 0 1px rgba(0,0,0,.82), 1px 0 1px rgba(0,0,0,.82), var(--hud-text-shadow);
            }
            .hud-time {
                font-size: ${DEFAULT_TIME_SIZE}px;
                font-weight: bold;
                color: #68edf3;
                letter-spacing: .9px;
                margin-top: 3px;
                text-shadow: 0 1px 2px rgba(0,0,0,.9), var(--hud-time-shadow);
            }
            .hud-controls {
                display: flex;
                flex-direction: column;
                gap: 3px;
                margin-left: 2px;
                padding-left: 8px;
                border-left: 1px solid rgba(107,218,228,.18);
                align-items: flex-start;
            }
            .hud-control-group {
                display: flex;
                align-items: center;
                gap: 3px;
            }
            .hud-control-label {
                width: 22px;
                color: #819096;
                font-size: 8px;
                font-weight: bold;
                letter-spacing: .4px;
                text-align: right;
            }
            .hud-control-button {
                width: 18px;
                height: 16px;
                padding: 0;
                border: 1px solid rgba(105,222,232,.22);
                border-radius: 3px;
                background: rgba(28,39,46,.88);
                color: #a8e9ed;
                font: 700 11px/14px Consolas, "Courier New", monospace;
                cursor: pointer;
                box-shadow: 0 1px 2px rgba(0,0,0,.45);
                pointer-events: auto;
            }
            .hud-control-button:hover {
                color: #e5fdff;
                border-color: rgba(112,232,241,.5);
                background: rgba(38,57,66,.96);
                box-shadow: 0 0 4px rgba(67,223,234,.22);
            }
            .hud-control-button:active {
                transform: translateY(1px);
                background: rgba(13,23,29,.96);
            }
            .status-light {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                display: inline-block;
                flex-shrink: 0;
                background: #444;
                transition: background 0.2s;
                box-shadow: 0 0 3px rgba(0,0,0,0.6);
                margin-right: 4px;
                cursor: pointer;
            }
            .status-light.idle { background: #555; box-shadow: none; }
            .status-light.searching {
                background: #fff;
                animation: blink-white 0.8s infinite alternate;
            }
            .status-light.success { background: #4caf50; }
            .status-light.error { background: #f44336; }
            @keyframes blink-white {
                0% { opacity: 0.3; }
                100% { opacity: 1; }
            }
            .hud-extra-buttons {
                display: flex;
                align-items: center;
                gap: 3px;
                margin-top: 2px;
            }

            .yt-tracklist-panel {
                position: absolute;
                z-index: 61;
                background: linear-gradient(145deg, rgba(18,24,30,.94), rgba(5,9,13,.9));
                backdrop-filter: blur(9px);
                -webkit-backdrop-filter: blur(9px);
                border: 1px solid var(--hud-border);
                border-radius: 9px;
                padding: 10px;
                max-height: 300px;
                min-width: 200px;
                overflow-y: auto;
                font-family: Consolas, "Courier New", monospace;
                color: #d9e5e8;
                font-size: 11px;
                box-shadow: 0 2px 10px rgba(0,0,0,.8), 0 0 8px var(--hud-glow);
                cursor: grab;
                user-select: none;
                -webkit-user-select: none;
                touch-action: none;
                display: none;
                pointer-events: auto;
            }
            .yt-tracklist-panel.dragging { cursor: grabbing; }
            .yt-tracklist-panel::-webkit-scrollbar { width: 4px; }
            .yt-tracklist-panel::-webkit-scrollbar-track { background: rgba(0,0,0,.2); border-radius: 2px; }
            .yt-tracklist-panel::-webkit-scrollbar-thumb { background: rgba(107,218,228,.3); border-radius: 2px; }
            .tracklist-item {
                padding: 3px 4px;
                border-bottom: 1px solid rgba(107,218,228,.1);
                cursor: pointer;
                white-space: nowrap;
                display: flex;
                align-items: baseline;
            }
            .tracklist-item.active {
                background: rgba(67,223,234,.15);
                color: #68edf3;
                font-weight: bold;
            }
            .tracklist-item:hover { background: rgba(107,218,228,.08); }
            .tracklist-time {
                color: #819096;
                margin-right: 8px;
                flex-shrink: 0;
            }
            .tracklist-title {
                overflow: hidden;
                text-overflow: ellipsis;
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
        chapterEl.textContent = chapterText || getCurrentTrack(video.currentTime) || 'Full Track Set';
        updateTracklistHighlight(video.currentTime);
    }

    function updatePlayingState() {
        const art = document.getElementById('cd-art');
        if (!art || !currentVideo) return;
        art.classList.toggle('playing', !currentVideo.paused);
    }

    function bindVideo(video) {
        if (!video || video === currentVideo) return;
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
    }

    function applySizing() {
        const titleEl = document.getElementById('hud-chapter');
        const timeEl = document.getElementById('hud-time');
        const wrapper = document.querySelector('#yt-cd-hud .cd-disc-wrapper');
        if (titleEl) titleEl.style.fontSize = hudTitleFontSize + 'px';
        if (timeEl) timeEl.style.fontSize = hudTimeFontSize + 'px';
        if (wrapper) {
            wrapper.style.width = hudDiscSize + 'px';
            wrapper.style.height = hudDiscSize + 'px';
        }
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
        const control = target.closest('.hud-control-button, .status-light');
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
            if (event.target.closest('.tracklist-item')) {
                return;
            }
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            startDrag(event.clientX, event.clientY);
        }, true);

        element.addEventListener('touchstart', (event) => {
            if (event.target.closest('.tracklist-item')) return;
            if (event.touches.length === 1) {
                event.preventDefault();
                event.stopPropagation();
                const touch = event.touches[0];
                startDrag(touch.clientX, touch.clientY);
            }
        }, true);

        element.addEventListener('click', (event) => {
            if (!event.target.closest('.tracklist-item')) {
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

    function createControlGroup(labelText, decreaseTitle, increaseTitle, decreaseAction, increaseAction) {
        const group = document.createElement('div');
        group.className = 'hud-control-group';
        const label = document.createElement('span');
        label.className = 'hud-control-label';
        label.textContent = labelText;
        group.appendChild(label);
        group.appendChild(createControlButton('\u2212', decreaseTitle, decreaseAction));
        group.appendChild(createControlButton('+', increaseTitle, increaseAction));
        return group;
    }

    function updateStatusLight() {
        if (!statusLight) return;
        statusLight.className = 'status-light';
        if (searchState === 'idle') statusLight.classList.add('idle');
        else if (searchState === 'searching') statusLight.classList.add('searching');
        else if (searchState === 'success') statusLight.classList.add('success');
        else if (searchState === 'error') statusLight.classList.add('error');
        const titles = {
            idle: '尚未搜索',
            searching: '搜索中...',
            success: '已獲取曲目',
            error: '搜索失敗，點擊重試'
        };
        statusLight.title = searchState === 'error' && searchStateDetail
            ? `${searchStateDetail}\n點擊狀態燈重試。`
            : (titles[searchState] || '');
        statusLight.setAttribute('aria-label', statusLight.title);
    }

    function updateSwitchButton() {
        if (!switchBtn) return;
        const hasYouTube = tracksFromYouTube.length > 0;
        const has1001 = tracksFrom1001.length > 0;
        if (hasYouTube && has1001) {
            switchBtn.style.display = 'inline-block';
            switchBtn.textContent = currentSource === 'youtube' ? 'YT' : '1K';
            switchBtn.title = `切換至 ${currentSource === 'youtube' ? '1001' : 'YouTube'} 曲目`;
        } else {
            switchBtn.style.display = 'none';
        }
    }

    function updateLinkButton() {
        if (!linkBtn) return;
        if (tracklistUrl1001 && (tracksFrom1001.length > 0 || searchState === 'error')) {
            linkBtn.style.display = 'inline-block';
            linkBtn.title = tracksFrom1001.length > 0
                ? '在 1001Tracklists 查看原頁面'
                : '開啟 1001Tracklists 檢查或完成瀏覽器驗證';
        } else {
            linkBtn.style.display = 'none';
        }
    }

    function retrySearch() {
        const title = getVideoTitle();
        const id = getVideoId();
        if (title && id) {
            console.log('[CD HUD] Manual retry triggered.');
            fetchTracklistFrom1001(title, id, true);
        } else {
            console.warn('[CD HUD] Cannot retry: missing title or video ID.');
        }
    }

    function renderTracklist(container) {
        container.replaceChildren();
        if (!parsedTracks.length) {
            const noTrack = document.createElement('div');
            noTrack.className = 'tracklist-item';
            noTrack.textContent = 'No tracklist found';
            container.appendChild(noTrack);
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
            container.appendChild(item);
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
        tracklistPanel.style.display = tracklistVisible ? '' : 'none';
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
            panel.style.top = '60px';
            panel.style.right = '20px';
            player.appendChild(panel);
            bindTracklistDragging(panel, player);
        } else if (panel.parentNode !== player) {
            player.appendChild(panel);
        }
        panel.style.display = tracklistVisible ? '' : 'none';
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

            const controls = document.createElement('div');
            controls.className = 'hud-controls';

            controls.appendChild(createControlGroup(
                'TXT',
                '縮小字級',
                '放大字級',
                () => { hudTitleFontSize = clamp(hudTitleFontSize - 1, 9, 28); hudTimeFontSize = clamp(hudTimeFontSize - 1, 10, 29); applySizing(); },
                () => { hudTitleFontSize = clamp(hudTitleFontSize + 1, 9, 28); hudTimeFontSize = clamp(hudTimeFontSize + 1, 10, 29); applySizing(); }
            ));
            controls.appendChild(createControlGroup(
                'CD',
                '縮小封面',
                '放大封面',
                () => { hudDiscSize = clamp(hudDiscSize - 4, 24, 96); applySizing(); },
                () => { hudDiscSize = clamp(hudDiscSize + 4, 24, 96); applySizing(); }
            ));

            const extraRow = document.createElement('div');
            extraRow.className = 'hud-extra-buttons';

            statusLight = document.createElement('span');
            statusLight.className = 'status-light idle';
            statusLight.setAttribute('role', 'button');
            statusLight.setAttribute('tabindex', '0');
            statusLight.setAttribute('aria-label', '重試搜尋 1001Tracklists');
            statusLight.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                retrySearch();
            });
            statusLight.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                retrySearch();
            });
            extraRow.appendChild(statusLight);

            switchBtn = createControlButton('YT', '切換曲目來源', () => {
                if (currentSource === 'youtube' && tracksFrom1001.length) {
                    setActiveSource('1001');
                } else if (currentSource === '1001' && tracksFromYouTube.length) {
                    setActiveSource('youtube');
                }
            });
            switchBtn.style.display = 'none';
            extraRow.appendChild(switchBtn);

            linkBtn = createControlButton('🔗', '開啟 1001 頁面', () => {
                if (tracklistUrl1001) {
                    window.open(tracklistUrl1001, '_blank', 'noopener,noreferrer');
                }
            });
            linkBtn.style.display = 'none';
            extraRow.appendChild(linkBtn);

            const tlBtn = createControlButton('\u2630', '顯示/隱藏 Tracklist', toggleTracklist);
            tlBtn.style.marginLeft = '4px';
            extraRow.appendChild(tlBtn);

            controls.appendChild(extraRow);

            hud.appendChild(wrapper);
            hud.appendChild(info);
            hud.appendChild(controls);
            player.appendChild(hud);

            const artEl = document.getElementById('cd-art');
            if (artEl) {
                artEl.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    if (currentVideo) {
                        if (currentVideo.paused) currentVideo.play();
                        else currentVideo.pause();
                    }
                }, true);
            }

            hud.addEventListener('wheel', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const delta = e.deltaY > 0 ? 1 / SCALE_STEP : SCALE_STEP;
                updateScale(delta);
            }, { passive: false });

            bindHudDragging(hud, player);
            applySizing();
        } else if (hud.parentNode !== player) {
            player.appendChild(hud);
        }

        if (!statusLight) statusLight = document.querySelector('#yt-cd-hud .status-light');
        if (!switchBtn) switchBtn = document.querySelector('#yt-cd-hud .hud-control-button:not([title*="縮"]):not([title*="放"]):not([title*="Tracklist"]):not([title*="1001"])');
        if (!linkBtn) linkBtn = document.querySelector('#yt-cd-hud .hud-control-button[title*="1001"]');
        updateStatusLight();
        updateSwitchButton();
        updateLinkButton();

        return hud;
    }

    function initialize() {
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

        if (searchState === 'idle' && title && videoId) {
            fetchTracklistFrom1001(title, videoId);
        }

        createHud(player);
        bindVideo(video);
        updateCoverAndColor();
        updateHud();
        createTracklistPanel(player);

        updateSwitchButton();
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
            if (refreshedTitle && refreshedTitle !== lastSearchTitle) {
                fetchTracklistFrom1001(refreshedTitle, videoId, true);
            }
            updateHud();
        }, delay));
    }

    function scheduleInitialization() {
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
        if (initTimer) {
            clearInterval(initTimer);
            initTimer = null;
        }
        metadataRefreshTimers.forEach(timer => clearTimeout(timer));
        metadataRefreshTimers = [];
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
            normalizeSearchTitle,
            parseTimestampToSeconds,
            parseTracklistDocument,
        };
        return;
    }

    document.addEventListener('yt-navigate-finish', scheduleInitialization, false);
    window.addEventListener('load', scheduleInitialization, false);
    window.addEventListener('pagehide', cleanup, { once: true });
    scheduleInitialization();
})();

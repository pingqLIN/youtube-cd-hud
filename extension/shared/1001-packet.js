(function (root) {
    'use strict';

    const PACKET_TYPE = 'YT_CD_HUD_1001_PACKET_V1';
    const MAX_TRACKS = 300;
    const MAX_TITLE_LENGTH = 300;
    const MAX_URL_LENGTH = 2048;
    const MAX_PACKET_BYTES = 128 * 1024;
    const ALLOWED_URL_PATTERN = /^https:\/\/(?:www\.)?1001tracklists\.com\/tracklist\//i;

    function trim(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function parseTimestampToSeconds(value) {
        const parts = trim(value).match(/\d+/g);
        if (!parts || parts.length < 2 || parts.length > 3) return null;
        const numbers = parts.map(Number);
        if (numbers.some(number => !Number.isFinite(number))) return null;
        if (numbers.length === 3) return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
        return numbers[0] * 60 + numbers[1];
    }

    function normalizeTrack(track) {
        const time = Math.max(0, Math.floor(Number(track && track.time)));
        const title = trim(track && track.title).slice(0, MAX_TITLE_LENGTH);
        if (!Number.isFinite(time) || !title) return null;
        return { time, title };
    }

    function normalizeCanonicalUrl(value) {
        const url = String(value || '').slice(0, MAX_URL_LENGTH);
        if (!ALLOWED_URL_PATTERN.test(url)) return '';
        try {
            const parsed = new URL(url);
            parsed.hash = '';
            return parsed.href;
        } catch (error) {
            return '';
        }
    }

    function normalizePacket(value) {
        if (!value || value.version !== 1 || value.provider !== '1001tracklists') return null;
        const canonicalUrl = normalizeCanonicalUrl(value.canonicalUrl);
        if (!canonicalUrl || !Array.isArray(value.tracks)) return null;
        const tracks = [];
        const seen = new Set();
        for (const rawTrack of value.tracks.slice(0, MAX_TRACKS)) {
            const track = normalizeTrack(rawTrack);
            if (!track) continue;
            const key = `${track.time}\u0000${track.title.toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            tracks.push(track);
        }
        tracks.sort((left, right) => left.time - right.time);
        if (!tracks.length) return null;
        const packet = {
            version: 1,
            provider: '1001tracklists',
            canonicalUrl,
            capturedAt: Math.max(0, Math.floor(Number(value.capturedAt) || Date.now())),
            tracks,
        };
        if (new TextEncoder().encode(JSON.stringify(packet)).byteLength > MAX_PACKET_BYTES) return null;
        return packet;
    }

    function extractRenderedTracklist(documentValue, pageUrl, now = Date.now()) {
        if (!documentValue || typeof documentValue.querySelectorAll !== 'function') return null;
        const canonicalLink = typeof documentValue.querySelector === 'function'
            ? documentValue.querySelector('link[rel="canonical"]')
            : null;
        const canonicalUrl = normalizeCanonicalUrl(canonicalLink && canonicalLink.href || pageUrl);
        if (!canonicalUrl) return null;
        const rows = Array.from(documentValue.querySelectorAll([
            '.bItm',
            'tr.tlpItem',
            'tr[id^="tlp"]',
            '.tlRow',
            '.tracklist-row',
            '.tl-item',
            '.tracklist-item',
            '.tl-entry',
            '.track-entry',
        ].join(', ')));
        const tracks = [];
        rows.forEach(row => {
            const timeNode = row.querySelector('.cue, .cueValueField, .tlTime, .tl-time, .time, .timestamp, .duration');
            const titleNode = row.querySelector('.trackValue, .trackFormat, .tlTrack, .tl-track, .track-name, .title, .track, .track-title');
            const hiddenSeconds = row.querySelector('[data-cue], [data-time], [data-seconds], input[id*="cue"]');
            const seconds = hiddenSeconds
                ? Number(hiddenSeconds.dataset && (hiddenSeconds.dataset.cue || hiddenSeconds.dataset.time || hiddenSeconds.dataset.seconds) || hiddenSeconds.value)
                : parseTimestampToSeconds(timeNode && (timeNode.textContent || timeNode.innerText));
            tracks.push({ time: seconds, title: titleNode && (titleNode.textContent || titleNode.innerText) });
        });
        return normalizePacket({
            version: 1,
            provider: '1001tracklists',
            canonicalUrl,
            capturedAt: now,
            tracks,
        });
    }

    root.YtCdHud1001Packet = Object.freeze({
        PACKET_TYPE,
        extractRenderedTracklist,
        normalizePacket,
    });
})(globalThis);

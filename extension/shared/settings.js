(function () {
    'use strict';

    const STORAGE_KEY = 'ytCdHudSettings';
    const DEFAULTS = Object.freeze({
        enabled: true,
        enable1001: true,
        autoSearch1001: true,
        prefer1001: false,
        enableMixesDb: true,
        enableTrackId: true,
        requestTimeoutMs: 15000,
        maxCandidates: 5,
        titleFontSize: 14,
        timeFontSize: 12,
        discScale: 1,
        surfaceOpacity: 85,
        accentColor: '#63b3ed',
        showDisc: true,
        showTransport: true,
        customCss: '',
    });

    function clampNumber(value, fallback, minimum, maximum, integer = false) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        const clamped = Math.min(Math.max(parsed, minimum), maximum);
        return integer ? Math.round(clamped) : clamped;
    }

    function normalizeColor(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : DEFAULTS.accentColor;
    }

    function normalize(value = {}) {
        return {
            enabled: value.enabled !== false,
            enable1001: value.enable1001 !== false,
            autoSearch1001: value.autoSearch1001 !== false,
            prefer1001: value.prefer1001 === true,
            enableMixesDb: value.enableMixesDb !== false,
            enableTrackId: value.enableTrackId !== false,
            requestTimeoutMs: clampNumber(value.requestTimeoutMs, DEFAULTS.requestTimeoutMs, 5000, 30000, true),
            maxCandidates: clampNumber(value.maxCandidates, DEFAULTS.maxCandidates, 1, 10, true),
            titleFontSize: clampNumber(value.titleFontSize, DEFAULTS.titleFontSize, 9, 28, true),
            timeFontSize: clampNumber(value.timeFontSize, DEFAULTS.timeFontSize, 10, 29, true),
            discScale: clampNumber(value.discScale, DEFAULTS.discScale, 0.7, 1.6),
            surfaceOpacity: clampNumber(value.surfaceOpacity, DEFAULTS.surfaceOpacity, 45, 100, true),
            accentColor: normalizeColor(value.accentColor),
            showDisc: value.showDisc !== false,
            showTransport: value.showTransport !== false,
            customCss: String(value.customCss || '').slice(0, 20000),
        };
    }

    globalThis.YtCdHudSettings = Object.freeze({
        STORAGE_KEY,
        DEFAULTS,
        normalize,
    });
})();

(function () {
    'use strict';
    const properties = {};
    for (const key of ['enabled', 'enableYouTube', 'enableCache', 'enable1001', 'autoSearch1001', 'prefer1001', 'enableMixesDb', 'enableTrackId', 'showDisc', 'showTransport']) properties[key] = { type: 'boolean' };
    for (const [key, minimum, maximum] of [['requestTimeoutMs', 5000, 30000], ['maxCandidates', 1, 10], ['titleFontSize', 9, 28], ['timeFontSize', 10, 29], ['surfaceOpacity', 45, 100]]) properties[key] = { type: 'integer', minimum, maximum };
    properties.discScale = { type: 'number', minimum: 0.7, maximum: 1.6 };
    properties.accentColor = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
    properties.fontFamily = { type: 'string', enum: ['cascadia-mono', 'ocr-machine', 'jetbrains-mono', 'ibm-plex-mono', 'source-code-pro', 'consolas'] };
    properties.language = { type: 'string', enum: ['auto', 'zh-TW', 'en', 'ja'] };
    const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    function validValue(key, value) {
        if (!Object.hasOwn(properties, key)) return false;
        const rule = properties[key];
        if (rule.type === 'integer' ? !Number.isInteger(value) : typeof value !== rule.type) return false;
        if (typeof value === 'number' && (!Number.isFinite(value) || value < rule.minimum || value > rule.maximum)) return false;
        if (rule.enum && !rule.enum.includes(value)) return false;
        return !rule.pattern || new RegExp(rule.pattern).test(value);
    }
    function validPatch(value) {
        return plain(value) && Object.keys(value).length > 0 && Object.entries(value).every(([key, item]) => validValue(key, item));
    }
    function project(value) {
        return Object.fromEntries(Object.keys(properties).filter(key => validValue(key, value?.[key])).map(key => [key, value[key]]));
    }
    const revision = { type: 'string', pattern: '^[a-fA-F0-9]{64}$' };
    const schema = { type: 'object', additionalProperties: false, properties: { baseRevision: revision, settings: { type: 'object', additionalProperties: false, minProperties: 1, properties } }, required: ['baseRevision', 'settings'] };
    function validInput(operation, input) {
        if (!plain(input)) return false;
        if (['panel_read', 'settings_read'].includes(operation)) return Object.keys(input).length === 0;
        if (operation === 'settings_status') return Object.keys(input).length === 1 && typeof input.operationId === 'string' && /^[a-z0-9-]{1,100}$/i.test(input.operationId);
        return operation === 'settings_apply' && Object.keys(input).length === 2 && typeof input.baseRevision === 'string' && /^[a-f0-9]{64}$/i.test(input.baseRevision) && validPatch(input.settings);
    }
    globalThis.YtCdHudWebMcpSettings = Object.freeze({ schema, validInput, project });
})();

(function () {
    'use strict';
    // Pure presentation contract. No DOM, storage, selectors, or executable CSS.
    const FORMAT = 'youtube-cd-hud-skin';
    const EFFECTS = Object.freeze({ 'panel-base': ['shadow', 'accentRail'], disc: ['glow'], 'track-title': ['marquee'], 'time-readout': [], 'source-selector': ['statusLamp'], 'tracklist-toggle': [], 'transport-controls': [], 'close-control': [], 'text-size-control': [], 'tracklist-panel': ['shadow', 'accentRail'], 'volume-control': [], 'agent-tools': [], 'system-status': [] });
    const color = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
    const range = (min, max) => v => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
    const bool = v => typeof v === 'boolean';
    const SURFACE = { volumeStyle: v => ['fader', 'knob'].includes(v), backgroundColor: color, borderColor: color, opacity: range(0, 1), secondaryOpacity: range(0, 1), discOpacity: range(0, 1), borderEnabled: bool, backgroundEnabled: bool, cornerEnabled: bool, cornerRadiusLevel: v => Number.isInteger(v) && v >= 1 && v <= 10, backgroundBlurEnabled: bool, texture: v => ['classic', 'gold', 'transparent-grooves', 'jog'].includes(v) };
    const TEXT = { color, opacity: range(0, 1), font: v => typeof v === 'string' && /^[\p{L}\p{N} _-]{1,80}$/u.test(v), fontSize: range(8, 192), fontWeight: v => Number.isInteger(v) && v >= 100 && v <= 900, textAlign: v => ['left', 'right', 'center', 'justify'].includes(v) };
    const TOKENS = { primaryColor: color, secondaryColor: color, primaryOpacity: range(0, 1), secondaryOpacity: range(0, 1) };
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const clone = v => JSON.parse(JSON.stringify(v));
    function normalizeSkin(input) {
        const warnings = [];
        const skin = { format: FORMAT, schemaVersion: 1, tokens: {}, roles: {} };
        const warn = path => warnings.push('INVALID_SKIN:' + path);
        function fields(source, rules, path) {
            const result = {};
            if (!object(source)) { warn(path); return result; }
            for (const [key, value] of Object.entries(source).sort(([a], [b]) => a.localeCompare(b))) {
                if (!Object.hasOwn(rules, key) || !rules[key](value)) warn(path + '.' + key);
                else result[key] = value;
            }
            return result;
        }
        if (!object(input)) { warn('root'); return { skin, warnings }; }
        for (const key of Object.keys(input)) if (!['format', 'schemaVersion', 'tokens', 'roles'].includes(key)) warn(key);
        if (input.format !== FORMAT) warn('format');
        if (input.schemaVersion !== 1) warn('schemaVersion');
        skin.tokens = fields(input.tokens ?? {}, TOKENS, 'tokens');
        if (!object(input.roles)) warn('roles');
        else for (const [role, groups] of Object.entries(input.roles).sort(([a], [b]) => a.localeCompare(b))) {
            if (!Object.hasOwn(EFFECTS, role) || !object(groups)) { warn('roles.' + role); continue; }
            const result = {};
            for (const [group, values] of Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))) {
                let rules = null;
                if (group === 'surface') rules = Object.fromEntries(Object.entries(SURFACE).filter(([key]) => (role === 'disc' || !['texture', 'discOpacity'].includes(key)) && (role === 'volume-control' || key !== 'volumeStyle')));
                if (group === 'text' && !['disc', 'panel-base'].includes(role)) rules = TEXT;
                if (group === 'effects') rules = Object.fromEntries(EFFECTS[role].map(key => [key, bool]));
                if (!rules) warn('roles.' + role + '.' + group);
                else result[group] = fields(values, rules, 'roles.' + role + '.' + group);
            }
            skin.roles[role] = result;
        }
        return { skin, warnings };
    }
    function requireSkin(input) {
        const result = normalizeSkin(input);
        if (result.warnings.length) throw new Error(result.warnings.join(';'));
        return result.skin;
    }
    function extractSkin(layout) {
        const roles = {};
        for (const component of layout.components || []) {
            const role = component.type || component.id;
            if (!Object.hasOwn(EFFECTS, role)) continue;
            roles[role] = { surface: clone(component.style || {}), ...(component.textStyle ? { text: clone(component.textStyle) } : {}), effects: clone(component.effects || {}) };
        }
        return requireSkin({ format: FORMAT, schemaVersion: 1, tokens: clone(layout.palette || {}), roles });
    }
    function compileSkin(input) {
        const { skin, warnings } = normalizeSkin(input);
        if (warnings.length) return { cssVariables: {}, patches: {}, warnings };
        const cssVariables = Object.fromEntries(Object.entries(skin.tokens).map(([key, value]) => ['--hud-' + key.replace(/[A-Z]/g, x => '-' + x.toLowerCase()), String(value)]));
        const patches = Object.fromEntries(Object.entries(skin.roles).map(([role, value]) => [role, { ...(value.surface ? { style: value.surface } : {}), ...(value.text ? { textStyle: value.text } : {}), ...(value.effects ? { effects: value.effects } : {}) }]));
        return { cssVariables, patches, warnings };
    }
    function applySkinToLayout(layout, input) {
        const skin = requireSkin(input), compiled = compileSkin(skin), next = clone(layout);
        next.palette = { ...next.palette, ...skin.tokens };
        for (const component of next.components || []) {
            const patch = compiled.patches[component.type || component.id];
            if (!patch) continue;
            for (const field of ['style', 'textStyle', 'effects']) if (patch[field]) component[field] = { ...component[field], ...patch[field] };
        }
        next.skin = skin;
        return next;
    }
    globalThis.YtCdHudSkin = Object.freeze({ FORMAT, normalizeSkin, requireSkin, extractSkin, compileSkin, applySkinToLayout });
})();
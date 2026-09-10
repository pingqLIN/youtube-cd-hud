(function () {
    'use strict';

    const VERSION = 2;
    const STORAGE_KEY = 'ytCdHudLayoutV2';
    const LEGACY_STORAGE_KEY = 'ytCdHudLayoutV1';
    const CANVAS = Object.freeze({
        width: 1280,
        height: 720,
        sizingMode: 'absolute',
        collisionPolicy: 'no-overlap-closed',
        alignmentGrid: Object.freeze({ enabled: true, unitWidth: 8, unitHeight: 8, visible: false }),
    });
    const VIEWPORT_PRESETS = Object.freeze([
        Object.freeze({ id: 'hd', width: 1280, height: 720, label: '1280 × 720' }),
        Object.freeze({ id: 'fhd', width: 1920, height: 1080, label: '1920 × 1080' }),
        Object.freeze({ id: 'uhd', width: 3840, height: 2160, label: '3840 × 2160' }),
    ]);
    const SIZING_MODES = Object.freeze(['absolute', 'relative']);
    const PALETTE_DEFAULTS = Object.freeze({ primaryColor: '#1a202c', secondaryColor: '#63b3ed' });
    const TEXT_SIZE_MAXIMUM = 192;
    const CORNER_RADIUS_LEVEL_MINIMUM = 1;
    const CORNER_RADIUS_LEVEL_MAXIMUM = 10;
    const CORNER_RADIUS_STEP_PX = 2;
    const COLLISION_GAP = 8;
    const TEXT_ALIGNMENTS = Object.freeze(['left', 'right', 'center', 'justify']);
    const DISC_TEXTURES = Object.freeze(['classic', 'gold', 'transparent-grooves']);
    const FONT_STACKS = Object.freeze({
        'cascadia-mono': '"Cascadia Mono", Consolas, monospace',
        'ocr-machine': '"OCR A Extended", Consolas, monospace',
        'jetbrains-mono': '"JetBrains Mono", Consolas, monospace',
        'ibm-plex-mono': '"IBM Plex Mono", Consolas, monospace',
        'source-code-pro': '"Source Code Pro", Consolas, monospace',
        consolas: 'Consolas, monospace',
    });

    function definition(type, label, configuration) {
        const fixedRoundShape = configuration.flags?.fixedRoundShape === true;
        const supportedProperties = [...new Set([
            ...(configuration.supportedProperties || ['opacity', 'size']),
            'borderEnabled',
            'backgroundBlurEnabled',
            ...(fixedRoundShape ? [] : ['cornerEnabled', 'cornerRadiusLevel']),
        ])];
        const boundary = configuration.boundary === null
            ? null
            : Object.freeze({ state: 'closed', shape: 'rect', collision: true, ...(configuration.boundary || {}) });
        return Object.freeze({
            type,
            label,
            required: false,
            removable: true,
            catalog: true,
            minSize: Object.freeze(configuration.minSize),
            maxSize: Object.freeze(configuration.maxSize),
            supportedProperties: Object.freeze(supportedProperties),
            supportedTextProperties: Object.freeze(configuration.supportedTextProperties || []),
            supportedEffects: Object.freeze(configuration.supportedEffects || []),
            boundary,
            default: Object.freeze({
                geometry: Object.freeze(configuration.geometry),
                ...(configuration.arrangement ? { arrangement: Object.freeze(configuration.arrangement) } : {}),
                style: Object.freeze({
                    borderEnabled: true,
                    cornerEnabled: fixedRoundShape,
                    cornerRadiusLevel: fixedRoundShape ? CORNER_RADIUS_LEVEL_MAXIMUM : 1,
                    backgroundBlurEnabled: false,
                    ...(configuration.style || { opacity: 1 }),
                }),
                ...(configuration.textStyle ? { textStyle: Object.freeze(configuration.textStyle) } : {}),
                effects: Object.freeze(configuration.effects || {}),
            }),
            ...configuration.flags,
        });
    }

    const registry = Object.freeze({
        'panel-base': definition('panel-base', 'Panel base', {
            minSize: { width: 320, height: 96 }, maxSize: { width: 1280, height: 720 },
            supportedProperties: ['backgroundColor', 'opacity', 'padding'],
            supportedEffects: ['shadow', 'accentRail'],
            boundary: { mode: 'dynamic-envelope', collision: false, padding: 18 },
            geometry: { x: .5, y: .5, width: 920, height: 154, z: -1 },
            style: { opacity: .85, backgroundColor: PALETTE_DEFAULTS.primaryColor, borderColor: PALETTE_DEFAULTS.secondaryColor },
            effects: { shadow: true, accentRail: true },
            flags: { required: true, removable: false, catalog: false, special: 'dynamic-base', opacityMinimum: 0 },
        }),
        disc: definition('disc', 'Disc control', {
            minSize: { width: 60, height: 60 }, maxSize: { width: 720, height: 720 },
            supportedProperties: ['backgroundColor', 'opacity', 'size', 'texture'],
            boundary: null,
            geometry: { x: .125, y: .5, width: 100, height: 100, z: 1 },
            style: { opacity: 1, backgroundColor: PALETTE_DEFAULTS.primaryColor, borderColor: PALETTE_DEFAULTS.secondaryColor, texture: 'classic' }, effects: { glow: true }, supportedEffects: ['glow'],
            flags: { supportsZAxis: true, zAxisAlways: true, allowCanvasOverflow: true, fixedRoundShape: true },
        }),
        'track-title': definition('track-title', 'Track title', {
            minSize: { width: 180, height: 48 }, maxSize: { width: 720, height: 120 },
            supportedProperties: ['backgroundColor', 'opacity', 'size'], supportedTextProperties: ['color', 'opacity', 'font', 'fontSize', 'textAlign'],
            geometry: { x: .34, y: .43, width: 430, height: 48, z: 0 },
            style: { opacity: 1, backgroundColor: PALETTE_DEFAULTS.primaryColor, borderColor: PALETTE_DEFAULTS.secondaryColor }, textStyle: { color: PALETTE_DEFAULTS.secondaryColor, opacity: 1, font: 'cascadia-mono', fontSize: 14, textAlign: 'left' },
            effects: { marquee: true }, supportedEffects: ['marquee'], flags: { supportsZAxis: true },
        }),
        'time-readout': definition('time-readout', 'Time readout', {
            minSize: { width: 90, height: 48 }, maxSize: { width: 320, height: 96 },
            supportedProperties: ['backgroundColor', 'opacity', 'size'], supportedTextProperties: ['color', 'opacity', 'font', 'fontSize', 'textAlign'],
            geometry: { x: .23, y: .515, width: 120, height: 48, z: 0 },
            style: { opacity: 1, backgroundColor: PALETTE_DEFAULTS.primaryColor, borderColor: PALETTE_DEFAULTS.secondaryColor }, textStyle: { color: PALETTE_DEFAULTS.secondaryColor, opacity: 1, font: 'cascadia-mono', fontSize: 12, textAlign: 'left' },
            flags: { supportsZAxis: true },
        }),
        'source-selector': definition('source-selector', 'Source selector', {
            minSize: { width: 180, height: 48 }, maxSize: { width: 520, height: 96 },
            supportedProperties: ['backgroundColor', 'opacity', 'size'], supportedTextProperties: ['color', 'opacity', 'font', 'fontSize', 'textAlign'],
            geometry: { x: .39, y: .61, width: 280, height: 48, z: 0 },
            style: { opacity: 1, backgroundColor: PALETTE_DEFAULTS.primaryColor, borderColor: PALETTE_DEFAULTS.secondaryColor }, textStyle: { color: PALETTE_DEFAULTS.secondaryColor, opacity: 1, font: 'cascadia-mono', fontSize: 9, textAlign: 'center' },
            effects: { statusLamp: true }, supportedEffects: ['statusLamp'], flags: { supportsZAxis: true },
        }),
        'tracklist-toggle': definition('tracklist-toggle', 'Tracklist toggle', {
            minSize: { width: 48, height: 48 }, maxSize: { width: 112, height: 96 },
            supportedProperties: ['backgroundColor', 'opacity', 'size'], supportedTextProperties: ['color', 'opacity', 'font', 'fontSize', 'textAlign'],
            geometry: { x: .526, y: .61, width: 48, height: 48, z: 0 },
            style: { opacity: 1, backgroundColor: PALETTE_DEFAULTS.primaryColor, borderColor: PALETTE_DEFAULTS.secondaryColor }, textStyle: { color: PALETTE_DEFAULTS.secondaryColor, opacity: 1, font: 'cascadia-mono', fontSize: 11, textAlign: 'center' },
            flags: { supportsZAxis: true },
        }),
        'transport-controls': definition('transport-controls', 'Track controls', {
            minSize: { width: 128, height: 48 }, maxSize: { width: 360, height: 112 },
            supportedProperties: ['backgroundColor', 'opacity', 'size'], supportedTextProperties: ['color', 'opacity', 'font', 'fontSize', 'textAlign'],
            geometry: { x: .625, y: .61, width: 128, height: 48, z: 0 },
            arrangement: {
                split: false,
                partSize: { width: 72, height: 48 },
                positions: { previous: { x: .6, y: .5888888889 }, next: { x: .65, y: .5888888889 } },
            },
            style: { opacity: 1, backgroundColor: PALETTE_DEFAULTS.primaryColor, borderColor: PALETTE_DEFAULTS.secondaryColor }, textStyle: { color: PALETTE_DEFAULTS.secondaryColor, opacity: 1, font: 'cascadia-mono', fontSize: 9, textAlign: 'center' },
            flags: { supportsZAxis: true, supportsSplit: true },
        }),
        'close-control': definition('close-control', 'Close control', {
            minSize: { width: 48, height: 48 }, maxSize: { width: 96, height: 96 },
            supportedProperties: ['backgroundColor', 'opacity', 'size'], supportedTextProperties: ['color', 'opacity', 'font', 'fontSize', 'textAlign'],
            geometry: { x: .72, y: .43, width: 48, height: 48, z: 0 },
            style: { opacity: 1, backgroundColor: PALETTE_DEFAULTS.primaryColor, borderColor: PALETTE_DEFAULTS.secondaryColor }, textStyle: { color: PALETTE_DEFAULTS.secondaryColor, opacity: 1, font: 'cascadia-mono', fontSize: 16, textAlign: 'center' },
            flags: { supportsZAxis: true },
        }),
        'text-size-control': definition('text-size-control', 'Text size control', {
            minSize: { width: 64, height: 48 }, maxSize: { width: 128, height: 96 },
            supportedProperties: ['backgroundColor', 'opacity', 'size'], supportedTextProperties: ['color', 'opacity', 'font', 'fontSize', 'textAlign'],
            geometry: { x: .72, y: .515, width: 64, height: 48, z: 0 },
            style: { opacity: 1, backgroundColor: PALETTE_DEFAULTS.primaryColor, borderColor: PALETTE_DEFAULTS.secondaryColor }, textStyle: { color: PALETTE_DEFAULTS.secondaryColor, opacity: 1, font: 'cascadia-mono', fontSize: 14, textAlign: 'center' },
            flags: { supportsZAxis: true },
        }),
        'tracklist-panel': definition('tracklist-panel', 'Tracklist panel', {
            minSize: { width: 220, height: 120 }, maxSize: { width: 720, height: 640 },
            supportedProperties: ['backgroundColor', 'opacity', 'size'],
            supportedTextProperties: ['color', 'opacity', 'font', 'fontSize', 'textAlign'],
            geometry: { x: .8375, y: .2222222222222222, width: 280, height: 256, z: 0 },
            style: { backgroundColor: PALETTE_DEFAULTS.primaryColor, borderColor: PALETTE_DEFAULTS.secondaryColor, opacity: .88 },
            textStyle: { color: PALETTE_DEFAULTS.secondaryColor, opacity: 1, font: 'cascadia-mono', fontSize: 11, textAlign: 'left' },
            effects: { shadow: true, accentRail: true }, supportedEffects: ['shadow', 'accentRail'],
            flags: { supportsZAxis: true, defaultPresent: false },
        }),
    });
    const requiredIds = Object.freeze(Object.keys(registry).filter(id => registry[id].required));

    function clamp(value, minimum, maximum, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(maximum, Math.max(minimum, number));
    }

    function normalizeCanvas(value) {
        const canvas = value && typeof value === 'object' ? value : {};
        const grid = canvas.alignmentGrid && typeof canvas.alignmentGrid === 'object' ? canvas.alignmentGrid : {};
        return {
            width: clamp(canvas.width, 320, 3840, CANVAS.width),
            height: clamp(canvas.height, 180, 2160, CANVAS.height),
            sizingMode: SIZING_MODES.includes(canvas.sizingMode) ? canvas.sizingMode : CANVAS.sizingMode,
            collisionPolicy: 'no-overlap-closed',
            alignmentGrid: {
                enabled: grid.enabled !== false,
                unitWidth: clamp(grid.unitWidth, 2, 64, CANVAS.alignmentGrid.unitWidth),
                unitHeight: clamp(grid.unitHeight, 2, 64, CANVAS.alignmentGrid.unitHeight),
                visible: false,
            },
        };
    }

    function normalizePalette(value) {
        const source = value && typeof value === 'object' ? value : {};
        return {
            primaryColor: /^#[0-9a-f]{6}$/i.test(source.primaryColor) ? source.primaryColor.toLowerCase() : PALETTE_DEFAULTS.primaryColor,
            secondaryColor: /^#[0-9a-f]{6}$/i.test(source.secondaryColor) ? source.secondaryColor.toLowerCase() : PALETTE_DEFAULTS.secondaryColor,
        };
    }

    function normalizeStyle(value, rule) {
        const source = value && typeof value === 'object' ? value : {};
        const defaults = rule.default.style;
        const result = {};
        if (Object.hasOwn(defaults, 'backgroundColor')) {
            const candidate = source.backgroundColor || (rule.special === 'dynamic-base' ? source.color : null);
            result.backgroundColor = /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toLowerCase() : defaults.backgroundColor;
        }
        if (Object.hasOwn(defaults, 'borderColor')) result.borderColor = /^#[0-9a-f]{6}$/i.test(source.borderColor) ? source.borderColor.toLowerCase() : defaults.borderColor;
        if (rule.supportedProperties.includes('font')) result.font = Object.hasOwn(FONT_STACKS, source.font) ? source.font : defaults.font;
        if (rule.supportedProperties.includes('fontSize')) result.fontSize = clamp(source.fontSize, 8, TEXT_SIZE_MAXIMUM, defaults.fontSize);
        if (rule.supportedProperties.includes('textAlign')) result.textAlign = TEXT_ALIGNMENTS.includes(source.textAlign) ? source.textAlign : defaults.textAlign;
        if (rule.supportedProperties.includes('opacity')) result.opacity = clamp(source.opacity, rule.opacityMinimum ?? .2, 1, defaults.opacity ?? 1);
        if (rule.supportedProperties.includes('texture')) result.texture = DISC_TEXTURES.includes(source.texture) ? source.texture : defaults.texture;
        result.borderEnabled = source.borderEnabled === undefined ? defaults.borderEnabled !== false : source.borderEnabled !== false;
        result.cornerEnabled = rule.fixedRoundShape
            ? true
            : source.cornerEnabled === undefined ? defaults.cornerEnabled === true : source.cornerEnabled === true;
        result.cornerRadiusLevel = Math.round(clamp(
            source.cornerRadiusLevel,
            CORNER_RADIUS_LEVEL_MINIMUM,
            CORNER_RADIUS_LEVEL_MAXIMUM,
            defaults.cornerRadiusLevel || CORNER_RADIUS_LEVEL_MINIMUM,
        ));
        result.backgroundBlurEnabled = source.backgroundBlurEnabled === true;
        return result;
    }

    function textSizeLimits(canvas = CANVAS) {
        const scale = sizeScale(canvas);
        return { minimum: 8 * scale, maximum: TEXT_SIZE_MAXIMUM * scale };
    }

    function normalizeTextStyle(value, rule, canvas = CANVAS) {
        const source = value && typeof value === 'object' ? value : {};
        const defaults = rule.default.textStyle || {};
        const limits = textSizeLimits(canvas);
        const result = {};
        if (rule.supportedTextProperties.includes('color')) result.color = /^#[0-9a-f]{6}$/i.test(source.color) ? source.color.toLowerCase() : defaults.color;
        if (rule.supportedTextProperties.includes('font')) result.font = Object.hasOwn(FONT_STACKS, source.font) ? source.font : defaults.font;
        if (rule.supportedTextProperties.includes('fontSize')) result.fontSize = clamp(source.fontSize, limits.minimum, limits.maximum, defaults.fontSize * sizeScale(canvas));
        if (rule.supportedTextProperties.includes('textAlign')) result.textAlign = TEXT_ALIGNMENTS.includes(source.textAlign) ? source.textAlign : defaults.textAlign;
        if (rule.supportedTextProperties.includes('opacity')) result.opacity = clamp(source.opacity, 0, 1, defaults.opacity ?? 1);
        return result;
    }

    function normalizeEffects(value, rule) {
        const source = value && typeof value === 'object' ? value : {};
        return Object.fromEntries(rule.supportedEffects.map(name => [name, source[name] === undefined ? Boolean(rule.default.effects[name]) : Boolean(source[name])]));
    }

    function ensureTextFits(component, canvas = CANVAS) {
        const rule = registry[component?.id];
        if (!rule || !component?.textStyle || !component?.geometry) return component;
        const scale = sizeScale(canvas);
        const rawRequiredHeight = Math.ceil(component.textStyle.fontSize * 1.35 + 8 * scale);
        const requiredHeight = canvas.alignmentGrid?.enabled
            ? Math.ceil(rawRequiredHeight / canvas.alignmentGrid.unitHeight) * canvas.alignmentGrid.unitHeight
            : rawRequiredHeight;
        const maximumHeight = Math.min(
            canvas.height,
            Math.max(requiredHeight, rule.maxSize.height * scale, TEXT_SIZE_MAXIMUM * scale * 1.35 + 8 * scale),
        );
        component.geometry.height = clamp(component.geometry.height, requiredHeight, maximumHeight, requiredHeight);
        if (!rule.allowCanvasOverflow) {
            const halfY = component.geometry.height / (2 * canvas.height);
            component.geometry.y = clamp(component.geometry.y, halfY, 1 - halfY, rule.default.geometry.y);
        }
        if (component.arrangement?.split) {
            component.arrangement.partSize.height = clamp(
                component.arrangement.partSize.height,
                requiredHeight,
                maximumHeight,
                requiredHeight,
            );
            const halfY = component.arrangement.partSize.height / (2 * canvas.height);
            for (const part of Object.values(component.arrangement.positions)) {
                part.y = clamp(part.y, halfY, 1 - halfY, component.geometry.y);
            }
        }
        return component;
    }

    function rawGeometry(value) {
        if (value?.geometry && typeof value.geometry === 'object') return value.geometry;
        return value && typeof value === 'object' ? value : {};
    }

    function sizeScale(canvas = CANVAS) {
        return canvas.sizingMode === 'relative'
            ? Math.min(canvas.width / CANVAS.width, canvas.height / CANVAS.height)
            : 1;
    }

    function sizeLimits(idOrComponent, canvas = CANVAS) {
        const id = typeof idOrComponent === 'string' ? idOrComponent : idOrComponent?.type || idOrComponent?.id;
        const rule = registry[id];
        const scale = sizeScale(canvas);
        if (!rule) return { minWidth: 1, minHeight: 1, maxWidth: 3840, maxHeight: 2160 };
        const rawMaxHeight = Math.max(
            rule.maxSize.height * scale,
            rule.supportedTextProperties.length ? TEXT_SIZE_MAXIMUM * scale * 1.35 + 8 * scale : 0,
        );
        const gridMaxHeight = rule.supportedTextProperties.length && canvas.alignmentGrid?.enabled
            ? Math.ceil(rawMaxHeight / canvas.alignmentGrid.unitHeight) * canvas.alignmentGrid.unitHeight
            : rawMaxHeight;
        return {
            minWidth: rule.minSize.width * scale,
            minHeight: rule.minSize.height * scale,
            maxWidth: Math.min(canvas.width, rule.maxSize.width * scale),
            maxHeight: Math.min(canvas.height, gridMaxHeight),
        };
    }

    function clampSize(idOrComponent, width, height, canvas = CANVAS) {
        const id = typeof idOrComponent === 'string' ? idOrComponent : idOrComponent?.type || idOrComponent?.id;
        const rule = registry[id];
        const limits = sizeLimits(idOrComponent, canvas);
        if (!rule) return { width: clamp(width, limits.minWidth, limits.maxWidth, 1), height: clamp(height, limits.minHeight, limits.maxHeight, 1) };
        const scale = sizeScale(canvas);
        return {
            width: clamp(width, limits.minWidth, limits.maxWidth, rule.default.geometry.width * scale),
            height: clamp(height, limits.minHeight, limits.maxHeight, rule.default.geometry.height * scale),
        };
    }

    function fitGeometry(id, value, canvas, layer = { enabled: false }) {
        const rule = registry[id];
        const source = rawGeometry(value);
        let size = clampSize(id, source.width, source.height, canvas);
        const shouldSnap = rule.special !== 'dynamic-base' && canvas.alignmentGrid?.enabled;
        if (shouldSnap) {
            size = clampSize(
                id,
                Math.round(size.width / canvas.alignmentGrid.unitWidth) * canvas.alignmentGrid.unitWidth,
                Math.round(size.height / canvas.alignmentGrid.unitHeight) * canvas.alignmentGrid.unitHeight,
                canvas,
            );
        }
        const halfX = size.width / (2 * canvas.width);
        const halfY = size.height / (2 * canvas.height);
        const fallbackX = rule.default.geometry.x;
        const fallbackY = rule.default.geometry.y;
        const requestedX = Number.isFinite(Number(source.x)) ? Number(source.x) : fallbackX;
        const requestedY = Number.isFinite(Number(source.y)) ? Number(source.y) : fallbackY;
        const snappedX = shouldSnap ? Math.round(requestedX * canvas.width / canvas.alignmentGrid.unitWidth) * canvas.alignmentGrid.unitWidth / canvas.width : requestedX;
        const snappedY = shouldSnap ? Math.round(requestedY * canvas.height / canvas.alignmentGrid.unitHeight) * canvas.alignmentGrid.unitHeight / canvas.height : requestedY;
        return {
            x: clamp(snappedX, rule.allowCanvasOverflow ? 0 : halfX, rule.allowCanvasOverflow ? 1 : 1 - halfX, fallbackX),
            y: clamp(snappedY, rule.allowCanvasOverflow ? 0 : halfY, rule.allowCanvasOverflow ? 1 : 1 - halfY, fallbackY),
            width: size.width,
            height: size.height,
            z: rule.special === 'dynamic-base'
                ? rule.default.geometry.z
                : (layer.enabled ? clamp(source.z, -99, 99, rule.default.geometry.z) : 0),
        };
    }

    function fitPartGeometry(value, canvas, fallback, z = 0) {
        const source = value && typeof value === 'object' ? value : {};
        const scale = sizeScale(canvas);
        const limits = { minWidth: 64 * scale, maxWidth: 180 * scale, minHeight: 48 * scale, maxHeight: 112 * scale };
        let width = clamp(source.width, limits.minWidth, limits.maxWidth, fallback.width);
        let height = clamp(source.height, limits.minHeight, limits.maxHeight, fallback.height);
        if (canvas.alignmentGrid?.enabled) {
            width = clamp(Math.round(width / canvas.alignmentGrid.unitWidth) * canvas.alignmentGrid.unitWidth, limits.minWidth, limits.maxWidth, fallback.width);
            height = clamp(Math.round(height / canvas.alignmentGrid.unitHeight) * canvas.alignmentGrid.unitHeight, limits.minHeight, limits.maxHeight, fallback.height);
        }
        const halfX = width / (2 * canvas.width);
        const halfY = height / (2 * canvas.height);
        const rawX = Number.isFinite(Number(source.x)) ? Number(source.x) : fallback.x;
        const rawY = Number.isFinite(Number(source.y)) ? Number(source.y) : fallback.y;
        const x = canvas.alignmentGrid?.enabled ? Math.round(rawX * canvas.width / canvas.alignmentGrid.unitWidth) * canvas.alignmentGrid.unitWidth / canvas.width : rawX;
        const y = canvas.alignmentGrid?.enabled ? Math.round(rawY * canvas.height / canvas.alignmentGrid.unitHeight) * canvas.alignmentGrid.unitHeight / canvas.height : rawY;
        return { x: clamp(x, halfX, 1 - halfX, fallback.x), y: clamp(y, halfY, 1 - halfY, fallback.y), width, height, z };
    }

    function normalizeArrangement(source, rule, geometry, canvas) {
        if (!rule.supportsSplit) return null;
        const raw = source.arrangement && typeof source.arrangement === 'object' ? source.arrangement : {};
        const scale = sizeScale(canvas);
        const defaultSize = {
            width: rule.default.arrangement.partSize.width * scale,
            height: rule.default.arrangement.partSize.height * scale,
        };
        const partSize = fitPartGeometry(raw.partSize, canvas, { ...defaultSize, x: geometry.x, y: geometry.y }, geometry.z);
        const spacing = (partSize.width + (canvas.alignmentGrid?.unitWidth || 8)) / (2 * canvas.width);
        const derived = {
            previous: { x: geometry.x - spacing, y: geometry.y, width: partSize.width, height: partSize.height },
            next: { x: geometry.x + spacing, y: geometry.y, width: partSize.width, height: partSize.height },
        };
        const previous = fitPartGeometry(raw.positions?.previous, canvas, derived.previous, geometry.z);
        const next = fitPartGeometry(raw.positions?.next, canvas, derived.next, geometry.z);
        return {
            split: raw.split === true,
            partSize: { width: previous.width, height: previous.height },
            positions: {
                previous: { x: previous.x, y: previous.y },
                next: { x: next.x, y: next.y },
            },
        };
    }

    function componentRect(component, canvas = CANVAS, gap = 0) {
        const geometry = component?.geometry || component || {};
        const width = Number(geometry.width) || 0;
        const height = Number(geometry.height) || 0;
        const centerX = (Number(geometry.x) || 0) * canvas.width;
        const centerY = (Number(geometry.y) || 0) * canvas.height;
        return {
            left: centerX - width / 2 - gap,
            right: centerX + width / 2 + gap,
            top: centerY - height / 2 - gap,
            bottom: centerY + height / 2 + gap,
        };
    }

    function interactionGeometry(component, part = null) {
        if (!part || !component?.arrangement?.split || !component.arrangement.positions?.[part]) return { ...component.geometry };
        return {
            ...component.geometry,
            ...component.arrangement.partSize,
            ...component.arrangement.positions[part],
        };
    }

    function componentRects(component, canvas = CANVAS, gap = 0) {
        if (component?.arrangement?.split) {
            return ['previous', 'next'].map(part => componentRect(interactionGeometry(component, part), canvas, gap));
        }
        return [componentRect(component, canvas, gap)];
    }

    function anyRectsOverlap(left, right) {
        return left.some(leftRect => right.some(rightRect => rectsOverlap(leftRect, rightRect)));
    }

    function rectsOverlap(left, right) {
        return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
    }

    function collisionFor(component, components, canvas) {
        const rule = registry[component.id];
        if (!component.present || !rule?.boundary || rule.boundary.collision === false) return null;
        const candidate = componentRects(component, canvas, COLLISION_GAP / 2);
        const layer = effectiveZ(component);
        return components.find(other => {
            const otherRule = registry[other.id];
            return other.id !== component.id
                && other.present
                && otherRule?.boundary
                && otherRule.boundary.collision !== false
                && effectiveZ(other) === layer
                && anyRectsOverlap(candidate, componentRects(other, canvas, COLLISION_GAP / 2));
        }) || null;
    }

    function effectiveZ(component) {
        return component?.layer?.enabled ? Number(component.geometry?.z) || 0 : 0;
    }

    function physicalOverlapsFor(component, components, canvas, sameLayerOnly = true) {
        const rule = registry[component.id];
        if (!component.present || !rule?.boundary || rule.boundary.collision === false) return [];
        const candidate = componentRects(component, canvas, COLLISION_GAP / 2);
        return components.filter(other => {
            const otherRule = registry[other.id];
            return other.id !== component.id
                && other.present
                && otherRule?.boundary
                && otherRule.boundary.collision !== false
                && (!sameLayerOnly || effectiveZ(other) === effectiveZ(component))
                && anyRectsOverlap(candidate, componentRects(other, canvas, COLLISION_GAP / 2));
        });
    }

    function overlapGroupFor(layout, componentId) {
        const initial = getComponent(layout, componentId);
        if (!initial) return [];
        const group = [];
        const queued = [initial];
        const seen = new Set();
        while (queued.length) {
            const component = queued.shift();
            if (seen.has(component.id)) continue;
            seen.add(component.id);
            group.push(component);
            physicalOverlapsFor(component, layout.components, layout.canvas, true)
                .filter(other => !seen.has(other.id))
                .forEach(other => queued.push(other));
        }
        return group.length > 1 ? group : [];
    }

    function cloneLayout(layout) {
        return JSON.parse(JSON.stringify(layout));
    }

    function optimizeOverlapLayers(layout, componentId) {
        const next = cloneLayout(layout);
        const group = overlapGroupFor(next, componentId);
        if (!group.length || group.some(component => !registry[component.id]?.supportsZAxis)) return { layout: next, optimized: false, componentIds: [] };
        const target = group.find(component => component.id === componentId);
        const ordered = group.filter(component => component.id !== componentId).concat(target);
        const candidates = [0];
        for (let value = 1; value <= 99; value += 1) candidates.push(value, -value);
        for (const component of ordered) {
            component.layer.enabled = true;
            const occupied = new Set(physicalOverlapsFor(component, next.components, next.canvas, false).map(effectiveZ));
            const highest = occupied.size ? Math.max(...occupied) : -1;
            const preferredTargetZ = component.id === componentId && highest < 99 ? highest + 1 : undefined;
            const z = preferredTargetZ !== undefined && !occupied.has(preferredTargetZ)
                ? preferredTargetZ
                : candidates.find(value => !occupied.has(value));
            if (z === undefined) return { layout: cloneLayout(layout), optimized: false, componentIds: group.map(item => item.id) };
            component.geometry.z = z;
        }
        return { layout: updateDynamicBase(next), optimized: true, componentIds: ordered.map(component => component.id) };
    }

    function removeOverlapGroup(layout, componentId) {
        const next = cloneLayout(layout);
        const group = overlapGroupFor(next, componentId);
        group.forEach(component => { if (registry[component.id]?.removable) component.present = false; });
        return { layout: updateDynamicBase(next), removed: group.length > 0, componentIds: group.map(component => component.id) };
    }

    function findFreeGeometry(component, components, canvas) {
        const initial = fitGeometry(component.id, component.geometry, canvas, component.layer);
        if (!collisionFor({ ...component, geometry: initial }, components, canvas)) return initial;
        const halfWidth = initial.width / 2;
        const halfHeight = initial.height / 2;
        for (let top = halfHeight; top <= canvas.height - halfHeight; top += 16) {
            for (let left = halfWidth; left <= canvas.width - halfWidth; left += 16) {
                const geometry = { ...initial, x: left / canvas.width, y: top / canvas.height };
                if (!collisionFor({ ...component, geometry }, components, canvas)) return geometry;
            }
        }
        return null;
    }

    function sourceForId(sourceComponents, id) {
        const exact = sourceComponents.find(component => String(component?.type || component?.id || '') === id);
        if (exact) return exact;
        const legacyAliases = { 'panel-base': 'hud-root', 'track-title': 'track-info', 'source-selector': 'source-badge' };
        return sourceComponents.find(component => String(component?.type || component?.id || '') === legacyAliases[id]);
    }

    function normalizeComponent(value, id, canvas) {
        const rule = registry[id];
        const source = value && typeof value === 'object' ? value : {};
        const legacyScale = Number.isFinite(Number(source.scale)) ? Number(source.scale) : 1;
        const suppliedGeometry = rawGeometry(source);
        const layer = {
            enabled: Boolean(rule.zAxisAlways || (rule.supportsZAxis && source.layer?.enabled === true)),
        };
        const geometry = fitGeometry(id, {
            ...rule.default.geometry,
            ...suppliedGeometry,
            width: suppliedGeometry.width ?? rule.default.geometry.width * legacyScale,
            height: suppliedGeometry.height ?? rule.default.geometry.height * legacyScale,
        }, canvas, layer);
        const arrangement = normalizeArrangement(source, rule, geometry, canvas);
        const padding = clamp(source.boundary?.padding, 0, 96, rule.boundary?.padding || 0);
        const component = {
            id,
            type: id,
            present: rule.required || (source.present === undefined ? rule.defaultPresent !== false : source.present !== false),
            geometry,
            layer,
            ...(arrangement ? { arrangement } : {}),
            ...(rule.boundary ? { boundary: { state: 'closed', shape: rule.boundary.shape, collision: rule.boundary.collision, ...(rule.boundary.mode ? { mode: rule.boundary.mode, padding } : {}) } } : {}),
            style: normalizeStyle(source.style, rule),
            ...(rule.supportedTextProperties.length ? { textStyle: normalizeTextStyle(source.textStyle || { ...source.style, opacity: undefined }, rule, canvas) } : {}),
            effects: normalizeEffects(source.effects, rule),
        };
        return ensureTextFits(component, canvas);
    }

    function updateDynamicBase(layout) {
        const base = layout.components.find(component => component.id === 'panel-base');
        const visible = layout.components.filter(component => !['panel-base', 'disc'].includes(component.id) && component.present && component.boundary);
        if (!base) return layout;
        const layerValues = layout.components.filter(component => component.id !== 'panel-base' && component.present).map(effectiveZ);
        base.geometry.z = Math.min(0, ...layerValues) - 1;
        if (!visible.length) return layout;
        const padding = base.boundary.padding;
        const rectangles = visible.flatMap(component => componentRects(component, layout.canvas));
        const left = Math.max(0, Math.min(...rectangles.map(rect => rect.left)) - padding);
        const right = Math.min(layout.canvas.width, Math.max(...rectangles.map(rect => rect.right)) + padding);
        const top = Math.max(0, Math.min(...rectangles.map(rect => rect.top)) - padding);
        const bottom = Math.min(layout.canvas.height, Math.max(...rectangles.map(rect => rect.bottom)) + padding);
        const limits = sizeLimits('panel-base', layout.canvas);
        const width = Math.max(limits.minWidth, right - left);
        const height = Math.max(limits.minHeight, bottom - top);
        const baseLeft = clamp((left + right - width) / 2, 0, layout.canvas.width - width, 0);
        const baseTop = clamp((top + bottom - height) / 2, 0, layout.canvas.height - height, 0);
        base.geometry = {
            x: (baseLeft + width / 2) / layout.canvas.width,
            y: (baseTop + height / 2) / layout.canvas.height,
            width,
            height,
            z: base.geometry.z,
        };
        return layout;
    }

    function normalizeLayout(value) {
        const source = value && typeof value === 'object' ? value : {};
        const canvas = normalizeCanvas(source.canvas);
        const palette = normalizePalette(source.palette);
        const sourceComponents = Array.isArray(source.components) ? source.components : [];
        const components = [];
        for (const id of Object.keys(registry)) {
            const component = normalizeComponent(sourceForId(sourceComponents, id), id, canvas);
            component.style.borderColor = palette.secondaryColor;
            if (id !== 'panel-base' && component.present) component.geometry = findFreeGeometry(component, components, canvas) || component.geometry;
            components.push(component);
        }
        return updateDynamicBase({ version: VERSION, palette, canvas, components });
    }

    function createDefaultLayout() {
        return applyPalette(normalizeLayout({ version: VERSION, palette: PALETTE_DEFAULTS, canvas: CANVAS, components: Object.keys(registry).map(id => ({ id })) }), PALETTE_DEFAULTS, true);
    }

    function getComponent(layout, componentId) {
        return layout?.components?.find(component => component.id === componentId) || null;
    }

    function canDelete(componentId, layout) {
        const rule = registry[componentId];
        return Boolean(rule && rule.removable && getComponent(layout, componentId)?.present);
    }

    function availableComponents(layout) {
        const normalized = normalizeLayout(layout);
        return Object.values(registry).filter(rule => rule.catalog && !getComponent(normalized, rule.type)?.present);
    }

    function addComponent(layout, componentId) {
        const normalized = normalizeLayout(layout);
        const component = getComponent(normalized, componentId);
        const rule = registry[componentId];
        if (!component || !rule?.catalog || component.present) return { layout: normalized, added: false };
        component.present = true;
        component.geometry = findFreeGeometry(component, normalized.components, normalized.canvas);
        if (!component.geometry) {
            component.present = false;
            return { layout: updateDynamicBase(normalized), added: false };
        }
        return { layout: updateDynamicBase(normalized), added: true };
    }

    function removeComponent(layout, componentId) {
        const normalized = normalizeLayout(layout);
        const component = getComponent(normalized, componentId);
        if (!component || !canDelete(componentId, normalized)) return { layout: normalized, removed: false };
        component.present = false;
        return { layout: updateDynamicBase(normalized), removed: true };
    }

    function canPlace(layout, componentId, geometry) {
        const component = getComponent(layout, componentId);
        if (!component || component.id === 'panel-base') return { valid: false, collisionWith: null };
        const candidate = JSON.parse(JSON.stringify(component));
        candidate.geometry = fitGeometry(componentId, geometry, layout.canvas, component.layer);
        ensureTextFits(candidate, layout.canvas);
        const fitted = candidate.geometry;
        const collision = collisionFor({ ...component, geometry: fitted }, layout.components, layout.canvas);
        return { valid: !collision, collisionWith: collision?.id || null, geometry: fitted };
    }

    function fitInteractionGeometry(layout, componentId, part, geometry) {
        const component = getComponent(layout, componentId);
        if (!component) return null;
        if (!part || !component.arrangement?.split) {
            const candidate = JSON.parse(JSON.stringify(component));
            candidate.geometry = fitGeometry(componentId, geometry, layout.canvas, component.layer);
            ensureTextFits(candidate, layout.canvas);
            return candidate.geometry;
        }
        const current = interactionGeometry(component, part);
        const fitted = fitPartGeometry(geometry, layout.canvas, current, component.geometry.z);
        const candidate = JSON.parse(JSON.stringify(component));
        applyInteractionGeometry(candidate, part, fitted);
        ensureTextFits(candidate, layout.canvas);
        return interactionGeometry(candidate, part);
    }

    function applyInteractionGeometry(component, part, geometry) {
        if (!part || !component.arrangement?.split) {
            component.geometry = geometry;
            return;
        }
        component.arrangement.partSize = { width: geometry.width, height: geometry.height };
        component.arrangement.positions[part] = { x: geometry.x, y: geometry.y };
    }

    function canPlaceInteraction(layout, componentId, part, geometry) {
        const component = getComponent(layout, componentId);
        if (!component || component.id === 'panel-base') return { valid: false, collisionWith: null };
        const fitted = fitInteractionGeometry(layout, componentId, part, geometry);
        const candidate = cloneLayout(component);
        applyInteractionGeometry(candidate, part, fitted);
        const collision = collisionFor(candidate, layout.components, layout.canvas);
        return { valid: !collision, collisionWith: collision?.id || null, geometry: fitted };
    }

    function refreshBase(layout) {
        return updateDynamicBase(layout);
    }

    function updateAlignment(layout, enabled) {
        const next = cloneLayout(layout);
        next.canvas = normalizeCanvas({ ...next.canvas, alignmentGrid: { ...next.canvas?.alignmentGrid, enabled: Boolean(enabled) } });
        return normalizeLayout(next);
    }

    function applyPalette(layout, requested, force = false) {
        const next = cloneLayout(layout);
        const previous = normalizePalette(next.palette);
        const palette = normalizePalette({ ...previous, ...requested });
        const primaryChanged = force || palette.primaryColor !== previous.primaryColor;
        const secondaryChanged = force || palette.secondaryColor !== previous.secondaryColor;
        next.palette = palette;
        next.components.forEach(component => {
            if (primaryChanged) component.style.backgroundColor = palette.primaryColor;
            component.style.borderColor = palette.secondaryColor;
            if (secondaryChanged && component.textStyle) component.textStyle.color = palette.secondaryColor;
        });
        return normalizeLayout(next);
    }

    function updateSizingMode(layout, sizingMode) {
        const next = cloneLayout(layout);
        next.canvas.sizingMode = SIZING_MODES.includes(sizingMode) ? sizingMode : CANVAS.sizingMode;
        return normalizeLayout(next);
    }

    function updateViewport(layout, width, height) {
        const normalized = normalizeLayout(layout);
        const next = cloneLayout(normalized);
        const scaleX = Number(width) / next.canvas.width;
        const scaleY = Number(height) / next.canvas.height;
        const target = normalizeCanvas({
            ...next.canvas,
            width,
            height,
            ...(next.canvas.sizingMode === 'relative' ? { alignmentGrid: {
                ...next.canvas.alignmentGrid,
                unitWidth: next.canvas.alignmentGrid.unitWidth * scaleX,
                unitHeight: next.canvas.alignmentGrid.unitHeight * scaleY,
            } } : {}),
        });
        if (next.canvas.sizingMode === 'relative') {
            next.components.forEach(component => {
                component.geometry.width *= scaleX;
                component.geometry.height *= scaleY;
                if (component.arrangement) {
                    component.arrangement.partSize.width *= scaleX;
                    component.arrangement.partSize.height *= scaleY;
                }
                if (component.textStyle?.fontSize) component.textStyle.fontSize *= Math.min(scaleX, scaleY);
                if (component.boundary?.mode === 'dynamic-envelope') component.boundary.padding *= Math.min(scaleX, scaleY);
            });
        }
        next.canvas = target;
        return normalizeLayout(next);
    }

    function updateSplit(layout, componentId, enabled) {
        const normalized = normalizeLayout(layout);
        const component = getComponent(normalized, componentId);
        const rule = registry[componentId];
        if (!component?.arrangement || !rule?.supportsSplit) return { layout: normalized, updated: false };
        component.arrangement.split = Boolean(enabled);
        const collision = collisionFor(component, normalized.components, normalized.canvas);
        if (collision) return { layout: normalizeLayout(layout), updated: false, collisionWith: collision.id };
        return { layout: updateDynamicBase(normalized), updated: true, collisionWith: null };
    }

    function updateLayer(layout, componentId, requested = {}) {
        const normalized = normalizeLayout(layout);
        const component = getComponent(normalized, componentId);
        const rule = registry[componentId];
        if (!component || !rule?.supportsZAxis) return { layout: normalized, updated: false };
        component.layer.enabled = Boolean(rule.zAxisAlways || requested.enabled);
        component.geometry.z = component.layer.enabled
            ? clamp(requested.z, -99, 99, component.geometry.z)
            : 0;
        const collision = collisionFor(component, normalized.components, normalized.canvas);
        if (collision) return { layout: normalizeLayout(layout), updated: false, collisionWith: collision.id };
        return { layout: updateDynamicBase(normalized), updated: true, collisionWith: null };
    }

    function toCss(component, layout = { canvas: CANVAS }) {
        const geometry = component.geometry;
        const style = component.style || {};
        const textStyle = component.textStyle || style;
        return {
            '--lm-x': String(geometry.x * 100) + '%',
            '--lm-y': String(geometry.y * 100) + '%',
            '--lm-width': String(geometry.width / layout.canvas.width * 100) + '%',
            '--lm-height': String(geometry.height / layout.canvas.height * 100) + '%',
            '--lm-opacity': String(style.opacity ?? 1),
            '--lm-unit-opacity': String(style.opacity ?? 1),
            '--lm-surface-shadow-alpha': String((style.opacity ?? 1) * .35),
            '--lm-font-size': String((textStyle.fontSize ?? 14) / layout.canvas.width * 100) + 'cqw',
            '--lm-color': textStyle.color || layout.palette?.secondaryColor || PALETTE_DEFAULTS.secondaryColor,
            '--lm-text-opacity': String(textStyle.opacity ?? 1),
            '--lm-background-color': style.backgroundColor || layout.palette?.primaryColor || PALETTE_DEFAULTS.primaryColor,
            '--lm-secondary-color': layout.palette?.secondaryColor || PALETTE_DEFAULTS.secondaryColor,
            '--lm-border-color': layout.palette?.secondaryColor || PALETTE_DEFAULTS.secondaryColor,
            '--lm-border-width': style.borderEnabled === false ? '0px' : '1px',
            '--lm-border-radius': style.cornerEnabled && !registry[component.id]?.fixedRoundShape
                ? String(style.cornerRadiusLevel * CORNER_RADIUS_STEP_PX) + 'px'
                : '0px',
            '--lm-backdrop-filter': style.backgroundBlurEnabled ? 'blur(8px) saturate(.86)' : 'none',
            '--lm-font': FONT_STACKS[textStyle.font] || FONT_STACKS['cascadia-mono'],
            '--lm-text-align': textStyle.textAlign || 'left',
            '--lm-z': String((geometry.z ?? 0) + 101),
        };
    }

    function toPartCss(component, part, layout = { canvas: CANVAS }) {
        const geometry = interactionGeometry(component, part);
        return {
            '--lm-part-x': String(geometry.x * 100) + '%',
            '--lm-part-y': String(geometry.y * 100) + '%',
            '--lm-part-width': String(geometry.width / layout.canvas.width * 100) + '%',
            '--lm-part-height': String(geometry.height / layout.canvas.height * 100) + '%',
        };
    }

    globalThis.YtCdHudLiveMonitorComposer = Object.freeze({
        VERSION, STORAGE_KEY, LEGACY_STORAGE_KEY, CANVAS, VIEWPORT_PRESETS, SIZING_MODES, PALETTE_DEFAULTS, TEXT_SIZE_MAXIMUM,
        CORNER_RADIUS_LEVEL_MINIMUM, CORNER_RADIUS_LEVEL_MAXIMUM, CORNER_RADIUS_STEP_PX,
        COLLISION_GAP, FONT_STACKS, TEXT_ALIGNMENTS, DISC_TEXTURES, registry, requiredIds,
        normalizeLayout, createDefaultLayout, getComponent, canDelete, availableComponents, addComponent, removeComponent,
        normalizePalette, sizeScale, textSizeLimits, sizeLimits, clampSize, ensureTextFits, fitGeometry, fitInteractionGeometry, applyInteractionGeometry, interactionGeometry,
        componentRect, componentRects, rectsOverlap, effectiveZ, physicalOverlapsFor, overlapGroupFor,
        collisionFor, canPlace, canPlaceInteraction, refreshBase, updateAlignment, updateSplit, updateLayer,
        applyPalette, updateSizingMode, updateViewport, optimizeOverlapLayers, removeOverlapGroup, toCss, toPartCss,
    });
})();

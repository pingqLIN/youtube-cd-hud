/* YouTube CD HUD built-in panel presets. No storage writes or DOM side effects.
 *
 * Three-axis composition model
 *   L (Layout)   – which components are present, their rectangles and panel size.
 *   V (Language) – colour tokens, font, blur, disc texture, border/corner style.
 *   P (Purpose)  – preset binding; controls animation/effect caps.
 *
 * Layout families (L-axis)
 *   strip        360–440 × 72    title + time                          Purpose A
 *   desk         448–480 × 112   title + time + transport              Purpose A/B-lite
 *   booth        640 × 320       disc + title + time + source +        Purpose B
 *                                transport + tracklist + close
 *   booth-crate  640 × 352       booth + taller tracklist (Ledger)     Purpose B
 *   poster       520 × 280       large disc + large title + time       Purpose C
 *
 * Visual languages (V-axis, stored in LANGUAGES map)
 *   default    original grey/lime palette — full / compact / invisible
 *   quiet      Swiss/Braun grid, restraint — ambient-quiet (A)
 *   glass      Nothing/glass panel         — ambient-glass (A)
 *   booth-v    Technics/meter              — booth-work    (B)
 *   ledger     Pioneer density             — crate-ledger  (B)
 *   poster-v   B&O large, sparse           — shop-poster   (C)
 *   club       nightclub HUD               — club-window   (C)
 *
 * Purpose caps
 *   A  height ≤ 96 px, no tracklist/source, glow off, base opacity 0–0.45
 *   B  title+time+source+transport+tracklist, monospaced time, base ≥ 0.88
 *   C  disc ≥ 160 px, title fontSize ≥ 28, limited glow/disc-layer allowed
 */
(function (root) {
    'use strict';

    // ── META ─────────────────────────────────────────────────────────────────
    const META = Object.freeze([
        // tool / utility presets (v1.1.0 — id and behaviour frozen)
        Object.freeze({ id: 'full',     label: '全功能',   width: 640, height: 320, description: '唱片、播放控制與曲目清單' }),
        Object.freeze({ id: 'compact',  label: '精簡',     width: 448, height: 112, description: '曲名、時間與跳曲控制' }),
        Object.freeze({ id: 'invisible',label: '隱形提示', width: 360, height: 80,  description: '透明底座上的曲名與時間' }),
        // Purpose A — background audio (Phase 1: ambient-quiet; Phase 2: ambient-glass)
        Object.freeze({ id: 'ambient-quiet', label: '靜謐背景', width: 440, height: 72,
            description: '極窄條帶，曲名與時間；Braun 克制美學' }),
        // Purpose B — DJ / cue work (Phase 1: crate-ledger; Phase 2: booth-work)
        Object.freeze({ id: 'crate-ledger', label: '工作台', width: 640, height: 352,
            description: '高密度清單、等寬時間、來源選擇；Pioneer 工作面板' }),
        // Purpose C — storefront visual (Phase 1: shop-poster; Phase 2: club-window)
        Object.freeze({ id: 'shop-poster', label: '海報展示', width: 520, height: 280,
            description: '大唱片、大曲名；B&O 極簡陳設美學' }),
    ]);

    // ── RECTS ────────────────────────────────────────────────────────────────
    // Values are [x, y, width, height] in CSS px relative to the panel top-left.
    // Absent component keys → component.present = false.
    const RECTS = {
        // ── L: booth (original full) ────────────────────────────────────
        full: {
            'panel-base':         [0,   0,   640, 320],
            'disc':               [16,  16,  128, 128],
            'track-title':        [160, 16,  392, 48 ],
            'close-control':      [560, 16,  64,  48 ],
            'time-readout':       [160, 72,  192, 40 ],
            'source-selector':    [360, 72,  264, 40 ],
            'transport-controls': [160, 120, 160, 48 ],
            'tracklist-panel':    [16,  184, 608, 120],
        },
        // ── L: desk (original compact) ──────────────────────────────────
        compact: {
            'panel-base':         [0,  0,  448, 112],
            'track-title':        [16, 8,  416, 40 ],
            'time-readout':       [16, 60, 240, 44 ],
            'transport-controls': [264,60, 168, 44 ],
        },
        // ── L: strip-ghost (original invisible) ─────────────────────────
        invisible: {
            'panel-base':   [0, 0,  360, 80],
            'track-title':  [0, 0,  360, 40],
            'time-readout': [0, 48, 240, 32],
        },
        // ── L: strip (Purpose A) — ambient-quiet ────────────────────────
        'ambient-quiet': {
            'panel-base':   [0,  0,  440, 72],
            'track-title':  [16, 12, 296, 28],
            'time-readout': [324,16, 100, 20],
        },
        // ── L: booth-crate (Purpose B) — crate-ledger (taller tracklist) ──
        'crate-ledger': {
            'panel-base':         [0,   0,   640, 352],
            'disc':               [16,  16,  128, 128],
            'track-title':        [160, 16,  376, 48 ],  // right edge: 536; leaves 8px gap to close-control
            'close-control':      [544, 16,  80,  48 ],  // x=544, right edge: 624
            'time-readout':       [160, 72,  192, 40 ],  // bottom=112; gap to transport-controls top=124 → 12≥8
            'source-selector':    [360, 72,  264, 40 ],
            'transport-controls': [160, 124, 160, 48 ],
            'tracklist-panel':    [16,  184, 608, 152],
        },
        // ── L: poster (Purpose C) — shop-poster ─────────────────────────
        'shop-poster': {
            'panel-base':   [0,   0,   520, 280],
            'disc':         [32,  36,  176, 176],
            'track-title':  [228, 40,  260, 48 ],  // right=488
            'time-readout': [228, 104, 200, 32 ],
            'close-control':[16,  8,   24,  24 ],  // top-left, far from track-title
        },
    };

    // ── VISUAL LANGUAGES ─────────────────────────────────────────────────────
    // Token objects; undefined keys fall through to 'default'.
    const LANGUAGES = {
        // original grey/lime — full / compact / invisible
        default: {
            palette:  { primaryColor: '#404549', secondaryColor: '#c5ee65' },
            base:     { opacity: 1, secondaryOpacity: .2, backgroundEnabled: true, borderEnabled: true,
                        cornerEnabled: true, backgroundBlurEnabled: false },
            disc:     { texture: 'classic', secondaryOpacity: .65 },
            time:     { color: '#c5ee65', font: 'cascadia-mono', fontSize: 14 },
            title:    { color: '#e8ece8', font: 'Segoe UI' /* fontSize: per-id below */ },
            surface:  { titleBg: '#4a4e52', controlBg: '#2d3135' },
        },
        // Quiet — Swiss / Braun; Purpose A
        quiet: {
            palette:  { primaryColor: '#1c1c1c', secondaryColor: '#c8c4b8' },
            base:     { opacity: 0.32, secondaryOpacity: 0, backgroundEnabled: true, borderEnabled: false,
                        cornerEnabled: true, backgroundBlurEnabled: false },
            time:     { color: '#c8c4b8', font: 'cascadia-mono', fontSize: 13 },
            title:    { color: '#d8d4cc', font: 'Segoe UI', fontSize: 16 },
        },
        // Glass — Nothing / glass panel; Purpose A
        glass: {
            palette:  { primaryColor: '#0b0d10', secondaryColor: '#e8eaef' },
            base:     { opacity: 0.38, secondaryOpacity: .12, backgroundEnabled: true, borderEnabled: true,
                        cornerEnabled: true, backgroundBlurEnabled: true },
            time:     { color: '#e8eaef', font: 'cascadia-mono', fontSize: 13 },
            title:    { color: '#e8eaef', font: 'Segoe UI', fontSize: 15 },
        },
        // Booth-v — Technics / meter; Purpose B
        'booth-v': {
            palette:  { primaryColor: '#2a2c2e', secondaryColor: '#d7a84a' },
            base:     { opacity: 1, secondaryOpacity: .15, backgroundEnabled: true, borderEnabled: true,
                        cornerEnabled: true, backgroundBlurEnabled: false },
            disc:     { texture: 'classic', secondaryOpacity: .55 },
            time:     { color: '#d7a84a', font: 'cascadia-mono', fontSize: 16 },
            title:    { color: '#f0ede8', font: 'Segoe UI', fontSize: 20 },
            surface:  { controlBg: '#1f2123' },
        },
        // Ledger — Pioneer density; Purpose B
        ledger: {
            palette:  { primaryColor: '#12141a', secondaryColor: '#3ad0e8' },
            base:     { opacity: 1, secondaryOpacity: .18, backgroundEnabled: true, borderEnabled: true,
                        cornerEnabled: true, backgroundBlurEnabled: false },
            disc:     { texture: 'classic', secondaryOpacity: .55 },
            time:     { color: '#3ad0e8', font: 'cascadia-mono', fontSize: 16 },
            title:    { color: '#eef2f4', font: 'Segoe UI', fontSize: 20 },
            surface:  { controlBg: '#1a1d26' },
        },
        // Poster-v — B&O large, sparse; Purpose C
        'poster-v': {
            palette:  { primaryColor: '#0a0a0a', secondaryColor: '#f2efe8' },
            base:     { opacity: 1, secondaryOpacity: 0, backgroundEnabled: true, borderEnabled: false,
                        cornerEnabled: false, backgroundBlurEnabled: false },
            disc:     { texture: 'gold', secondaryOpacity: .70, layerEnabled: false },
            time:     { color: '#a09a90', font: 'cascadia-mono', fontSize: 13 },
            title:    { color: '#f2efe8', font: 'Segoe UI', fontSize: 32 },
        },
        // Club — nightclub HUD, limited neon; Purpose C
        club: {
            palette:  { primaryColor: '#07060c', secondaryColor: '#ff3cad' },
            base:     { opacity: 1, secondaryOpacity: .22, backgroundEnabled: true, borderEnabled: true,
                        cornerEnabled: true, backgroundBlurEnabled: false },
            disc:     { texture: 'classic', secondaryOpacity: .65, layerEnabled: true },
            time:     { color: '#ff3cad', font: 'cascadia-mono', fontSize: 14 },
            title:    { color: '#f8f0f6', font: 'Segoe UI', fontSize: 28 },
        },
    };

    // Visual language assigned to each preset id.
    const PRESET_LANGUAGE = {
        'full':          'default',
        'compact':       'default',
        'invisible':     'default',
        'ambient-quiet': 'quiet',
        'ambient-glass': 'glass',
        'booth-work':    'booth-v',
        'crate-ledger':  'ledger',
        'shop-poster':   'poster-v',
        'club-window':   'club',
    };

    const IDS = ['panel-base', 'disc', 'track-title', 'time-readout', 'source-selector',
        'tracklist-toggle', 'transport-controls', 'close-control', 'text-size-control', 'tracklist-panel'];

    // ── Language applicator ───────────────────────────────────────────────────
    // Applies visual language tokens to a single component in-place.
    // 'default' language reproduces the original v1.1.0 styling exactly.
    function applyLanguage(component, lang, id) {
        const L = LANGUAGES[lang] || LANGUAGES.default;
        const D = LANGUAGES.default;
        const pal = L.palette || D.palette;

        if (component.id === 'panel-base') {
            const b = L.base || D.base;
            component.style.backgroundColor    = pal.primaryColor;
            component.style.borderColor         = pal.secondaryColor;
            component.style.backgroundEnabled   = id !== 'invisible' && b.backgroundEnabled !== false;
            component.style.borderEnabled       = id !== 'invisible' && b.borderEnabled !== false;
            component.style.backgroundBlurEnabled = b.backgroundBlurEnabled || false;
            component.style.opacity             = id === 'invisible' ? 0 : b.opacity;
            component.style.secondaryOpacity    = id === 'invisible' ? 0 : (b.secondaryOpacity ?? .2);
            component.style.cornerEnabled       = b.cornerEnabled !== false;
            component.boundary.padding          = 16;
            return;
        }

        if (component.id === 'disc') {
            const d = L.disc || D.disc;
            component.style.backgroundColor    = pal.primaryColor;
            component.style.borderColor         = pal.secondaryColor;
            component.style.backgroundEnabled   = true;
            component.style.borderEnabled       = true;
            component.style.cornerEnabled       = false;
            component.style.secondaryOpacity    = d.secondaryOpacity ?? .65;
            component.style.texture             = d.texture || 'classic';
            component.layer                     = { enabled: d.layerEnabled === true };
            return;
        }

        if (component.id === 'time-readout') {
            const t = L.time || D.time;
            component.style.backgroundEnabled   = false;
            component.style.borderEnabled       = false;
            component.style.cornerEnabled       = false;
            if (component.textStyle) {
                component.textStyle = { color: t.color, opacity: 1,
                    font: t.font || 'cascadia-mono', fontSize: t.fontSize || 14, textAlign: 'left' };
            }
            return;
        }

        if (component.id === 'track-title') {
            const tl = L.title || D.title;
            // fontSize: language-provided, or legacy per-id fallback for 'default'
            const fontSize = tl.fontSize !== undefined ? tl.fontSize : (id === 'full' ? 20 : 18);
            if (lang === 'default' && id !== 'invisible') {
                component.style.backgroundEnabled = true;
                component.style.backgroundColor   = D.surface.titleBg;
            }
            if (component.textStyle) {
                component.textStyle = { color: tl.color, opacity: 1,
                    font: tl.font || 'Segoe UI', fontSize, textAlign: 'left' };
            }
            return;
        }

        if (component.id === 'tracklist-panel') {
            const tl = L.title || D.title;
            const ctrlBg = (L.surface?.controlBg) || D.surface.controlBg;
            if (lang === 'default') {
                component.style.backgroundEnabled = true;
                component.style.backgroundColor   = ctrlBg;
            } else {
                component.style.backgroundEnabled = true;
                component.style.backgroundColor   = ctrlBg || pal.primaryColor;
            }
            if (component.textStyle) {
                component.textStyle = { color: tl.color, opacity: 1,
                    font: 'Segoe UI', fontSize: 14, textAlign: 'left' };
            }
            return;
        }

        const isControl = ['transport-controls', 'tracklist-toggle', 'text-size-control',
            'close-control', 'source-selector'].includes(component.id);
        if (isControl && id !== 'invisible') {
            const ctrlBg = (L.surface?.controlBg) || D.surface.controlBg;
            component.style.backgroundEnabled = true;
            component.style.borderEnabled     = true;
            component.style.cornerEnabled     = true;
            component.style.backgroundColor   = ctrlBg || pal.primaryColor;
            component.style.borderColor       = pal.secondaryColor;
            if (component.textStyle) {
                const tl = L.title || D.title;
                component.textStyle = { color: tl.color, opacity: 1,
                    font: 'Segoe UI', fontSize: 14, textAlign: 'center' };
            }
        }
    }

    function create(id, composer) {
        const preset = META.find(item => item.id === id);
        if (!preset) throw new RangeError('Unknown HUD panel preset: ' + id);
        if (!composer || composer.VERSION !== 2 || typeof composer.createDefaultLayout !== 'function'
            || typeof composer.normalizeLayout !== 'function') {
            throw new TypeError('A compatible YouTube CD HUD v2 composer is required.');
        }
        // Built-in presets start from the schema, not the independently authored install default.
        const layout = composer.normalizeLayout({ version: 2, components: Object.keys(composer.registry).map(cid => ({ id: cid })) });
        if (layout.components.length !== IDS.length || IDS.some(key => !layout.components.some(c => c.id === key))) {
            throw new TypeError('The composer component registry differs from this preset pack.');
        }
        layout.canvas = { width: 1280, height: 720, sizingMode: 'absolute',
            collisionPolicy: 'no-overlap-closed',
            alignmentGrid: { enabled: true, unitWidth: 4, unitHeight: 4, visible: false } };

        const lang = PRESET_LANGUAGE[id] || 'default';
        const L = LANGUAGES[lang] || LANGUAGES.default;
        layout.palette = { ...(L.palette || LANGUAGES.default.palette) };

        // Fixed base prevents normalization from reflowing the authored composition.
        layout.manualBase = true;
        layout.locked = false;
        const left = (layout.canvas.width - preset.width) / 2;
        const top = (layout.canvas.height - preset.height) / 2;
        for (const component of layout.components) {
            const rect = (RECTS[id] || {})[component.id];
            component.present = Boolean(rect);
            component.locked = false;
            delete component.hidden;
            component.layer = { enabled: false };
            component.effects = Object.fromEntries(Object.keys(component.effects || {}).map(key => [key, false]));
            component.style = {
                ...component.style,
                backgroundColor: layout.palette.primaryColor,
                borderColor: layout.palette.secondaryColor,
                opacity: 1, secondaryOpacity: .28, borderEnabled: false,
                backgroundEnabled: false, backgroundBlurEnabled: false,
                cornerEnabled: component.id === 'disc', cornerRadiusLevel: 3,
            };
            if (component.arrangement) component.arrangement.split = false;
            // Apply the visual language for this component.
            applyLanguage(component, lang, id);
            if (rect) {
                const [x, y, width, height] = rect;
                component.geometry = { x: (left + x + width / 2) / 1280,
                    y: (top + y + height / 2) / 720, width, height,
                    z: component.id === 'panel-base' ? -1 : component.id === 'disc' ? 1 : 0 };
            }
        }
        return composer.normalizeLayout(layout);
    }

    function exportCode(id, composer) {
        return JSON.stringify({ format: 'youtube-cd-hud-panel', version: 1, layout: create(id, composer) }, null, 2);
    }

    root.YtCdHudPanelPack = Object.freeze({ version: '1.2.0', presets: META, create, exportCode });
})(globalThis);

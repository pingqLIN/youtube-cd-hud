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
 * Visual languages (V-axis, stored as validated role Skin data)
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
        Object.freeze({ id: 'cdj-inspired', label: 'CDJ 風格', width: 448, height: 640, optIn: true,
            description: '直式資訊螢幕與大型唱盤；僅使用來源、曲目、時間、跳曲與 scrub 既有功能' }),
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
        'cdj-inspired': {
            'panel-base': [0, 0, 448, 640],
            'source-selector': [24, 24, 272, 32],
            'close-control': [376, 24, 48, 32],
            'track-title': [24, 72, 400, 40],
            'time-readout': [24, 128, 280, 40],
            'tracklist-panel': [24, 184, 400, 120],
            'disc': [112, 328, 304, 304],
            'transport-controls': [24, 432, 128, 48],
        },
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
    const DISC_LAYERS = {"cdj-inspired":true,"full":true,"compact":true,"invisible":true,"ambient-quiet":true,"crate-ledger":true,"shop-poster":true};

    const IDS = ['panel-base', 'disc', 'track-title', 'time-readout', 'source-selector',
        'tracklist-toggle', 'transport-controls', 'close-control', 'text-size-control', 'tracklist-panel'];

    // Validated presentation data, independent of component IDs and geometry.
    const SKINS = {
        "cdj-inspired": {
    "format": "youtube-cd-hud-skin",
    "schemaVersion": 1,
    "tokens": {
        "primaryColor": "#17191c",
        "secondaryColor": "#c9d0d6"
    },
    "roles": {
        "close-control": {
            "effects": {},
            "surface": {
                "backgroundColor": "#17191c",
                "borderColor": "#626d78",
                "opacity": 1,
                "secondaryOpacity": 1,
                "borderEnabled": true,
                "backgroundEnabled": true,
                "cornerEnabled": true,
                "cornerRadiusLevel": 2,
                "backgroundBlurEnabled": false
            },
            "text": {
                "color": "#e8edf2",
                "font": "Segoe UI",
                "fontSize": 20,
                "fontWeight": 500,
                "textAlign": "center",
                "opacity": 1
            }
        },
        "disc": {
            "effects": {
                "glow": false
            },
            "surface": {
                "backgroundColor": "#101316",
                "borderColor": "#c9d0d6",
                "opacity": 1,
                "secondaryOpacity": 1,
                "borderEnabled": true,
                "backgroundEnabled": true,
                "cornerEnabled": true,
                "cornerRadiusLevel": 3,
                "backgroundBlurEnabled": false,
                "texture": "jog",
                "discOpacity": 1
            }
        },
        "panel-base": {
            "effects": {
                "accentRail": false,
                "shadow": false
            },
            "surface": {
                "backgroundColor": "#17191c",
                "borderColor": "#50565d",
                "opacity": 1,
                "secondaryOpacity": 1,
                "borderEnabled": true,
                "backgroundEnabled": true,
                "cornerEnabled": true,
                "cornerRadiusLevel": 5,
                "backgroundBlurEnabled": false
            }
        },
        "source-selector": {
            "effects": {
                "statusLamp": true
            },
            "surface": {
                "backgroundColor": "#17202b",
                "borderColor": "#567b9f",
                "opacity": 1,
                "secondaryOpacity": 1,
                "borderEnabled": true,
                "backgroundEnabled": true,
                "cornerEnabled": true,
                "cornerRadiusLevel": 2,
                "backgroundBlurEnabled": false
            },
            "text": {
                "color": "#91c5ff",
                "font": "Segoe UI",
                "fontSize": 13,
                "fontWeight": 600,
                "textAlign": "center",
                "opacity": 1
            }
        },
        "text-size-control": {
            "effects": {},
            "surface": {
                "backgroundColor": "#17191c",
                "borderColor": "#41474e",
                "opacity": 1,
                "secondaryOpacity": 1,
                "borderEnabled": true,
                "backgroundEnabled": true,
                "cornerEnabled": true,
                "cornerRadiusLevel": 3,
                "backgroundBlurEnabled": false
            },
            "text": {
                "color": "#e8edf2",
                "font": "Segoe UI",
                "fontSize": 14,
                "fontWeight": 500,
                "textAlign": "left",
                "opacity": 1
            }
        },
        "time-readout": {
            "effects": {},
            "surface": {
                "backgroundColor": "#090c0f",
                "borderColor": "#41474e",
                "opacity": 1,
                "secondaryOpacity": 1,
                "borderEnabled": false,
                "backgroundEnabled": true,
                "cornerEnabled": true,
                "cornerRadiusLevel": 1,
                "backgroundBlurEnabled": false
            },
            "text": {
                "color": "#ffd079",
                "font": "consolas",
                "fontSize": 22,
                "fontWeight": 500,
                "textAlign": "left",
                "opacity": 1
            }
        },
        "track-title": {
            "effects": {
                "marquee": false
            },
            "surface": {
                "backgroundColor": "#090c0f",
                "borderColor": "#41474e",
                "opacity": 1,
                "secondaryOpacity": 1,
                "borderEnabled": false,
                "backgroundEnabled": true,
                "cornerEnabled": true,
                "cornerRadiusLevel": 1,
                "backgroundBlurEnabled": false
            },
            "text": {
                "color": "#f3f5f7",
                "font": "Segoe UI",
                "fontSize": 20,
                "fontWeight": 600,
                "textAlign": "left",
                "opacity": 1
            }
        },
        "tracklist-panel": {
            "effects": {
                "accentRail": false,
                "shadow": false
            },
            "surface": {
                "backgroundColor": "#090c0f",
                "borderColor": "#3d4957",
                "opacity": 1,
                "secondaryOpacity": 1,
                "borderEnabled": true,
                "backgroundEnabled": true,
                "cornerEnabled": true,
                "cornerRadiusLevel": 1,
                "backgroundBlurEnabled": false
            },
            "text": {
                "color": "#e0e7ed",
                "font": "Segoe UI",
                "fontSize": 14,
                "fontWeight": 400,
                "textAlign": "left",
                "opacity": 1
            }
        },
        "tracklist-toggle": {
            "effects": {},
            "surface": {
                "backgroundColor": "#17191c",
                "borderColor": "#41474e",
                "opacity": 1,
                "secondaryOpacity": 1,
                "borderEnabled": true,
                "backgroundEnabled": true,
                "cornerEnabled": true,
                "cornerRadiusLevel": 3,
                "backgroundBlurEnabled": false
            },
            "text": {
                "color": "#e8edf2",
                "font": "Segoe UI",
                "fontSize": 14,
                "fontWeight": 500,
                "textAlign": "left",
                "opacity": 1
            }
        },
        "transport-controls": {
            "effects": {},
            "surface": {
                "backgroundColor": "#272c31",
                "borderColor": "#b0becb",
                "opacity": 1,
                "secondaryOpacity": 1,
                "borderEnabled": true,
                "backgroundEnabled": true,
                "cornerEnabled": true,
                "cornerRadiusLevel": 10,
                "backgroundBlurEnabled": false
            },
            "text": {
                "color": "#f2f5f8",
                "font": "Segoe UI",
                "fontSize": 12,
                "fontWeight": 600,
                "textAlign": "center",
                "opacity": 1
            }
        }
    }
},
    "full": {
        "format": "youtube-cd-hud-skin",
        "schemaVersion": 1,
        "tokens": {
            "primaryColor": "#404549",
            "secondaryColor": "#c5ee65"
        },
        "roles": {
            "panel-base": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.2
                },
                "effects": {
                    "shadow": false,
                    "accentRail": false
                }
            },
            "disc": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "texture": "classic",
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.65
                },
                "effects": {
                    "glow": false
                }
            },
            "track-title": {
                "surface": {
                    "backgroundColor": "#4a4e52",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 20,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {
                    "marquee": false
                }
            },
            "time-readout": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#c5ee65",
                    "font": "cascadia-mono",
                    "fontSize": 14,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {}
            },
            "source-selector": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {
                    "statusLamp": false
                }
            },
            "tracklist-toggle": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "transport-controls": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "close-control": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "text-size-control": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "tracklist-panel": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {
                    "shadow": false,
                    "accentRail": false
                }
            }
        }
    },
    "compact": {
        "format": "youtube-cd-hud-skin",
        "schemaVersion": 1,
        "tokens": {
            "primaryColor": "#404549",
            "secondaryColor": "#c5ee65"
        },
        "roles": {
            "panel-base": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.2
                },
                "effects": {
                    "shadow": false,
                    "accentRail": false
                }
            },
            "disc": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "texture": "classic",
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.65
                },
                "effects": {
                    "glow": false
                }
            },
            "track-title": {
                "surface": {
                    "backgroundColor": "#4a4e52",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 18,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {
                    "marquee": false
                }
            },
            "time-readout": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#c5ee65",
                    "font": "cascadia-mono",
                    "fontSize": 14,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {}
            },
            "source-selector": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {
                    "statusLamp": false
                }
            },
            "tracklist-toggle": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "transport-controls": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "close-control": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "text-size-control": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "tracklist-panel": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {
                    "shadow": false,
                    "accentRail": false
                }
            }
        }
    },
    "invisible": {
        "format": "youtube-cd-hud-skin",
        "schemaVersion": 1,
        "tokens": {
            "primaryColor": "#404549",
            "secondaryColor": "#c5ee65"
        },
        "roles": {
            "panel-base": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 0,
                    "borderEnabled": false,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0,
                    "backgroundEnabled": false
                },
                "effects": {
                    "shadow": false,
                    "accentRail": false
                }
            },
            "disc": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "texture": "classic",
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.65
                },
                "effects": {
                    "glow": false
                }
            },
            "track-title": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 18,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {
                    "marquee": false
                }
            },
            "time-readout": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#c5ee65",
                    "font": "cascadia-mono",
                    "fontSize": 14,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {}
            },
            "source-selector": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#63b3ed",
                    "font": "cascadia-mono",
                    "fontSize": 9,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {
                    "statusLamp": false
                }
            },
            "tracklist-toggle": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#63b3ed",
                    "font": "cascadia-mono",
                    "fontSize": 11,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "transport-controls": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#63b3ed",
                    "font": "cascadia-mono",
                    "fontSize": 9,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "close-control": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#63b3ed",
                    "font": "cascadia-mono",
                    "fontSize": 16,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "text-size-control": {
                "surface": {
                    "backgroundColor": "#404549",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#63b3ed",
                    "font": "cascadia-mono",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "tracklist-panel": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c5ee65",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#e8ece8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {
                    "shadow": false,
                    "accentRail": false
                }
            }
        }
    },
    "ambient-quiet": {
        "format": "youtube-cd-hud-skin",
        "schemaVersion": 1,
        "tokens": {
            "primaryColor": "#1c1c1c",
            "secondaryColor": "#c8c4b8"
        },
        "roles": {
            "panel-base": {
                "surface": {
                    "backgroundColor": "#1c1c1c",
                    "borderColor": "#c8c4b8",
                    "opacity": 0.32,
                    "borderEnabled": false,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0
                },
                "effects": {
                    "shadow": false,
                    "accentRail": false
                }
            },
            "disc": {
                "surface": {
                    "backgroundColor": "#1c1c1c",
                    "borderColor": "#c8c4b8",
                    "opacity": 1,
                    "texture": "classic",
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.65
                },
                "effects": {
                    "glow": false
                }
            },
            "track-title": {
                "surface": {
                    "backgroundColor": "#1c1c1c",
                    "borderColor": "#c8c4b8",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#d8d4cc",
                    "font": "Segoe UI",
                    "fontSize": 16,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {
                    "marquee": false
                }
            },
            "time-readout": {
                "surface": {
                    "backgroundColor": "#1c1c1c",
                    "borderColor": "#c8c4b8",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#c8c4b8",
                    "font": "cascadia-mono",
                    "fontSize": 13,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {}
            },
            "source-selector": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c8c4b8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#d8d4cc",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {
                    "statusLamp": false
                }
            },
            "tracklist-toggle": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c8c4b8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#d8d4cc",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "transport-controls": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c8c4b8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#d8d4cc",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "close-control": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c8c4b8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#d8d4cc",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "text-size-control": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c8c4b8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#d8d4cc",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "tracklist-panel": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#c8c4b8",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#d8d4cc",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {
                    "shadow": false,
                    "accentRail": false
                }
            }
        }
    },
    "crate-ledger": {
        "format": "youtube-cd-hud-skin",
        "schemaVersion": 1,
        "tokens": {
            "primaryColor": "#12141a",
            "secondaryColor": "#3ad0e8"
        },
        "roles": {
            "panel-base": {
                "surface": {
                    "backgroundColor": "#12141a",
                    "borderColor": "#3ad0e8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.18
                },
                "effects": {
                    "shadow": false,
                    "accentRail": false
                }
            },
            "disc": {
                "surface": {
                    "backgroundColor": "#12141a",
                    "borderColor": "#3ad0e8",
                    "opacity": 1,
                    "texture": "classic",
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.55
                },
                "effects": {
                    "glow": false
                }
            },
            "track-title": {
                "surface": {
                    "backgroundColor": "#12141a",
                    "borderColor": "#3ad0e8",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#eef2f4",
                    "font": "Segoe UI",
                    "fontSize": 20,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {
                    "marquee": false
                }
            },
            "time-readout": {
                "surface": {
                    "backgroundColor": "#12141a",
                    "borderColor": "#3ad0e8",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#3ad0e8",
                    "font": "cascadia-mono",
                    "fontSize": 16,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {}
            },
            "source-selector": {
                "surface": {
                    "backgroundColor": "#1a1d26",
                    "borderColor": "#3ad0e8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#eef2f4",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {
                    "statusLamp": false
                }
            },
            "tracklist-toggle": {
                "surface": {
                    "backgroundColor": "#1a1d26",
                    "borderColor": "#3ad0e8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#eef2f4",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "transport-controls": {
                "surface": {
                    "backgroundColor": "#1a1d26",
                    "borderColor": "#3ad0e8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#eef2f4",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "close-control": {
                "surface": {
                    "backgroundColor": "#1a1d26",
                    "borderColor": "#3ad0e8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#eef2f4",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "text-size-control": {
                "surface": {
                    "backgroundColor": "#1a1d26",
                    "borderColor": "#3ad0e8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#eef2f4",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "tracklist-panel": {
                "surface": {
                    "backgroundColor": "#1a1d26",
                    "borderColor": "#3ad0e8",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#eef2f4",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {
                    "shadow": false,
                    "accentRail": false
                }
            }
        }
    },
    "shop-poster": {
        "format": "youtube-cd-hud-skin",
        "schemaVersion": 1,
        "tokens": {
            "primaryColor": "#0a0a0a",
            "secondaryColor": "#f2efe8"
        },
        "roles": {
            "panel-base": {
                "surface": {
                    "backgroundColor": "#0a0a0a",
                    "borderColor": "#f2efe8",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0
                },
                "effects": {
                    "shadow": false,
                    "accentRail": false
                }
            },
            "disc": {
                "surface": {
                    "backgroundColor": "#0a0a0a",
                    "borderColor": "#f2efe8",
                    "opacity": 1,
                    "texture": "gold",
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.7
                },
                "effects": {
                    "glow": false
                }
            },
            "track-title": {
                "surface": {
                    "backgroundColor": "#0a0a0a",
                    "borderColor": "#f2efe8",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#f2efe8",
                    "font": "Segoe UI",
                    "fontSize": 32,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {
                    "marquee": false
                }
            },
            "time-readout": {
                "surface": {
                    "backgroundColor": "#0a0a0a",
                    "borderColor": "#f2efe8",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28,
                    "backgroundEnabled": false
                },
                "text": {
                    "color": "#a09a90",
                    "font": "cascadia-mono",
                    "fontSize": 13,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {}
            },
            "source-selector": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#f2efe8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#f2efe8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {
                    "statusLamp": false
                }
            },
            "tracklist-toggle": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#f2efe8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#f2efe8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "transport-controls": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#f2efe8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#f2efe8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "close-control": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#f2efe8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#f2efe8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "text-size-control": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#f2efe8",
                    "opacity": 1,
                    "borderEnabled": true,
                    "cornerEnabled": true,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#f2efe8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "center",
                    "opacity": 1
                },
                "effects": {}
            },
            "tracklist-panel": {
                "surface": {
                    "backgroundColor": "#2d3135",
                    "borderColor": "#f2efe8",
                    "opacity": 1,
                    "borderEnabled": false,
                    "cornerEnabled": false,
                    "cornerRadiusLevel": 3,
                    "backgroundBlurEnabled": false,
                    "secondaryOpacity": 0.28
                },
                "text": {
                    "color": "#f2efe8",
                    "font": "Segoe UI",
                    "fontSize": 14,
                    "textAlign": "left",
                    "opacity": 1
                },
                "effects": {
                    "shadow": false,
                    "accentRail": false
                }
            }
        }
    }
};

    function create(id, composer) {
        const preset = META.find(item => item.id === id);
        if (!preset) throw new RangeError('Unknown HUD panel preset: ' + id);
        if (!composer || composer.VERSION !== 2 || typeof composer.createDefaultLayout !== 'function'
            || typeof composer.normalizeLayout !== 'function') {
            throw new TypeError('A compatible YouTube CD HUD v2 composer is required.');
        }
        // Built-in presets start from the schema, not the independently authored install default.
        const layout = composer.normalizeLayout({ version: 2, components: Object.keys(composer.registry).map(cid => ({ id: cid })) });
        if (layout.components.filter(c => !['volume-control', 'agent-tools', 'system-status'].includes(c.id)).length !== IDS.length || IDS.some(key => !layout.components.some(c => c.id === key))) {
            throw new TypeError('The composer component registry differs from this preset pack.');
        }
        layout.canvas = { width: 1280, height: 720, sizingMode: 'absolute',
            collisionPolicy: 'no-overlap-closed',
            alignmentGrid: { enabled: true, unitWidth: 4, unitHeight: 4, visible: false } };

        layout.palette = { ...SKINS[id].tokens };

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
            component.style = {};
            if (component.textStyle) component.textStyle = {};
            component.effects = {};
            if (component.arrangement) component.arrangement.split = false;
            // Layer enablement is a functional composition choice, outside Skin.
            if (component.type === 'disc') component.layer.enabled = DISC_LAYERS[id] === true;
            if (component.type === 'panel-base') component.boundary.padding = 16;
            if (rect) {
                const [x, y, width, height] = rect;
                component.geometry = { x: (left + x + width / 2) / 1280,
                    y: (top + y + height / 2) / 720, width, height,
                    z: component.id === 'panel-base' ? -1 : component.id === 'disc' ? 1 : 0 };
            }
        }
        if (id === 'cdj-inspired') {
            const transport = composer.getComponent(layout, 'transport-controls');
            transport.arrangement = { split: true, partSize: { width: 64, height: 44 }, positions: {
                previous: { x: (left + 56) / 1280, y: (top + 458) / 720 },
                next: { x: (left + 56) / 1280, y: (top + 522) / 720 },
            } };
        }
        return composer.refreshSkin(composer.normalizeLayout(composer.skin.applySkinToLayout(layout, SKINS[id])));
    }

    function exportCode(id, composer) {
        return composer.exportCode(create(id, composer));
    }

    root.YtCdHudPanelPack = Object.freeze({ version: '1.2.0', presets: META, create, exportCode });
})(globalThis);

# Editor state illustrations

Five portrait panels reconstruct supported UI controls. SVG files are editable originals; JPEG files are browser screenshots of these illustrations, not of the installed extension. Track names and parameter values are examples, not user data. The strip places all five continuously. These are SDR assets; existing HDR originals are untouched.

The portrait composition rearranges controls for explanation. The placement diagram does not promise automatic rerouting of every drag. Aspect preservation belongs to Size and SCALE %, not a separate lock switch. Automatic position saving applies to the runtime drag path; editor changes require Save and apply.

## Feature references

- Properties: `extension/options/live-monitor-property-toolbar.js`
- Limits, layers, free-space search: `extension/options/live-monitor-composer.js`
- Collision confirmation/removal: `extension/options/live-monitor-canvas-editor.js`
- Group scaling: `extension/options/live-monitor-resize-engine.js`
- Session slots: `extension/options/live-monitor-layout-presets.js`
- Explicit editor save: `extension/options/options.js`
- Runtime drag save: `src/youtube-cd-hud.user.js`, `bindRuntimeLayoutUnitDragging` / `persistRuntimeLayout`

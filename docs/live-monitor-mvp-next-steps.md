# Live Monitor Visual Composer MVP Integration Checkpoint

## Current checkpoint

The Visual Composer branch has completed the component architecture stage.

## Remaining integration gates

- Inject Composer runtime into options page lifecycle.
- Connect layout persistence with existing settings flow.
- Validate extension build and runtime loading order.
- Perform Chrome unpacked extension acceptance test.

## Acceptance target

The MVP is considered complete when:

- users can select preview components;
- drag components inside the canvas;
- resize components with constraints;
- delete removable components;
- save and restore layouts;
- existing HUD settings continue working.

## Runtime dependency order

1. settings.js
2. i18n.js
3. live-monitor-composer.js
4. live-monitor-layout-store.js
5. live-monitor-resize-engine.js
6. live-monitor-canvas-editor.js
7. live-monitor-property-toolbar.js
8. live-monitor-bootstrap.js
9. options.js

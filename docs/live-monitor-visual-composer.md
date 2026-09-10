# Live Monitor Visual Composer

The 5.13.0 extension options page includes a constrained 2D editor for the
internal YouTube CD HUD layout. The editor is deliberately local and bounded:
one instance of each functional unit, normalized coordinates, closed-state
collision boundaries, and min/max dimensions.

## Operation

Open the extension options page and use the Live Monitor stage:

- Click a component to select it. Click the stage background or press Escape to
  clear selection.
- Dragging is clamped to the canvas but does not reject collisions in flight.
  On release, a same-layer overlap prompts either automatic Z-layer allocation
  for the whole conflict group or removal of every conflicting unit from the
  panel back to the Component List.
- Hover the selected component and use the wheel or its four corner handles to
  resize it.
- Change only the properties shown in the contextual toolbar.
- Every unit exposes its fixed-secondary border as an on/off control. Rectangular
  units may enable rounded corners and select radius level 1–10; the disc keeps
  its fixed circular shape.
- Background opacity uses ordinary alpha transparency by default. Backdrop blur
  is a separate, per-unit opt-in control.
- The canvas and contextual toolbar form one workbench. The toolbar attaches
  directly below the operable canvas and updates in place when selection changes.
- Text-oriented units such as title and time support left, right, center, and
  distributed alignment. Their text-size ceiling is 192 logical pixels (six
  times the previous limit), and the unit height expands to contain that line.
- Track controls remain joined by default. Enabling split mode gives PREVIOUS
  and NEXT independent positions while preserving one shared size, style,
  opacity, and Z-layer authority.
- Remove optional components with Delete or the toolbar button. Removed units
  return to the Component List; adding one removes it from that list.
- Z-capable units default to disabled and effective `z=0`. When enabled, their
  `-99..99` Z value applies; different effective layers may overlap while the
  same layer remains collision constrained.
- The disc always has Z enabled at a default of `1`. It has no boundary and is
  excluded from the dynamic panel-base envelope.
- The panel base is always present, remains below every visible unit, and
  expands to the combined boundaries of bounded units plus envelope padding.
- Composer RESET restores only layout defaults. Select A/B/C, then use the
  shared SAVE / LOAD controls for complete temporary layouts in
  `chrome.storage.session` for the current browser session.
- AUTO ALIGN defaults on. Drag and resize operations snap to an invisible 8×8
  logical-pixel grid.
- Save with Save and apply. Reset restores both settings and layout defaults in
  memory; save to persist the reset.

Layout state is stored in Chrome local storage under `ytCdHudLayoutV2` and is
normalized as schema version 2. Existing `ytCdHudLayoutV1` data is accepted as
a migration source and is not deleted automatically.

An ordinary bounded unit uses this structure:

```json
{
  "id": "track-title",
  "type": "track-title",
  "present": true,
  "geometry": { "x": 0.34, "y": 0.43, "width": 430, "height": 48, "z": 0 },
  "layer": { "enabled": false },
  "boundary": { "state": "closed", "shape": "rect", "collision": true },
  "style": {
    "backgroundColor": "#1a202c",
    "borderColor": "#63b3ed",
    "opacity": 1,
    "borderEnabled": true,
    "cornerEnabled": false,
    "cornerRadiusLevel": 1,
    "backgroundBlurEnabled": false
  },
  "textStyle": { "color": "#63b3ed", "opacity": 1, "font": "cascadia-mono", "fontSize": 14, "textAlign": "left" },
  "effects": { "marquee": true }
}
```

`geometry` is layout, `layer.enabled` determines whether its Z value is active,
`boundary` is placement policy, `style` is unit-surface state, `textStyle` is
independent text state, and `effects` contains decorations attached to that
functional unit. The disc intentionally omits `boundary` and keeps a fixed
circular corner rule.

Track controls remain one `transport-controls` record. Its shared parameters
stay on the component, while `arrangement` stores `split`, one shared
`partSize`, and independent `previous` / `next` positions.
Dynamic track content is not stored in the layout.

## Boundaries

The current registry contains: panel base, disc control, track title, time
readout, source selector, tracklist toggle, track controls, close control,
text-size control, and tracklist panel. Expanded menus do not participate in
collision checks; an added tracklist panel does, using its closed-state bounds.

The canvas uses 24px origin dots with 96px major lines in the settings-page
industrial palette.
The snap grid is separately stored in `canvas.alignmentGrid` as an enabled,
invisible 8×8 unit grid; it is not the decorative background grid.

The composer does not include cloud sync, duplicate instances, persistent templates,
import/export, or undo history. Custom CSS remains an advanced override and can
intentionally supersede Composer styling.

Local checks do not replace visible Chrome Options and real YouTube acceptance.

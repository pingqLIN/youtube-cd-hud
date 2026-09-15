# Panel studio

## Workflow

1. Choose Full, Compact, or Invisible hints under Theme. Set the primary and
   secondary colors. Expand typography settings for a font or a local font name
   and a pixel font size. Fonts are loaded from the device, with a monospace fallback.
2. Select a unit on the canvas or in the unit selector. The selector also includes
   fully transparent units. Width and height are CSS pixels: the canvas scrolls
   instead of shrinking the design to fit its container. Dimension number inputs
   round upward to whole pixels: 120.2 becomes 121 px.
3. Expand the selected unit's details for its surface, text, layer, and effects.
   Every unit has an independent Hidden control that retains its geometry and colors.
   Background, secondary (border/effect), and text colors have independent alpha.
   A transparent color does not hide the unit.
4. Use arrow keys for one-pixel movement, Shift + arrows for ten pixels, Delete
   to return a unit to the library, and Enter to toggle that unit's lock.
   Keyboard editing is scoped to the focused canvas unit, not text fields.
5. Save and apply to store the layout and lock the assembled panel. UNLOCK
   enables editing again. Individual unit locks are retained. A/B/C saves are
   session slots; Save and apply persists the active panel locally.

The base is permanent and independently resizable. Every mounted unit, including
each half of split transport controls, must overlap some part of the base.
Invalid moves and resizes are rejected. Group scaling is atomic: limits,
collisions, disconnected units, or locks leave the previous layout intact.
Successful scaling updates both unit geometry and the base when all units are
selected. Undo applies only while no intervening edit has changed the result.

## Panel code

The bottom section exports the current panel as versioned JSON. Load a session
slot first to export that panel. Paste a complete export and choose Generate
panel to preview it; Save and apply activates it. Invalid input leaves the current
panel unchanged. This replaces the custom CSS editor and CSS override application.
The JSON is parsed as data and is never executed as JavaScript or CSS.

## Runtime and verification

HUD dimensions use CSS pixels independent of the player resolution. A panel
larger than the player can extend beyond the visible player area; choose a
smaller layout or reduce its dimensions. Device scaling and browser zoom still
determine the mapping from CSS pixels to physical display pixels.

The HUD exposes LOCK/UNLOCK. Locked units and the base cannot move or resize.
After unlocking, drag a border to resize, or hold it still for 400 milliseconds
to enter movement mode. Disc centers retain scrubbing; their circular edges
are used for layout editing. The options editor also offers eight resize handles.

The first half of each font slider covers 8–32 px; the second covers 32–192 px.
Locked preview units receive translucent theme shades from light to dark in
component-list order. These editing overlays are not applied to the YouTube HUD.

The unit tests cover JSON round trips, locks, keyboard movement, base attachment,
scaling, and the runtime projection. Visible options-page and YouTube/Tampermonkey
acceptance still require manual verification. Existing composer screenshots show
the earlier interface.

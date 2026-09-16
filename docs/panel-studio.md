# Panel studio

## Workflow

1. Choose Full, Compact, or Invisible hints in the theme strip inside Compose. Set the primary and
   secondary colors. Expand typography settings for a font or a local font name
   and a pixel font size. Fonts are loaded from the device, with a monospace fallback.
2. Select a unit on the canvas or in the unit selector. The selector also includes
   fully transparent units. Width and height are saved CSS pixels. The fixed-height
   preview area has no scrollbars; drag its lower-right corner to resize the view.
   Units retain their actual CSS pixel sizes as the viewport changes. Drag empty
   space to pan; Center panel restores the view. Selecting a unit from the dropdown
   centers that unit. Dimension number inputs
   round upward to whole pixels: 120.2 becomes 121 px.
3. Expand the selected unit's details for its surface, text, layer, and effects.
   Details start collapsed on each page load. Once opened, they remain open
   across edits and selection changes until manually collapsed or the page is closed.
   Every unit has an independent Hidden control that retains its geometry and colors.
   Background, secondary (border/effect), and text colors have independent alpha.
   A transparent color does not hide the unit.
4. Use arrow keys for one-pixel movement, Shift + arrows for ten pixels, Delete
   to return a unit to the library, and Enter to toggle that unit's lock.
   Keyboard editing is scoped to the focused canvas unit, not text fields.
5. Save and apply to store the layout and lock the assembled panel. UNLOCK
   beside Save and apply enables editing again. Individual unit locks are retained. A/B/C saves are
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

LOCK/UNLOCK belongs to the options editor and is not shown on YouTube.
In the editor, unlocked unit edges drag immediately; resize using the handles
or Alt + edge drag. Dragging the base moves the assembly; when alignment is on,
the shared movement snaps to the grid so saving preserves relative positions. Editor locks protect
individual layout editing. On YouTube, dragging exposed base space or any unit edge moves the complete
assembly, including split controls, while preserving relative positions and sizes.
Disc centers retain scrubbing, and button centers retain their playback actions.
The runtime panel anchor is saved separately from unit coordinates, so movement
can span the player without changing the composition or its locks.

The disc has overall opacity from 0% transparent to 100% opaque, including its
artwork, background, and border. Background color opacity is saved separately
and combines with the overall opacity when rendered. The value persists in panel code
and the active layout. DB source menus have a 240 px width floor, limited by the
viewport on small screens, and labels wrap instead of being clipped.
Saving the active panel or an A/B/C slot checks the menu owner's layer and raises
it above visible units when needed. Expanded menus also raise their owner at runtime.

The first half of each font slider covers 8–32 px; the second covers 32–192 px.
Each text unit also offers weight 100–900 (400 regular, 700 bold). The browser
uses the nearest weight supplied by the font; synthetic bold is disabled.
Weight is preserved in saved layouts and exported panel code. Existing layouts
without an explicit weight retain the unit's default weight.

Minimum heights are 24 px for the base, text, and buttons, 24 px diameter for
the disc, and 48 px for the tracklist. Large text and grid snapping can require
more height. These limits apply to both the editor and the YouTube HUD.
Editor lock indicators and unlock actions use red text; content colors stay as authored.
Saving or locking preserves the authored colors; it adds no light or dark overlay.
The full, compact, and invisible built-in panels use per-unit surface and text
colors. Full and compact surfaces are opaque slate; invisible keeps its transparent base.

The unit tests cover JSON round trips, locks, keyboard movement, base attachment,
scaling, and the runtime projection. Visible options-page and YouTube/Tampermonkey
acceptance still require manual verification. Existing composer screenshots show
the earlier interface.

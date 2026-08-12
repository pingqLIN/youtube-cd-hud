# YouTube CD HUD

YouTube CD HUD is available as both a Tampermonkey userscript and a Chrome
extension. It adds an album-style HUD, chapter and tracklist display, cover-art
color sampling, and optional 1001Tracklists lookup to YouTube.

The current userscript source is `src/youtube-cd-hud.user.js`. The unpacked
Chrome extension is in `extension/`. Both variants are version 5.8.0.

## What 5.8.0 changes

- Adds a Manifest V3 Chrome extension while keeping the Tampermonkey build.
- Adds a dedicated extension control page for enabling the HUD, changing 1001
  search behavior, tuning typography, disc scale, opacity and accent color,
  hiding selected controls, and applying scoped custom CSS.
- Stores extension preferences locally and applies changes to open YouTube tabs.
- Keeps cross-site access limited to YouTube and 1001Tracklists; no browsing
  history, credentials, cookies, or analytics are collected.

## What 5.7.1 changes

- Adds balanced whitespace on both sides of the disc and enlarges its default
  diameter to 120% of the previous size.
- Dynamically locks the HUD's minimum complete width and height to the current
  track text, disc, source controls, transport buttons, and utility rail, while
  retaining the YouTube player as the maximum available boundary.

## What 5.7.0 changes

- Turns the 1001 status/source control into one compound disclosure button.
  Its menu contains `USE 1001`, `RETRY SEARCH`, and `OPEN 1001` actions.
- Moves the tracklist toggle into the right-side utility rail and adds
  `PREV`/`NEXT` track navigation below the source controls.
- Balances the disc against both the viewport and selected text size, with
  additional interior spacing so the disc and controls do not touch the frame.
- Adds a title bar and top-right close button to the tracklist panel.
- Keeps both the HUD and tracklist panel draggable and adds visible bottom-right
  resize handles for pointer resizing within the YouTube player.

## What 5.6.0 changes

- Fixes the tracklist toggle by explicitly switching the panel between
  `display: block` and `display: none` instead of falling back to its hidden
  stylesheet state.
- Removes manual disc-size controls and sizes the disc responsively from the
  viewport's shorter dimension, clamped between 44 and 64 pixels.
- Places close, text decrease, and text increase controls in one vertically
  aligned utility rail at the top right.
- Rebuilds the source controls as a compact labelled action row containing an
  always-visible `SRC | YT | 1001` selector, circular 1001 status lamp,
  `1001↗` link, and `TRACKS` toggle. Unavailable sources remain visible but
  disabled, while the active source is highlighted.

## What 5.5.2 fixes

- Detects 1001Tracklists' native rate-limit CAPTCHA page, including successful
  HTTP 200/206 responses that contain its `unblock_ip` form.
- Stops candidate fallback immediately when that block page is detected and
  reports that browser verification is required instead of claiming that five
  tracklists contain no timestamps.

## What 5.5.1 changes

- Restores the status indicator to a circular lamp while preserving its idle,
  searching, success, error, and keyboard-focus states.
- Accepts every successful HTTP 2xx response from 1001Tracklists, including
  HTTP 206, before applying the existing HTML, block-page, and timestamp
  validation.
- Adds direct disc scrubbing: hold to pause, drag clockwise to seek forward,
  drag counterclockwise to loop an 80 ms sample, and release to resume.
- Adds a top-right close button that hides the HUD and tracklist panel until the
  YouTube tab is reloaded.

## What 5.5.0 changes

- Crops a native 16:9 YouTube thumbnail with `background-size: cover`, so the
  artwork fills the circular disc without exposed edges or 4:3 letterboxing.
- Applies a compact industrial telemetry design system with hard edges,
  slate-toned glass surfaces, monospace data, accessible status colors, and
  consistent control states.
- Keeps cover-derived color on the disc rim only, preserving stable HUD
  contrast and hierarchy.
- Adds keyboard focus treatment, reduced-motion support, and a tighter layout
  for narrow viewports.

## What 5.4.1 fixes

- Uses the scoped Trusted Types policy with the inert DOM parser before
  Chrome's sanitizing `Document.parseHTML()` fallback. The sanitizer removes
  the current 1001Tracklists track rows even though the source HTML contains
  valid cues.

## What 5.4.0 fixed

- Uses the current 1001Tracklists POST search contract.
- Normalizes common YouTube title suffixes before searching.
- Ranks tracklist results by title-token similarity.
- Tries up to five candidate tracklist pages when an earlier result has no
  usable timestamps.
- Reads cue time from visible timestamp text, hidden `cue_seconds` inputs, or
  cue action metadata.
- Cancels stale requests and clears timers during YouTube SPA navigation.
- Keeps Trusted Types parsing scoped and never inserts third-party parsed DOM
  into the YouTube page.

## Install — Tampermonkey

Import `src/youtube-cd-hud.user.js` into Tampermonkey, disable older versions,
and fully reload the YouTube tab.

## Install — Chrome extension

1. Run `npm run build:extension` after changing the shared userscript source.
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select the repository's `extension/` directory.
4. Click the extension action to open the control page, save the preferred
   settings, and reload any YouTube tabs that were already open.

The extension uses Chrome local storage for preferences. 1001Tracklists
requests omit credentials and are only made when its integration is enabled.

## Validate

```powershell
npm run check
npm test
```

These checks are local only. Final acceptance requires a visible YouTube video
test in the operator's actual browser profile.

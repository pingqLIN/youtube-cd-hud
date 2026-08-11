# YouTube CD HUD

YouTube CD HUD is a Tampermonkey userscript that adds an album-style HUD,
chapter and tracklist display, cover-art color sampling, and optional
1001Tracklists lookup to YouTube.

The current installable source is
`src/youtube-cd-hud.user.js` (version 5.4.0).

## What 5.4.0 fixes

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

## Install

Import `src/youtube-cd-hud.user.js` into Tampermonkey, disable older versions,
and fully reload the YouTube tab.

## Validate

```powershell
npm run check
npm test
```

These checks are local only. Final acceptance requires a visible YouTube video
test in the operator's actual browser profile.

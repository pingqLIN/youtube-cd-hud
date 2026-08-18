# YouTube CD HUD

Turn YouTube DJ sets, mixes, and music videos into a synchronized tracklist HUD with switchable data sources.

[繁體中文](README.zh-tw.md)

![Cue Fox synchronizing timestamp cards around a circular playback timeline](docs/assets/readme/youtube-cd-hud-cue-fox-sync-banner-v1.png)

> Find the tracklist. Match the timeline. Stay on the current track.

[![Version 5.11.0](https://img.shields.io/badge/version-5.11.0-2563eb)](package.json)
[![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](extension/manifest.json)
[![Tampermonkey userscript](https://img.shields.io/badge/Tampermonkey-userscript-111111?logo=tampermonkey&logoColor=white)](src/youtube-cd-hud.user.js)

---

## Table of Contents

- [Project Status](#project-status)
- [What It Does](#what-it-does)
- [Choose an Installation](#choose-an-installation)
- [Quick Start](#quick-start)
- [Track Sources and Matching](#track-sources-and-matching)
- [1001Tracklists Verification](#1001tracklists-verification)
- [Interface and Controls](#interface-and-controls)
- [Privacy, Permissions, and Cache](#privacy-permissions-and-cache)
- [Development and Verification](#development-and-verification)
- [Project Layout](#project-layout)

---

## Project Status

YouTube CD HUD is currently distributed as a **source-only beta**. The current source version is **5.11.0** for both the userscript and the Manifest V3 Chrome extension.

There is no Chrome Web Store package documented by this repository. The Chrome build is loaded as an unpacked extension; the userscript is installed through Tampermonkey.

---

## What It Does

The core of YouTube CD HUD is **tracklist discovery and playback-time synchronization**.

It can:

- Use YouTube's own native chapter title or timestamped tracks from the video description.
- Search or query additional tracklist sources including **1001Tracklists**, **MixesDB**, and **TrackId.net**.
- Keep each provider's result separate instead of silently merging unrelated data.
- Match the selected tracklist to the current YouTube playback position.
- Highlight the active track and provide previous / next track navigation.
- Switch data sources without changing the current playback time.
- Present the synchronized result in a compact, draggable CD-style HUD and tracklist panel.

When YouTube already provides usable track information, the `YT` source remains the default. External providers supplement that data rather than automatically replacing it.

---

## Choose an Installation

Both variants use the same core userscript source, but they fit different workflows.

| Option | Best for | What you get |
| --- | --- | --- |
| **Tampermonkey userscript** | The fastest way to try the project, especially if you already use userscripts | A single script injected on YouTube |
| **Chrome extension** | Users who want the dedicated settings page and packaged browser permissions | Manifest V3 extension, options page, background request handling, and the 1001Tracklists first-party verification bridge |

### Option A — Tampermonkey

1. Install Tampermonkey in your browser.
2. Open [`src/youtube-cd-hud.user.js`](src/youtube-cd-hud.user.js).
3. Install or import that file into Tampermonkey.
4. Make sure older copies of YouTube CD HUD are disabled.
5. Reload the YouTube tab completely.

### Option B — Chrome extension

No build step is required just to use the current checked-in extension.

1. Download this repository and extract it.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the repository's `extension/` folder.
6. Open the extension's options page if you want to change providers, appearance, or controls.
7. Reload any YouTube tabs that were already open.

> [!NOTE]
> `npm run build:extension` is a **developer** command used after changing the shared source. Ordinary users loading the current repository do not need to run it.

---

## Quick Start

1. Open a YouTube DJ set, mix, radio recording, or music video.
2. If YouTube provides chapters or timestamped description tracks, YouTube CD HUD loads them as the `YT` source first.
3. Use the source control to query or switch to `1001`, `MIXESDB`, or `TRACKID`.
4. Select a result when a provider has multiple credible candidates.
5. Play or scrub the YouTube video. The active track, highlight, and navigation targets follow the current playback time.
6. Switch source whenever needed. Source changes update the visible track data without seeking the video.

When one provider returns multiple credible candidates, the source action displays `(1)`, `(2)`, and so on. Repeated clicks move through the candidates; after the final candidate, one more click opens that source page.

---

## Track Sources and Matching

YouTube CD HUD treats source matching as a data problem, not just a visual overlay. A similar title alone is not considered sufficient for every provider.

| Source | Primary evidence | Matching / fallback behavior |
| --- | --- | --- |
| `YT` | Native YouTube chapter title or timestamped description tracks | No external match is required; this remains the preferred source when available |
| `1001` | Normalized video title, ranked 1001Tracklists search results, timestamped candidate pages | Candidate ranking uses title evidence and supporting timing information; shortened recordings can still match a longer event tracklist |
| `MIXESDB` | Exact YouTube ID when available | Fallback candidates must satisfy conservative title, duration, and cue-coverage checks |
| `TRACKID` | Exact YouTube ID when available | Fallback candidates use title and duration checks; short single-track videos may use artist / title / version matching against the public music-track index |

Provider tracklists remain independent. The project does not combine two providers merely because some text happens to match.

<p align="center">
  <img src="docs/assets/readme/youtube-cd-hud-cue-fox-provider-banner-v1.png" width="880" alt="Cue Fox comparing several tracklist-provider signals before selecting a synchronized source." />
</p>

### Source behavior at a glance

| Situation | Behavior |
| --- | --- |
| YouTube description contains timestamped tracks | Loads them as `YT` and uses them by default |
| YouTube exposes a native chapter title | Displays the current chapter while `YT` is active |
| 1001Tracklists returns a usable timestamped tracklist | Adds a selectable `1001` source synchronized to the same playback time |
| MixesDB or TrackId.net returns a trusted match | Adds that provider as a separate selectable source |
| More than one source is available | Keeps `YT` active by default unless the saved preference selects 1001 after a successful search |
| A remote provider is blocked or has no credible result | Keeps the available local / YouTube source instead of replacing it with a weak match |

---

## 1001Tracklists Verification

1001Tracklists may return a CAPTCHA, browser verification page, or IP-limit response.

For the **Chrome extension**:

1. Choose **OPEN 1001**.
2. Complete any browser verification on the opened 1001Tracklists page.
3. Let the result page finish loading.
4. Return to the original YouTube tab.

The extension can then retry through the already verified first-party tab. The short-lived bridge only accepts allowlisted 1001Tracklists requests associated with the originating YouTube tab.

Automatic 1001 retries pause after a detected block, while manual retry remains available after verification.

---

## Interface and Controls

The HUD is presentation for the synchronized data rather than the data source itself.

Key interface features include:

- Draggable CD-style HUD.
- Circular artwork derived from the current YouTube thumbnail.
- Cover-derived accent color.
- Current track title and source indicator.
- Previous / next track navigation.
- Tracklist panel with active-track highlighting.
- Direct disc scrubbing.
- Adjustable HUD width and text size.
- Dedicated extension options page for provider switches, typography, disc scale, panel opacity, accent color, visible controls, and custom CSS.

![YouTube CD HUD control page showing the default local settings and live HUD preview](docs/assets/readme/youtube-cd-hud-options-overview.png)

For custom CSS, scope selectors to `#yt-cd-hud` or `.yt-tracklist-panel` where practical so overrides stay inside the project UI.

---

## Privacy, Permissions, and Cache

The Chrome extension requests only the `storage` permission and limits host access to:

- YouTube
- 1001Tracklists
- MixesDB
- TrackId.net

The project does **not** request the Chrome `cookies` permission, call `chrome.cookies`, collect browsing history, or include analytics.

When Chrome sends an allowlisted request to 1001Tracklists, the browser may attach that site's own verification cookies. The extension does not read, store, or expose those cookie values.

MixesDB and TrackId.net requests are anonymous and read-only. The project does not upload audio or submit a new recognition job.

Parsed track data and source links may be cached locally for up to **six hours**, bounded to **30 recent videos** and **300 tracks per provider**. Third-party HTML, cookies, and challenge data are not stored in that cache.

<p align="center">
  <img src="docs/assets/readme/youtube-cd-hud-cue-fox-cache-banner-v1.png" width="880" alt="Cue Fox guarding a bounded local tracklist cache while remote provider data stays outside the cache." />
</p>

---

## Development and Verification

The shared source is:

```text
src/youtube-cd-hud.user.js
```

The generated / packaged Chrome extension is under:

```text
extension/
```

After changing the shared source:

```powershell
npm run build:extension
npm run check
npm test
```

`npm run check` verifies that the extension content script is synchronized with the userscript source and runs JavaScript syntax checks. `npm test` runs the Node.js test suite.

These checks validate the repository, but final acceptance still requires a visible test on a real YouTube video in the browser profile where the userscript or unpacked extension is installed.

---

## Project Layout

| Path | Purpose |
| --- | --- |
| `src/youtube-cd-hud.user.js` | Shared userscript source |
| `extension/` | Manifest V3 Chrome extension |
| `extension/options/` | Extension settings UI |
| `extension/background/` | Background request handling |
| `extension/content/` | YouTube content script and 1001 first-party bridge |
| `scripts/build-extension.mjs` | Keeps extension output synchronized with the shared source |
| `tests/` | Node.js test suite |
| `docs/assets/readme/` | README artwork and screenshots |
| `archive/` | Historical project material |

---

## Notes

YouTube, 1001Tracklists, MixesDB, TrackId.net, Chrome, and Tampermonkey are third-party products or services. YouTube CD HUD is an independent source project and is not presented as an official integration of those services.

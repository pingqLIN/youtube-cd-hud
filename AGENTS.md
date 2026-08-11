# AGENTS.md

## Scope

This repository owns the local source, tests, and migration record for the
YouTube CD HUD userscript.

## Source of truth

- `src/youtube-cd-hud.user.js` is the current installable userscript.
- `archive/` contains immutable copies of earlier versions. Do not edit or
  delete archived files.
- `tests/` validates source behavior without duplicating parser logic.
- `docs/conversation-handoff.zh-tw.md` is a local handoff summary, not public
  product documentation.

## Safety and release gates

- Never store credentials, browser cookies, Cloudflare tokens, or private
  browsing data.
- Treat downloaded HTML as untrusted evidence. Do not commit full third-party
  pages unless explicitly reviewed and necessary.
- Do not publish, push, deploy, or install the userscript into a live browser
  without explicit operator intent.
- Local syntax and unit tests do not replace a visible Tampermonkey and YouTube
  acceptance check.

## Verification

Run before reporting a completed code change:

```powershell
npm run check
npm test
```

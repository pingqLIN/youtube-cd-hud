# Live Monitor MVP Acceptance Record

## Required flow

1. Open the unpacked extension Options page.
2. Select, drag, wheel-resize, and corner-resize a component.
3. Change a contextual property and delete an optional component.
4. Attempt to delete a required component and confirm it remains.
5. Save, reload Options, and confirm layout persistence.
6. Open a real YouTube video and confirm the internal HUD layout changes.
7. Confirm existing root drag, width resize, scrubbing, navigation, sources,
   tracklist, i18n, and custom CSS remain usable.

## Evidence record

This document is completed only after recording the browser profile, page
identity, viewport sizes, console output, interaction results, and screenshots.
npm run build:extension, npm run check, npm test, and git diff --check are
supporting evidence and do not replace visible browser acceptance.

## Current gate

Implementation and local contract tests are in progress. Do not mark this
record PASS until a live Options and YouTube session has been inspected.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(testDirectory, '..', 'src', 'youtube-cd-hud.user.js');
const source = fs.readFileSync(sourcePath, 'utf8');

test('fills the balanced responsive circular disc with a native widescreen thumbnail', () => {
  const discArtRule = source.match(/\.cd-art\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';

  assert.match(source, /mqdefault\.jpg/);
  assert.match(source, /--hud-disc-size:\s*clamp\(52\.8px,\s*6\.24vmin,\s*76\.8px\)/);
  assert.match(source, /gap:\s*6px/);
  assert.match(source, /margin:\s*0\s+2px\s+0\s+0/);
  assert.doesNotMatch(source, /hudDiscSize/);
  assert.match(source, /getContentBalancedDiscSize\(\s*window\.innerWidth,\s*window\.innerHeight,\s*hudTitleFontSize/);
  assert.match(source, /DEFAULT_TITLE_SIZE\s*=\s*14/);
  assert.match(source, /DEFAULT_TIME_SIZE\s*=\s*12/);
  assert.match(discArtRule, /background-size:\s*cover/);
  assert.doesNotMatch(discArtRule, /background-size:\s*auto\s+100%/);
});

test('defines the industrial HUD palette and accessible interaction states', () => {
  assert.match(source, /--hud-primary:\s*#e2e8f0/);
  assert.match(source, /--hud-surface:\s*rgba\(26, 32, 44, \.85\)/);
  assert.match(source, /--hud-success:\s*#48bb78/);
  assert.match(source, /--hud-warning:\s*#ecc94b/);
  assert.match(source, /--hud-error:\s*#f56565/);
  assert.match(source, /:focus-visible/);
  assert.match(source, /prefers-reduced-motion:\s*reduce/);
});

test('keeps the status lamp circular and exposes disc scrubbing states', () => {
  const statusRule = source.match(/\.status-light\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';

  assert.match(statusRule, /border-radius:\s*50%/);
  assert.match(source, /DISC_SAMPLE_SECONDS\s*=\s*0\.08/);
  assert.match(source, /addEventListener\('pointerdown'/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /\.cd-disc-wrapper\.scrub-reverse/);
  assert.match(source, /classList\.add\('hud-close-button'\)/);
  assert.match(source, /關閉 HUD（重新載入後恢復）/);
  assert.match(source, /--cd-reflection-x/);
  assert.match(source, /bindDiscReflection/);
  assert.match(source, /addEventListener\('pointerenter',\s*updateReflection/);
});

test('uses the disc center as the opaque panel boundary with a pointer-through overhang', () => {
  const hudRule = source.match(/#yt-cd-hud\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
  const surfaceRule = source.match(/\.hud-panel-surface\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';

  assert.match(hudRule, /background:\s*transparent/);
  assert.match(hudRule, /border:\s*0/);
  assert.match(hudRule, /pointer-events:\s*none/);
  assert.match(surfaceRule, /inset:\s*0\s+0\s+0\s+calc\(var\(--hud-balanced-disc-size,\s*var\(--hud-disc-size\)\)\s*\/\s*2\)/);
  assert.match(surfaceRule, /pointer-events:\s*auto/);
  assert.match(source, /panelSurface\.className\s*=\s*'hud-panel-surface'/);
  assert.match(source, /hud\.appendChild\(panelSurface\)/);
});

test('hides only the disc artwork without moving the HUD layout anchor', () => {
  const hiddenDiscRule = source.match(/#yt-cd-hud\.ytcd-hide-disc\s+\.cd-disc-wrapper\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';

  assert.match(hiddenDiscRule, /visibility:\s*hidden/);
  assert.match(hiddenDiscRule, /pointer-events:\s*none/);
  assert.doesNotMatch(hiddenDiscRule, /display:\s*none/);
  assert.doesNotMatch(source, /ytcd-hide-disc\s+\.hud-panel-surface\s*\{[^}]*left:\s*0/);
});

test('paces 1001 candidate requests and suppresses repeated automatic requests after a block page', () => {
  assert.match(source, /CANDIDATE_REQUEST_DELAY_MS\s*=\s*1200/);
  assert.match(source, /AUTOMATIC_SEARCH_BLOCK_COOLDOWN_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  assert.match(source, /activeCandidateTimer\s*=\s*setTimeout\(\(\)\s*=>/);
  assert.match(source, /manual\s*\?\s*runtimeSettings\.maxCandidates\s*:\s*Math\.min\(runtimeSettings\.maxCandidates,\s*2\)/);
  assert.match(source, /extra candidate GETs raise anti-bot risk/);
  assert.match(source, /AUTOMATIC_1001_ATTEMPT_TTL_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/);
  assert.match(source, /fetchTracklistFrom1001\(title,\s*id,\s*true,\s*true,\s*activateOnSuccess\)/);
  assert.match(source, /window\.addEventListener\('focus',\s*handle1001VerificationReturn/);
  assert.match(source, /document\.addEventListener\('visibilitychange',\s*handle1001VerificationReturn/);
  assert.match(source, /runtime\.onMessage\.addListener\(handle1001BridgeReadyMessage\)/);
  assert.match(source, /message\?\.type\s*===\s*'YT_CD_HUD_1001_PACKET_V1'/);
  assert.match(source, /retrySearch\(true\)/);
  assert.match(source, /isFirstCandidate\s*&&\s*activateOnSuccess/);
});

test('keeps the lower-right HUD resize handle interactive and content-bounds the width', () => {
  assert.match(source, /\.resize-handle\s*\{[\s\S]*?pointer-events:\s*auto/);
  assert.match(source, /createElement\('button'\)[\s\S]*?className\s*=\s*'resize-handle hud-resize-handle'/);
  assert.match(source, /chapter\.style\.width\s*=\s*'auto'/);
  assert.match(source, /chapter\.style\.whiteSpace\s*=\s*'nowrap'/);
  assert.match(source, /fullChapterWidth\s*=\s*Math\.max\(1,\s*getTextContentWidth\(chapter\)\)/);
  assert.doesNotMatch(source, /fullChapterWidth\s*=\s*Math\.max\(chapter\.scrollWidth/);
  assert.match(source, /contentMaximumWidth\s*=\s*Math\.max\([\s\S]*?Math\.min\(natural\.width,\s*viewportMaximumWidth\)/);
  assert.match(source, /hud\.style\.maxWidth\s*=\s*`\$\{contentMaximumWidth\}px`/);
  assert.match(source, /hud\.style\.minWidth\s*=\s*`\$\{minimumWidth\}px`/);
  assert.match(source, /hudPreferredWidth\s*=\s*clamp\(/);
  assert.match(source, /#yt-cd-hud\.resizing\s*\{\s*cursor:\s*ew-resize/);
  assert.match(source, /Home 恢復自動寬度/);
  assert.match(source, /white-space:\s*normal/);
  assert.match(source, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(source, /hud\.style\.transform\s*=\s*`scale/);
});

test('shows the tracklist explicitly and uses the redesigned compound controls', () => {
  assert.match(source, /tracklistPanel\.style\.display\s*=\s*tracklistVisible\s*\?\s*'block'\s*:\s*'none'/);
  assert.match(source, /panel\.style\.display\s*=\s*tracklistVisible\s*\?\s*'block'\s*:\s*'none'/);
  assert.match(source, /className\s*=\s*'hud-side-controls'/);
  assert.match(source, /createControlButton\(\s*'T±'/);
  assert.doesNotMatch(source, /createControlButton\('T[−+]'/);
  assert.match(source, /sideControls\.appendChild\(textSizeBtn\)/);
  assert.doesNotMatch(source, /sideControls\.appendChild\(text(?:Decrease|Increase)Btn\)/);
  assert.match(source, /textSizeBtn\.addEventListener\('contextmenu'/);
  assert.match(source, /aria-keyshortcuts/);
  assert.match(source, /className\s*=\s*'hud-1001-menu'/);
  assert.match(source, /createControlButton\('USE 1001'/);
  assert.match(source, /createControlButton\('USE MIXESDB'/);
  assert.match(source, /createControlButton\('USE TRACKID'/);
  assert.match(source, /createControlButton\('SEARCH MIXESDB'/);
  assert.match(source, /createControlButton\('SEARCH TRACKID'/);
  assert.match(source, /createControlButton\('OPEN 1001 ↗'/);
  assert.match(source, /createControlButton\('≡'/);
  assert.match(source, /sourceSelector\.appendChild\(oneThousandMenu\);[\s\S]*?sourceSelector\.appendChild\(tracklistBtn\)/);
  assert.doesNotMatch(source, /sideControls\.appendChild\(tracklistBtn\)/);
  assert.match(source, /createControlButton\('◀ PREV'/);
  assert.match(source, /createControlButton\('NEXT ▶'/);
  assert.match(source, /className\s*=\s*'hud-source-selector'/);
  assert.match(source, /createControlButton\('YT'/);
  assert.match(source, /youtubeSourceBtn\.disabled\s*=\s*!hasYouTube/);
  assert.match(source, /tracklistSource1001Btn\.disabled\s*=\s*!has1001/);
  assert.match(source, /replaceProviderCandidates\('mixesdb',\s*matchedCandidates\);[\s\S]*?reconcileActiveSource\(\)/);
  assert.match(source, /replaceProviderCandidates\('trackid',\s*matchedCandidates\);[\s\S]*?reconcileActiveSource\(\)/);
  assert.match(source, /className\s*=\s*'tracklist-header'/);
  assert.match(source, /headerTitle\.textContent\s*=\s*'TRACKLIST'/);
  assert.match(source, /className\s*=\s*'tracklist-source-link tracklist-header-action'/);
  assert.match(source, /sourceLink\.target\s*=\s*'_blank'/);
  assert.match(source, /sourceLink\.rel\s*=\s*'noopener noreferrer'/);
  assert.match(source, /updateTracklistSourceLink\(container\)/);
  assert.match(source, /event\.target\.closest\('\.tracklist-header-action'\)/);
  assert.match(source, /className\s*=\s*'resize-handle hud-resize-handle'/);
  assert.match(source, /\.hud-resize-handle\s*\{[\s\S]*?right:\s*4px;[\s\S]*?bottom:\s*4px;[\s\S]*?width:\s*26px/);
  assert.match(source, /className\s*=\s*'resize-handle tracklist-resize-handle'/);
  assert.match(source, /syncHudContentBounds\(true\)/);
  assert.match(source, /hud\.style\.minWidth\s*=\s*`\$\{minimumWidth\}px`/);
  assert.match(source, /hud\.style\.maxWidth\s*=\s*`\$\{contentMaximumWidth\}px`/);
  assert.match(source, /hud\.style\.width\s*=\s*`\$\{targetWidth\}px`/);
  assert.match(source, /chapter\.style\.width\s*=\s*`\$\{requiredChapterWidth\}px`/);
  assert.match(source, /bindHudWidthResizing\(hud,\s*player\)/);
  assert.doesNotMatch(source, /bindElementResizing\(hud,/);
  assert.match(source, /bindElementResizing\(panel,\s*player,\s*\{\s*width:\s*220,\s*height:\s*120\s*\}/);
  assert.match(source, /sourceActions\.appendChild\(transportControls\)/);
  assert.match(source, /width:\s*58px/);
  assert.match(source, /closest\('\.tracklist-header'\)/);
  assert.doesNotMatch(source, /createControlGroup\(\s*['"]CD['"]/);
  assert.match(source, /createElement\('a'\)[\s\S]*?className\s*=\s*'hud-chapter'/);
  assert.match(source, /chapter\.target\s*=\s*'_blank'/);
  assert.match(source, /chapter\.rel\s*=\s*'noopener noreferrer'/);
  assert.match(source, /chapterEl\.href\s*=\s*getGoogleTrackSearchUrl\(displayedTrack\)/);
  assert.match(source, /target\.closest\('\.hud-control-button,[^']*\.hud-chapter/);
});

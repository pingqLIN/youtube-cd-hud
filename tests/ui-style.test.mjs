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
  assert.match(source, /margin:\s*6px\s+10px/);
  assert.doesNotMatch(source, /hudDiscSize/);
  assert.match(source, /getBalancedDiscSize\(window\.innerWidth,\s*window\.innerHeight,\s*hudTitleFontSize\)/);
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
});

test('shows the tracklist explicitly and uses the redesigned compound controls', () => {
  assert.match(source, /tracklistPanel\.style\.display\s*=\s*tracklistVisible\s*\?\s*'block'\s*:\s*'none'/);
  assert.match(source, /panel\.style\.display\s*=\s*tracklistVisible\s*\?\s*'block'\s*:\s*'none'/);
  assert.match(source, /className\s*=\s*'hud-side-controls'/);
  assert.match(source, /createControlButton\('T−'/);
  assert.match(source, /createControlButton\('T\+'/);
  assert.match(source, /className\s*=\s*'hud-1001-menu'/);
  assert.match(source, /createControlButton\('USE 1001'/);
  assert.match(source, /createControlButton\('OPEN 1001 ↗'/);
  assert.match(source, /createControlButton\('≡'/);
  assert.match(source, /createControlButton\('◀ PREV'/);
  assert.match(source, /createControlButton\('NEXT ▶'/);
  assert.match(source, /className\s*=\s*'hud-source-selector'/);
  assert.match(source, /createControlButton\('YT'/);
  assert.match(source, /youtubeSourceBtn\.disabled\s*=\s*!hasYouTube/);
  assert.match(source, /tracklistSource1001Btn\.disabled\s*=\s*!has1001/);
  assert.match(source, /className\s*=\s*'tracklist-header'/);
  assert.match(source, /className\s*=\s*'resize-handle hud-resize-handle'/);
  assert.match(source, /className\s*=\s*'resize-handle tracklist-resize-handle'/);
  assert.match(source, /syncHudContentBounds\(true\)/);
  assert.match(source, /hud\.style\.minWidth\s*=\s*`\$\{minimum\.width\}px`/);
  assert.match(source, /chapter\.style\.width\s*=\s*`\$\{requiredChapterWidth\}px`/);
  assert.match(source, /bindElementResizing\(hud,\s*player,\s*\(\)\s*=>/);
  assert.match(source, /bindElementResizing\(panel,\s*player,\s*\{\s*width:\s*220,\s*height:\s*120\s*\}/);
  assert.match(source, /closest\('\.tracklist-header'\)/);
  assert.doesNotMatch(source, /createControlGroup\(\s*['"]CD['"]/);
});

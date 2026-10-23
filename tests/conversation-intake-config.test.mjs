import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../docs/chatgpt-conversation-intake/youtube-cd-hud.json', import.meta.url), 'utf8'));

test('YouTube conversation intake has correct project scope', () => {
  assert.equal(cfg.schemaVersion, 1);
  assert.equal(cfg.projectName, 'YOUTUBE CD HUD');
  assert.ok(cfg.repo.endsWith('youtube-cd-hud'));
});

test('historical candidates must not pretend to be verified moves', () => {
  assert.ok(Array.isArray(cfg.candidates) && cfg.candidates.length > 0);
  assert.ok(cfg.candidates.every(x => typeof x.query === 'string'));
  assert.ok(cfg.candidates.every(x => x.status !== 'verified'));
});

test('mixed cross-project topics always remain reviewable', () => {
  assert.ok(cfg.reviewTerms.some(x => /tunnal/iu.test(x)));
});

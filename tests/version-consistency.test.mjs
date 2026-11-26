import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const readJson = relativePath => JSON.parse(read(relativePath));
const numericDottedVersion = /^\d+(?:\.\d+)+$/;

const packageJson = readJson('package.json');
const manifest = readJson('extension/manifest.json');
const readme = read('README.md').replaceAll('\r\n', '\n');

function singleMatch(pattern, description) {
  const matches = [...readme.matchAll(pattern)];
  assert.equal(matches.length, 1, `expected exactly one ${description}`);
  return matches[0];
}

test('keeps structured product versions numeric and equal', () => {
  assert.match(packageJson.version, numericDottedVersion);
  assert.match(manifest.version, numericDottedVersion);
  assert.equal(manifest.version, packageJson.version);
});

test('keeps the README version badge unique and aligned with the structured version', () => {
  const badge = singleMatch(
    /^\[!\[Version (\d+(?:\.\d+)+)\]\(https:\/\/img\.shields\.io\/badge\/version-(\d+(?:\.\d+)+)-2563eb\)\]\(package\.json\)$/gm,
    'README version badge',
  );

  assert.equal(badge[1], packageJson.version);
  assert.equal(badge[2], packageJson.version);
});

test('keeps the README Project Status version unique and aligned with the structured version', () => {
  const projectStatus = singleMatch(
    /^YouTube CD HUD is currently distributed as a \*\*source-only beta\*\*\. The current source version is \*\*(\d+(?:\.\d+)+)\*\* for both the userscript and the Manifest V3 Chrome extension\.$/gm,
    'README Project Status version statement',
  );

  assert.equal(projectStatus[1], packageJson.version);
});

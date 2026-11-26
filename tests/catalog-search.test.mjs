import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const sourcePath = path.join(projectRoot, 'src', 'youtube-cd-hud.user.js');
const source = fs.readFileSync(sourcePath, 'utf8');

const sandbox = {
  navigator: { languages: ['en'], language: 'en' },
  URL,
  URLSearchParams,
  Document: class Document {},
  DOMParser: class DOMParser {
    parseFromString(markup, type) {
      return { markup: String(markup), parser: 'inert', type };
    }
  },
  __YT_CD_HUD_TEST_MODE__: true,
  clearInterval,
  clearTimeout,
  console,
  setInterval,
  setTimeout,
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: sourcePath });

const {
  getCatalogTrackSearchUrl,
  getActiveCatalogTrackSearchUrl,
  bindCatalogSearchLink,
  isUnresolvedCatalogTitle,
  normalizeCatalogSearchProvider,
} = sandbox.__YT_CD_HUD_TEST_EXPORTS__;

const title = 'Tiesto & KSHMR - Secrets (Original Mix)';
const encoded = encodeURIComponent(title);

test('normalizes unknown catalog providers to Beatport', () => {
  assert.equal(normalizeCatalogSearchProvider('beatport'), 'beatport');
  assert.equal(normalizeCatalogSearchProvider('spotify'), 'spotify');
  assert.equal(normalizeCatalogSearchProvider('AppleMusic'), 'beatport');
  assert.equal(normalizeCatalogSearchProvider(''), 'beatport');
});

test('skips unresolved ID titles instead of opening a catalog search', () => {
  assert.equal(isUnresolvedCatalogTitle('ID'), true);
  assert.equal(isUnresolvedCatalogTitle('ID - ID'), true);
  assert.equal(isUnresolvedCatalogTitle('id — id'), true);
  assert.equal(isUnresolvedCatalogTitle('Unknown'), true);
  assert.equal(isUnresolvedCatalogTitle(title), false);
  assert.equal(getCatalogTrackSearchUrl('ID - ID', 'beatport'), '');
  assert.equal(getCatalogTrackSearchUrl('', 'spotify'), '');
});

test('builds official search pages for DJ-loadable catalogs', () => {
  assert.equal(
    getCatalogTrackSearchUrl(title, 'beatport'),
    'https://www.beatport.com/search?q=' + encoded,
  );
  assert.equal(
    getCatalogTrackSearchUrl(title, 'soundcloud'),
    'https://soundcloud.com/search/sounds?q=' + encoded,
  );
  assert.equal(
    getCatalogTrackSearchUrl(title, 'tidal'),
    'https://tidal.com/search?q=' + encoded,
  );
  assert.equal(
    getCatalogTrackSearchUrl(title, 'spotify'),
    'https://open.spotify.com/search/' + encoded,
  );
  assert.equal(
    getCatalogTrackSearchUrl(title, 'appleMusic'),
    'https://music.apple.com/search?term=' + encoded,
  );
});

test('uses the Beatport catalog by default for the HUD title link', () => {
  assert.equal(
    getActiveCatalogTrackSearchUrl(title),
    'https://www.beatport.com/search?q=' + encoded,
  );
});

function createFakeAnchor(initialAttributes = {}) {
  const attributes = new Map(Object.entries(initialAttributes));
  const element = {
    title: '',
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
  };
  for (const name of ['href', 'target', 'rel']) {
    Object.defineProperty(element, name, {
      get: () => attributes.get(name) ?? '',
      set: value => attributes.set(name, String(value)),
    });
  }
  return element;
}

test('removes navigation and exposes disabled semantics for unresolved titles', () => {
  const anchor = createFakeAnchor({
    href: 'https://www.beatport.com/search?q=previous',
    target: '_blank',
    rel: 'noopener noreferrer',
  });

  bindCatalogSearchLink(anchor, 'ID - ID');

  assert.equal(anchor.hasAttribute('href'), false);
  assert.equal(anchor.hasAttribute('target'), false);
  assert.equal(anchor.hasAttribute('rel'), false);
  assert.equal(anchor.getAttribute('aria-disabled'), 'true');
  assert.equal(anchor.getAttribute('aria-label'), 'This track has no searchable catalog title');
});

test('restores link semantics when a resolved title replaces an unresolved title', () => {
  const anchor = createFakeAnchor({ 'aria-disabled': 'true' });

  bindCatalogSearchLink(anchor, title);

  assert.equal(anchor.getAttribute('href'), 'https://www.beatport.com/search?q=' + encoded);
  assert.equal(anchor.getAttribute('target'), '_blank');
  assert.equal(anchor.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(anchor.hasAttribute('aria-disabled'), false);
});

const settingsSource = fs.readFileSync(path.join(projectRoot, 'extension', 'shared', 'settings.js'), 'utf8');
const settingsSandbox = {};
settingsSandbox.globalThis = settingsSandbox;
vm.createContext(settingsSandbox);
vm.runInContext(settingsSource, settingsSandbox, { filename: 'settings.js' });

test('persists catalog lookup in extension settings without accepting unknown services', () => {
  const normalized = settingsSandbox.YtCdHudSettings.normalize({ catalogSearch: 'tidal' });
  assert.equal(normalized.catalogSearch, 'tidal');
  assert.equal(settingsSandbox.YtCdHudSettings.normalize({ catalogSearch: 'youtube' }).catalogSearch, 'beatport');
  assert.equal(settingsSandbox.YtCdHudSettings.DEFAULTS.catalogSearch, 'beatport');
});

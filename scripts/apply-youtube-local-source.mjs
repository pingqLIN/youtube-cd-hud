import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const write = (relativePath, content) => fs.writeFileSync(path.join(projectRoot, relativePath), content, 'utf8');

function replaceOnce(text, search, replacement, label) {
  const index = text.indexOf(search);
  if (index < 0) throw new Error(`Patch target not found: ${label}`);
  if (text.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Patch target is not unique: ${label}`);
  }
  return text.slice(0, index) + replacement + text.slice(index + search.length);
}

function replaceFile(relativePath, updater) {
  const before = read(relativePath);
  const after = updater(before);
  if (after === before) throw new Error(`No changes produced for ${relativePath}`);
  write(relativePath, after);
}

const sourcePath = 'src/youtube-cd-hud.user.js';
let source = read(sourcePath);
source = replaceOnce(
  source,
  '// @name         YouTube CD Album & HUD Overlay (with selectable tracklist providers) v5.11.0',
  '// @name         YouTube CD Album & HUD Overlay (with selectable tracklist providers) v5.12.0',
  'userscript name version',
);
source = replaceOnce(source, '// @version      5.11.0', '// @version      5.12.0', 'userscript version');
source = replaceOnce(
  source,
  '// @description  Tampermonkey／Chrome 擴充雙版本、可選 1001Tracklists、MixesDB、TrackId.net 與 HUD 外觀',
  '// @description  Tampermonkey／Chrome 擴充雙版本、YouTube 說明欄／留言時間戳曲目與可選外部資料來源',
  'userscript description',
);
source = replaceOnce(
  source,
  "    let cacheHitVideoId = '';\n",
  "    let cacheHitVideoId = '';\n    let youtubeTrackOrigin = '';\n    let youtubeCommentsObserver = null;\n    let youtubeCommentsRoot = null;\n    let youtubeLocalRefreshTimer = null;\n",
  'YouTube local-source state',
);

const oldParserStart = source.indexOf('    function parseDescriptionTracks() {');
const oldParserEnd = source.indexOf('\n    function getAvailableRemoteSource()', oldParserStart);
if (oldParserStart < 0 || oldParserEnd < 0) throw new Error('Existing description parser boundary not found.');
const localSourceBlock = read('scripts/youtube-local-source-block.txt').trimEnd();
source = source.slice(0, oldParserStart) + localSourceBlock + source.slice(oldParserEnd);

let parserCallCount = 0;
source = source.replace(/^(\s*)parseDescriptionTracks\(\);/gm, (_match, indent) => {
  parserCallCount += 1;
  return `${indent}parseYouTubeLocalTracks();\n${indent}bindYouTubeCommentObserver();`;
});
if (parserCallCount !== 2) throw new Error(`Expected 2 description parser calls, replaced ${parserCallCount}.`);

source = replaceOnce(
  source,
  "        metadataRefreshTimers = [1000, 3000, 7000].map(delay => setTimeout(() => {",
  "        metadataRefreshTimers = [1000, 3000, 7000, 15000].map(delay => setTimeout(() => {",
  'metadata refresh delays',
);
source = replaceOnce(
  source,
  "            cacheHitVideoId = '';\n            restoredCacheSource = restoreCachedTracklists(videoId);",
  "            cacheHitVideoId = '';\n            youtubeTrackOrigin = '';\n            disconnectYouTubeCommentObserver();\n            restoredCacheSource = restoreCachedTracklists(videoId);",
  'new-video local-source reset',
);
source = replaceOnce(
  source,
  "            youtubeSourceBtn = createControlButton('YT', '使用 YouTube 章節曲目', () => {",
  "            youtubeSourceBtn = createControlButton('YT', '使用 YouTube 說明欄／留言時間戳曲目', () => {",
  'YT source button label',
);
source = replaceOnce(
  source,
  "        youtubeSourceBtn.title = hasYouTube ? '使用 YouTube 章節曲目' : '目前沒有 YouTube 章節曲目';",
  "        const youtubeOriginLabel = youtubeTrackOrigin === 'comments'\n            ? 'YouTube 留言時間戳曲目'\n            : youtubeTrackOrigin === 'description'\n                ? 'YouTube 說明欄時間戳曲目'\n                : 'YouTube 時間戳曲目';\n        youtubeSourceBtn.title = hasYouTube ? `使用 ${youtubeOriginLabel}` : '目前沒有可用的 YouTube 說明欄／留言時間戳曲目';",
  'YT source dynamic title',
);
source = replaceOnce(
  source,
  "            parseTrackIdDetail,\n            parseTimestampToSeconds,\n            parseTracklistDocument,",
  "            parseTrackIdDetail,\n            parseTimestampPlaylistText,\n            isCredibleTimestampPlaylist,\n            chooseYouTubeTimestampPlaylist,\n            parseTimestampToSeconds,\n            parseTracklistDocument,",
  'test exports for YouTube local-source helpers',
);
source = replaceOnce(
  source,
  "        window.addEventListener('resize', applySizing, false);\n        window.addEventListener('focus', handle1001VerificationReturn, false);",
  "        window.addEventListener('resize', applySizing, false);\n        window.addEventListener('scroll', scheduleYouTubeLocalSourceRefresh, { passive: true });\n        window.addEventListener('focus', handle1001VerificationReturn, false);",
  'scroll refresh listener',
);
source = replaceOnce(
  source,
  "        window.removeEventListener('resize', applySizing, false);\n        window.removeEventListener('focus', handle1001VerificationReturn, false);",
  "        window.removeEventListener('resize', applySizing, false);\n        window.removeEventListener('scroll', scheduleYouTubeLocalSourceRefresh, false);\n        window.removeEventListener('focus', handle1001VerificationReturn, false);",
  'scroll refresh cleanup',
);
source = replaceOnce(
  source,
  "        metadataRefreshTimers.forEach(timer => clearTimeout(timer));\n        metadataRefreshTimers = [];\n        if (cachePersistTimer !== null) {",
  "        metadataRefreshTimers.forEach(timer => clearTimeout(timer));\n        metadataRefreshTimers = [];\n        if (youtubeLocalRefreshTimer !== null) {\n            clearTimeout(youtubeLocalRefreshTimer);\n            youtubeLocalRefreshTimer = null;\n        }\n        disconnectYouTubeCommentObserver();\n        if (cachePersistTimer !== null) {",
  'comment observer cleanup',
);
write(sourcePath, source);

replaceFile('package.json', text => replaceOnce(text, '"version": "5.11.0"', '"version": "5.12.0"', 'package version'));
replaceFile('extension/manifest.json', text => replaceOnce(text, '"version": "5.11.0"', '"version": "5.12.0"', 'manifest version'));
replaceFile('extension/options/options.html', text => replaceOnce(text, '<strong>5.11.0</strong>', '<strong>5.12.0</strong>', 'options build version'));
replaceFile('tests/extension.test.mjs', text => replaceOnce(text, "assert.equal(manifest.version, '5.11.0');", "assert.equal(manifest.version, '5.12.0');", 'extension test version'));

replaceFile('README.md', text => {
  let next = text.replaceAll('5.11.0', '5.12.0');
  next = replaceOnce(
    next,
    "- Use YouTube's own native chapter title or timestamped tracks from the video description.",
    "- Use YouTube's own native chapter title or timestamped playlists found in the video description or currently loaded comments.",
    'English README YouTube source bullet',
  );
  next = replaceOnce(
    next,
    '2. If YouTube provides chapters or timestamped description tracks, YouTube CD HUD loads them as the `YT` source first.',
    '2. If YouTube provides chapters or a timestamped playlist in the description / loaded comments, YouTube CD HUD loads it as the `YT` source first.',
    'English README quick start',
  );
  next = replaceOnce(
    next,
    '| `YT` | Native YouTube chapter title or timestamped description tracks | No external match is required; this remains the preferred source when available |',
    '| `YT` | Native YouTube chapter title or timestamped playlists in the description / loaded comments | No external match is required; a credible description playlist wins, otherwise the best single loaded-comment playlist is used |',
    'English README YT source table',
  );
  next = replaceOnce(
    next,
    'Provider tracklists remain independent. The project does not combine two providers merely because some text happens to match.\n',
    'Provider tracklists remain independent. The project does not combine two providers merely because some text happens to match.\n\nFor the local `YT` timeline, the description is checked first. If it has fewer than two valid playlist cues, currently loaded comments are scanned; the strongest single comment is selected by track count, then timeline coverage. Late-loaded comments are rechecked as the comments DOM changes or after scrolling.\n',
    'English README local YT selection policy',
  );
  next = replaceOnce(
    next,
    '| YouTube description contains timestamped tracks | Loads them as `YT` and uses them by default |',
    '| YouTube description contains a credible timestamped playlist | Loads it as `YT` and uses it by default |\n| Description has no credible playlist, but a loaded comment does | Uses the strongest single comment playlist as `YT`; comments are never merged together |',
    'English README local source behavior',
  );
  next = replaceOnce(
    next,
    'The project does **not** request the Chrome `cookies` permission, call `chrome.cookies`, collect browsing history, or include analytics.\n',
    'The project does **not** request the Chrome `cookies` permission, call `chrome.cookies`, collect browsing history, or include analytics.\n\nDescription / comment scanning happens entirely against the YouTube page DOM already loaded in the browser. It does not call a YouTube comments API, request extra comment data, upload comment text, or add another host permission.\n',
    'English README local scan privacy',
  );
  return next;
});

replaceFile('README.zh-tw.md', text => {
  let next = text.replaceAll('5.11.0', '5.12.0');
  next = replaceOnce(
    next,
    '- 使用 YouTube 原生章節標題，或影片說明欄內帶時間戳的曲目資料。',
    '- 使用 YouTube 原生章節標題，或掃描影片說明欄與目前已載入留言中的時間戳 playlist。',
    'Traditional Chinese README YouTube source bullet',
  );
  next = replaceOnce(
    next,
    '2. 如果 YouTube 已提供章節或說明欄時間戳，YouTube CD HUD 會先載入成 `YT` 來源。',
    '2. 如果 YouTube 已提供章節，或說明欄／目前已載入留言含時間戳 playlist，YouTube CD HUD 會先載入成 `YT` 來源。',
    'Traditional Chinese README quick start',
  );
  next = replaceOnce(
    next,
    '| `YT` | YouTube 原生章節或說明欄時間戳 | 不需要外部匹配；有資料時預設優先使用 |',
    '| `YT` | YouTube 原生章節，或說明欄／目前已載入留言中的時間戳 playlist | 不需要外部匹配；可信的說明欄 playlist 優先，否則採用最佳單一留言 playlist |',
    'Traditional Chinese README YT source table',
  );
  next = replaceOnce(
    next,
    '不同供應者的 tracklist 彼此保持獨立；專案不會因為部分文字剛好相似，就把兩個來源的資料自動合併。\n',
    '不同供應者的 tracklist 彼此保持獨立；專案不會因為部分文字剛好相似，就把兩個來源的資料自動合併。\n\n`YT` 本機時間軸會先檢查說明欄。若說明欄少於兩個有效 playlist cue，才掃描目前已載入的留言；候選依曲目數量、再依時間軸涵蓋範圍排序，只採用單一留言。留言 DOM 後續載入或使用者捲動頁面時會重新檢查。\n',
    'Traditional Chinese README local YT selection policy',
  );
  next = replaceOnce(
    next,
    '| YouTube 說明欄有時間戳曲目 | 載入為 `YT`，並預設使用 |',
    '| YouTube 說明欄有可信的時間戳 playlist | 載入為 `YT`，並預設使用 |\n| 說明欄沒有可信 playlist，但已載入留言中有 | 選擇最佳單一留言 playlist 作為 `YT`；不會把多則留言合併 |',
    'Traditional Chinese README local source behavior',
  );
  next = replaceOnce(
    next,
    '專案**不要求** Chrome `cookies` 權限、不呼叫 `chrome.cookies`、不收集瀏覽紀錄，也沒有內建 analytics。\n',
    '專案**不要求** Chrome `cookies` 權限、不呼叫 `chrome.cookies`、不收集瀏覽紀錄，也沒有內建 analytics。\n\n說明欄／留言掃描只處理瀏覽器已載入的 YouTube 頁面 DOM；不呼叫 YouTube comments API、不額外要求留言資料、不上傳留言文字，也不新增 host permission。\n',
    'Traditional Chinese README local scan privacy',
  );
  return next;
});

console.log('Applied YouTube description/comments timestamp playlist source update.');

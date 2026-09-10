(function () {
    'use strict';

    const FALLBACK_LANGUAGE = 'zh-TW';
    const LOCALES = Object.freeze({
        'zh-TW': {
            languageName: '繁體中文',
            'options.title': 'YouTube CD HUD 控制台',
            'options.settings': '擴充功能與顯示設定',
            'options.versionInfo': '擴充版本資訊',
            'options.masterIndex': '總開關',
            'options.masterTitle': '擴充總開關',
            'options.masterDescription': '所有設定只保存在這個 Chrome 使用者資料中。',
            'options.enabled': 'HUD 開啟',
            'options.languageIndex': '語言',
            'options.languageTitle': '介面語言',
            'options.languageDescription': '自動會依系統語言切換；未支援的系統語言會使用繁體中文。',
            'options.languageAuto': '自動（系統語言）',
            'options.sourceIndex': '資料來源',
            'options.sourceTitle': '曲目資料來源',
            'options.enable1001': '啟用 1001',
            'options.enable1001Help': '顯示來源控制並允許遠端查詢',
            'options.autoSearch1001': '自動搜尋',
            'options.autoSearch1001Help': '影片切換後自動比對 1001Tracklists',
            'options.prefer1001': '優先採用 1001',
            'options.prefer1001Help': '搜尋成功後自動切換曲目來源',
            'options.enableMixesDb': '啟用 MixesDB',
            'options.enableMixesDbHelp': '允許手動搜尋 MediaWiki 曲目資料',
            'options.enableTrackId': '啟用 TrackId.net',
            'options.enableTrackIdHelp': '允許手動搜尋既有公開曲目清單或單曲資料',
            'options.timeout': '逾時秒數',
            'options.maxCandidates': '候選頁上限',
            'options.visualIndex': '外觀',
            'options.visualTitle': 'HUD 外觀',
            'options.showDisc': '顯示唱片',
            'options.showDiscHelp': '保留封面唱片與拖曳播放',
            'options.showTransport': '顯示跳曲控制',
            'options.showTransportHelp': '顯示上一首與下一首按鈕列',
            'options.titleFontSize': '曲名字級',
            'options.timeFontSize': '時間字級',
            'options.discScale': '唱片倍率',
            'options.surfaceOpacity': '面板不透明度',
            'options.fontFamily': 'HUD 字體',
            'options.fontFamilyHelp': '使用本機已安裝字體；未安裝時自動回退至 Cascadia Mono 或 Consolas',
            'options.fontDefault': 'Cascadia Mono / Digital Grid（預設）',
            'options.accentColor': '訊號色',
            'options.accentColorHelp': '焦點、作用中控制與刻度線',
            'options.overrideIndex': '覆寫',
            'options.customCss': '自訂 CSS',
            'options.customCssHelp': 'CSS 會直接套用到 YouTube 頁面。建議以 #yt-cd-hud 或 .yt-tracklist-panel 限定範圍。',
            'options.previewIndex': '即時監看',
            'options.previewTitle': '即時預覽',
            'options.previewCaption': 'YOUTUBE 播放器 / 1280×720',
            'options.storage': '資料儲存',
            'options.storageValue': 'Chrome 本機',
            'options.permissions': '頁面權限',
            'options.permissionValue': 'YouTube',
            'options.remoteRequests': '遠端查詢',
            'options.waiting': '等待調整',
            'options.loaded': '設定已載入',
            'options.unsaved': '尚未儲存的調整',
            'options.saved': '已儲存，開啟中的 YouTube 分頁會立即套用',
            'options.loadFailed': '無法讀取設定，已顯示預設值',
            'options.saveFailed': '儲存失敗，請重新開啟控制頁再試',
            'options.resetLoaded': '已載入預設值；按「儲存並套用」後生效',
            'options.reset': '恢復預設',
            'options.save': '儲存並套用',
            'hud.albumMode': '專輯模式',
            'hud.fullTrackSet': '完整曲目集',
            'hud.tracklist': '曲目清單',
            'hud.noTracklist': '找不到曲目清單',
            'hud.source': '曲目來源',
            'hud.searchGoogle': '使用 Google 搜尋：{track}',
            'hud.searchGoogleAria': '使用 Google 搜尋曲目：{track}',
            'hud.discScrub': '按住唱片：順時針快轉，逆時針循環短取樣；放開後繼續播放',
            'hud.idle': '尚未搜尋',
            'hud.searching': '搜尋中…',
            'hud.success': '已取得曲目',
            'hud.error': '搜尋失敗',
            'hud.expandSources': '{status}；展開曲目資料來源控制',
            'hud.youtubeComments': 'YouTube 留言時間戳曲目',
            'hud.youtubeDescription': 'YouTube 說明欄時間戳曲目',
            'hud.youtubeRecognized': 'YouTube 系統辨識或字幕時間戳曲目（低優先）',
            'hud.youtubeTimestamp': 'YouTube 時間戳曲目',
            'hud.useSource': '使用 {source}',
            'hud.unavailableYouTube': '目前沒有可用的 YouTube 說明欄或留言時間戳曲目',
            'hud.unavailableSource': '目前沒有可用的 {source}',
            'hud.viewSource': '在 {source} 查看原頁面',
            'hud.openVerify': '開啟 1001Tracklists 檢查或完成瀏覽器驗證',
            'hud.candidateNext': '切換至 {source} 候選 {next}，共 {count} 個候選',
            'hud.openSource': '開啟 {source} 曲目來源頁面',
            'hud.unavailablePage': '{source} 尚無可用來源頁面',
            'hud.closeTracklist': '關閉曲目清單',
            'hud.useYouTube': '使用 YouTube 說明欄或留言時間戳曲目',
            'hud.use1001': '使用 1001Tracklists 曲目',
            'hud.useMixesDb': '使用 MixesDB 曲目',
            'hud.useTrackId': '使用 TrackId.net 曲目',
            'hud.retry1001': '重新搜尋 1001Tracklists',
            'hud.open1001': '開啟 1001Tracklists 頁面',
            'hud.searchMixesDb': '搜尋 MixesDB',
            'hud.searchTrackId': '搜尋 TrackId.net 既有曲目',
            'hud.openMixesDb': '開啟 MixesDB 頁面',
            'hud.openTrackId': '開啟 TrackId.net 頁面',
            'hud.toggleTracklist': '顯示或隱藏曲目清單',
            'hud.previousTrack': '跳到上一首曲目',
            'hud.nextTrack': '跳到下一首曲目',
            'hud.closeHud': '關閉 HUD（重新載入後恢復）',
            'hud.textSize': '左鍵或 Enter 放大字級；右鍵縮小；方向鍵可增減',
            'hud.resize': '拖曳或使用左右方向鍵調整 HUD 寬度；Home 恢復自動寬度',
        },
        en: {
            languageName: 'English', 'options.title': 'YouTube CD HUD Console', 'options.settings': 'Extension and display settings', 'options.versionInfo': 'Extension version information', 'options.masterIndex': '00 / MASTER', 'options.masterTitle': 'Extension master switch', 'options.masterDescription': 'All settings stay in this Chrome profile.', 'options.enabled': 'HUD ON', 'options.languageIndex': 'LANGUAGE', 'options.languageTitle': 'Interface language', 'options.languageDescription': 'Auto follows your system language. Unsupported system languages use Traditional Chinese.', 'options.languageAuto': 'Auto (system language)', 'options.sourceIndex': '01 / SOURCE', 'options.sourceTitle': 'Tracklist sources', 'options.enable1001': 'Enable 1001', 'options.enable1001Help': 'Show source controls and allow remote lookups', 'options.autoSearch1001': 'Auto-search', 'options.autoSearch1001Help': 'Match 1001Tracklists when the video changes', 'options.prefer1001': 'Prefer 1001', 'options.prefer1001Help': 'Switch source after a successful search', 'options.enableMixesDb': 'Enable MixesDB', 'options.enableMixesDbHelp': 'Allow manual MediaWiki tracklist searches', 'options.enableTrackId': 'Enable TrackId.net', 'options.enableTrackIdHelp': 'Allow manual searches for public tracklists or tracks', 'options.timeout': 'Timeout', 'options.maxCandidates': 'Candidate limit', 'options.visualIndex': '02 / VISUAL', 'options.visualTitle': 'HUD appearance', 'options.showDisc': 'Show disc', 'options.showDiscHelp': 'Keep the cover disc and drag playback', 'options.showTransport': 'Show track controls', 'options.showTransportHelp': 'Show previous and next track buttons', 'options.titleFontSize': 'Title size', 'options.timeFontSize': 'Time size', 'options.discScale': 'Disc scale', 'options.surfaceOpacity': 'Panel opacity', 'options.fontFamily': 'HUD font', 'options.fontFamilyHelp': 'Use installed local fonts; falls back to Cascadia Mono or Consolas.', 'options.fontDefault': 'Cascadia Mono / Digital Grid (default)', 'options.accentColor': 'Signal color', 'options.accentColorHelp': 'Focus, active controls, and grid lines', 'options.overrideIndex': '03 / OVERRIDE', 'options.customCss': 'Custom CSS', 'options.customCssHelp': 'CSS is applied directly to YouTube. Scope it with #yt-cd-hud or .yt-tracklist-panel.', 'options.previewIndex': 'LIVE MONITOR', 'options.previewTitle': 'Live preview', 'options.previewCaption': 'YOUTUBE PLAYER / 1280×720', 'options.storage': 'Storage', 'options.storageValue': 'Chrome local', 'options.permissions': 'Page access', 'options.permissionValue': 'YouTube', 'options.remoteRequests': 'Remote lookups', 'options.waiting': 'Waiting for changes', 'options.loaded': 'Settings loaded', 'options.unsaved': 'Unsaved changes', 'options.saved': 'Saved. Open YouTube tabs apply the changes immediately.', 'options.loadFailed': 'Could not read settings; showing defaults.', 'options.saveFailed': 'Could not save settings. Reopen this page and try again.', 'options.resetLoaded': 'Defaults loaded. Select “Save and apply” to use them.', 'options.reset': 'Restore defaults', 'options.save': 'Save and apply', 'hud.albumMode': 'Album mode', 'hud.fullTrackSet': 'Full track set', 'hud.tracklist': 'TRACKLIST', 'hud.noTracklist': 'No tracklist found', 'hud.source': 'Tracklist source', 'hud.searchGoogle': 'Search Google: {track}', 'hud.searchGoogleAria': 'Search Google for track: {track}', 'hud.discScrub': 'Hold the disc: clockwise fast-forwards; counter-clockwise loops a short sample; release to resume playback.', 'hud.idle': 'Not searched', 'hud.searching': 'Searching…', 'hud.success': 'Tracks loaded', 'hud.error': 'Search failed', 'hud.expandSources': '{status}; expand tracklist source controls', 'hud.youtubeComments': 'YouTube comment timestamp tracks', 'hud.youtubeDescription': 'YouTube description timestamp tracks', 'hud.youtubeRecognized': 'YouTube recognized or caption timestamp tracks (lower priority)', 'hud.youtubeTimestamp': 'YouTube timestamp tracks', 'hud.useSource': 'Use {source}', 'hud.unavailableYouTube': 'No YouTube description or comment timestamp tracks are available', 'hud.unavailableSource': 'No {source} tracks are available', 'hud.viewSource': 'View source page on {source}', 'hud.openVerify': 'Open 1001Tracklists to check or complete browser verification', 'hud.candidateNext': 'Switch to {source} candidate {next} of {count}', 'hud.openSource': 'Open {source} tracklist source page', 'hud.unavailablePage': 'No source page is available for {source}', 'hud.closeTracklist': 'Close tracklist', 'hud.useYouTube': 'Use YouTube description or comment timestamp tracks', 'hud.use1001': 'Use 1001Tracklists tracks', 'hud.useMixesDb': 'Use MixesDB tracks', 'hud.useTrackId': 'Use TrackId.net tracks', 'hud.retry1001': 'Search 1001Tracklists again', 'hud.open1001': 'Open 1001Tracklists page', 'hud.searchMixesDb': 'Search MixesDB', 'hud.searchTrackId': 'Search existing TrackId.net tracks', 'hud.openMixesDb': 'Open MixesDB page', 'hud.openTrackId': 'Open TrackId.net page', 'hud.toggleTracklist': 'Show or hide tracklist', 'hud.previousTrack': 'Go to previous track', 'hud.nextTrack': 'Go to next track', 'hud.closeHud': 'Close HUD (returns after reload)', 'hud.textSize': 'Left-click or Enter increases text size; right-click decreases it; arrow keys adjust it.', 'hud.resize': 'Drag or use left and right arrow keys to resize the HUD; Home restores automatic width.'
        },
        ja: {
            languageName: '日本語', 'options.title': 'YouTube CD HUD コンソール', 'options.settings': '拡張機能と表示の設定', 'options.versionInfo': '拡張機能のバージョン情報', 'options.masterIndex': '00 / メイン', 'options.masterTitle': '拡張機能のメインスイッチ', 'options.masterDescription': '設定はこの Chrome プロフィール内にのみ保存されます。', 'options.enabled': 'HUD オン', 'options.languageIndex': '言語', 'options.languageTitle': '表示言語', 'options.languageDescription': '自動ではシステム言語に従います。未対応の言語は繁体字中国語になります。', 'options.languageAuto': '自動（システム言語）', 'options.sourceIndex': '01 / ソース', 'options.sourceTitle': 'トラックリストの情報源', 'options.enable1001': '1001 を有効化', 'options.enable1001Help': '情報源の操作を表示し、リモート検索を許可します', 'options.autoSearch1001': '自動検索', 'options.autoSearch1001Help': '動画の切替時に 1001Tracklists を照合します', 'options.prefer1001': '1001 を優先', 'options.prefer1001Help': '検索成功後に情報源を切り替えます', 'options.enableMixesDb': 'MixesDB を有効化', 'options.enableMixesDbHelp': 'MediaWiki のトラックリストを手動検索できます', 'options.enableTrackId': 'TrackId.net を有効化', 'options.enableTrackIdHelp': '公開トラックリストまたは曲を手動検索できます', 'options.timeout': 'タイムアウト', 'options.maxCandidates': '候補ページ上限', 'options.visualIndex': '02 / 外観', 'options.visualTitle': 'HUD の外観', 'options.showDisc': 'ディスクを表示', 'options.showDiscHelp': 'カバーディスクとドラッグ再生を保持します', 'options.showTransport': '曲送りを表示', 'options.showTransportHelp': '前後の曲ボタンを表示します', 'options.titleFontSize': '曲名の文字サイズ', 'options.timeFontSize': '時間の文字サイズ', 'options.discScale': 'ディスク倍率', 'options.surfaceOpacity': 'パネルの不透明度', 'options.fontFamily': 'HUD フォント', 'options.fontFamilyHelp': 'ローカルにあるフォントを使用し、なければ Cascadia Mono または Consolas を使います。', 'options.fontDefault': 'Cascadia Mono / Digital Grid（既定）', 'options.accentColor': 'シグナルカラー', 'options.accentColorHelp': 'フォーカス、操作中のコントロール、目盛線', 'options.overrideIndex': '03 / 上書き', 'options.customCss': 'カスタム CSS', 'options.customCssHelp': 'CSS は YouTube ページへ直接適用されます。#yt-cd-hud または .yt-tracklist-panel で範囲を限定してください。', 'options.previewIndex': 'ライブモニター', 'options.previewTitle': 'ライブプレビュー', 'options.previewCaption': 'YOUTUBE プレーヤー / 1280×720', 'options.storage': '保存先', 'options.storageValue': 'Chrome ローカル', 'options.permissions': 'ページ権限', 'options.permissionValue': 'YouTube', 'options.remoteRequests': 'リモート検索', 'options.waiting': '変更待ち', 'options.loaded': '設定を読み込みました', 'options.unsaved': '未保存の変更', 'options.saved': '保存しました。開いている YouTube タブへすぐに反映されます。', 'options.loadFailed': '設定を読み込めません。既定値を表示しています。', 'options.saveFailed': '保存できませんでした。設定ページを開き直して再試行してください。', 'options.resetLoaded': '既定値を読み込みました。「保存して適用」で反映されます。', 'options.reset': '既定値に戻す', 'options.save': '保存して適用', 'hud.albumMode': 'アルバムモード', 'hud.fullTrackSet': '全曲セット', 'hud.tracklist': 'トラックリスト', 'hud.noTracklist': 'トラックリストが見つかりません', 'hud.source': 'トラックリストの情報源', 'hud.searchGoogle': 'Google で検索：{track}', 'hud.searchGoogleAria': 'Google で曲を検索：{track}', 'hud.discScrub': 'ディスクを長押し：時計回りで早送り、反時計回りで短いサンプルをループ。離すと再生を再開します。', 'hud.idle': '未検索', 'hud.searching': '検索中…', 'hud.success': '曲を取得しました', 'hud.error': '検索失敗', 'hud.expandSources': '{status}。トラックリストの情報源を展開', 'hud.youtubeComments': 'YouTube コメントのタイムスタンプ曲目', 'hud.youtubeDescription': 'YouTube 説明欄のタイムスタンプ曲目', 'hud.youtubeRecognized': 'YouTube 認識または字幕のタイムスタンプ曲目（低優先）', 'hud.youtubeTimestamp': 'YouTube タイムスタンプ曲目', 'hud.useSource': '{source} を使用', 'hud.unavailableYouTube': '使用可能な YouTube 説明欄またはコメントのタイムスタンプ曲目がありません', 'hud.unavailableSource': '使用可能な {source} 曲目がありません', 'hud.viewSource': '{source} で元のページを表示', 'hud.openVerify': '1001Tracklists を開いてブラウザー認証を確認または完了します', 'hud.candidateNext': '{source} の候補 {next}/{count} に切り替え', 'hud.openSource': '{source} のトラックリストページを開く', 'hud.unavailablePage': '{source} のページはまだ利用できません', 'hud.closeTracklist': 'トラックリストを閉じる', 'hud.useYouTube': 'YouTube の説明欄またはコメントのタイムスタンプ曲目を使用', 'hud.use1001': '1001Tracklists の曲目を使用', 'hud.useMixesDb': 'MixesDB の曲目を使用', 'hud.useTrackId': 'TrackId.net の曲目を使用', 'hud.retry1001': '1001Tracklists を再検索', 'hud.open1001': '1001Tracklists ページを開く', 'hud.searchMixesDb': 'MixesDB を検索', 'hud.searchTrackId': '既存の TrackId.net 曲目を検索', 'hud.openMixesDb': 'MixesDB ページを開く', 'hud.openTrackId': 'TrackId.net ページを開く', 'hud.toggleTracklist': 'トラックリストを表示または非表示', 'hud.previousTrack': '前の曲へ', 'hud.nextTrack': '次の曲へ', 'hud.closeHud': 'HUD を閉じる（再読み込みで戻ります）', 'hud.textSize': '左クリックまたは Enter で文字を大きく、右クリックで小さく、方向キーで調整します。', 'hud.resize': 'ドラッグまたは左右キーで HUD の幅を調整します。Home で自動幅に戻ります。'
        },
    });

    function resolveLanguage(preference = 'auto', systemLanguages) {
        const settingsApi = globalThis.YtCdHudSettings;
        if (settingsApi?.resolveLanguage) return settingsApi.resolveLanguage(preference, systemLanguages);
        const values = Array.isArray(systemLanguages)
            ? systemLanguages
            : typeof navigator !== 'undefined'
                ? navigator.languages || [navigator.language]
                : [];
        const selected = preference === 'auto' ? values.find(value => /^(zh|en|ja)(-|$)/i.test(value)) : preference;
        if (/^en(-|$)/i.test(selected || '')) return 'en';
        if (/^ja(-|$)/i.test(selected || '')) return 'ja';
        return FALLBACK_LANGUAGE;
    }

    function translate(key, language, values = {}) {
        const message = LOCALES[language]?.[key] ?? LOCALES[FALLBACK_LANGUAGE][key] ?? key;
        return message.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
    }

    function localizeDocument(root, language) {
        const locale = resolveLanguage(language);
        root.documentElement?.setAttribute('lang', locale);
        root.querySelectorAll?.('[data-i18n]').forEach(element => {
            element.textContent = translate(element.dataset.i18n, locale);
        });
        root.querySelectorAll?.('[data-i18n-title]').forEach(element => {
            element.title = translate(element.dataset.i18nTitle, locale);
        });
        root.querySelectorAll?.('[data-i18n-aria-label]').forEach(element => {
            element.setAttribute('aria-label', translate(element.dataset.i18nAriaLabel, locale));
        });
        root.querySelectorAll?.('[data-i18n-placeholder]').forEach(element => {
            element.placeholder = translate(element.dataset.i18nPlaceholder, locale);
        });
        return locale;
    }

    globalThis.YtCdHudI18n = Object.freeze({ FALLBACK_LANGUAGE, LOCALES, resolveLanguage, translate, localizeDocument });
})();

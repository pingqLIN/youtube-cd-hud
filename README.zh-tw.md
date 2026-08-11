# YouTube CD HUD

YouTube CD HUD 是 Tampermonkey Userscript，會在 YouTube 加入唱片風格 HUD、
章節與曲目清單、封面取色，以及選用的 1001Tracklists 搜尋功能。

目前可安裝版本是 `src/youtube-cd-hud.user.js`（v5.4.0）。

## v5.4.0 修正

- 改用 1001Tracklists 現行 POST 搜尋格式。
- 搜尋前移除 YouTube 標題中常見的 Official、Live、4K、Full Set 等後綴。
- 依標題關鍵字相似度排列搜尋結果。
- 前一個結果沒有時間戳時，自動嘗試最多五個候選曲目頁。
- 可從畫面時間、隱藏的 `cue_seconds` 欄位或 cue 操作資料讀取時間戳。
- YouTube 單頁換片時中止舊請求並清除舊計時器。
- Trusted Types 解析維持在限定範圍，第三方解析 DOM 不會插入 YouTube 頁面。

## 安裝

把 `src/youtube-cd-hud.user.js` 匯入 Tampermonkey，停用舊版本，並完整重新
載入 YouTube 分頁。

## 驗證

```powershell
npm run check
npm test
```

這些是本機檢查；最終仍需在操作者的實際瀏覽器設定檔完成可見的 YouTube
影片驗收。

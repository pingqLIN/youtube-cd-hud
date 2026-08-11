# 對話交接摘要

## 目標

將原本附掛在 DevGov 對話中的 YouTube CD HUD Userscript 移至獨立專案，
保留所有來源版本，並修復 1001Tracklists 搜尋與時間戳解析。

## 新儲存位置

`Q:\Projects\youtube-cd-hud`

## 已確認的問題與決策

1. 1001Tracklists 搜尋已從舊的 `GET /search/?q=...` 改為
   `POST /search/result.php`，欄位為 `main_search` 與
   `search_selection=9`。
2. 強制使用 `GM_xmlhttpRequest.responseType = "document"` 在部分
   Tampermonkey/Chrome 組合無法取得 Document，因此改回文字回應、驗證
   Content-Type，再以 Trusted Types 相容方式解析。
3. 搜尋頁可能回傳多個相關但不完全相同的曲目頁；只選第一個結果會造成
   「頁面載入成功但沒有時間戳」的假失敗。
4. 現行曲目頁的時間戳可見於 `.cue`，同時也保存在
   `input[id$="_cue_seconds"]`；v5.4.0 同時支援兩者。
5. 原附件與 v5.3、v5.3.1、v5.3.2 已保存於 `archive/`，不得覆寫或刪除。

## 目前驗收邊界

本機語法與單元測試可驗證搜尋標題、候選排序與時間戳解析，但不代表
Tampermonkey 權限、YouTube DOM、1001Tracklists 防護或真實瀏覽器 UI 已通過。
最終需要操作者在實際 Chrome/Tampermonkey 環境重新載入並觀察 HUD。

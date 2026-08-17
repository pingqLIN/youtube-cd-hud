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
6. Chrome DevTools 已確認指定曲目頁的原始 HTML 含 18 筆 `.bItm`、`.cue`
   與 `cue_seconds`；Chrome 的 `Document.parseHTML()` 卻會把曲目列全部移除。
   v5.4.1 因此改由 Trusted Types 限定 policy 與惰性 `DOMParser` 優先解析。
7. v5.5.0 改用 16:9 `mqdefault.jpg` 與 `background-size: cover`，避免圓盤
   露邊及 4:3 縮圖黑邊；HUD 同步套用硬邊工業遙測色票與互動狀態。
8. v5.5.1 將狀態燈恢復為圓形，允許 1001Tracklists 的所有成功 HTTP 2xx
   回應繼續解析，並加入按住唱片後以順／逆時針控制快轉與 80 毫秒短取樣
   循環的互動；放開唱片會自動恢復播放。HUD 右上角另有關閉按鈕，會連同
   曲目面板隱藏至分頁重新載入。
9. v5.5.2 依 Chrome DevTools 實際回應新增 1001Tracklists 自有
   `unblock_ip` 限流 CAPTCHA 偵測。即使封鎖頁使用 HTTP 200／206，也會在
   第一個候選停止並提示完成瀏覽器驗證，不再誤報候選頁沒有時間戳。
10. v5.6.0 修正曲目面板因 CSS `display: none` 無法顯示的問題；CD 改為依
    視窗短邊在 44–64px 間自適應。關閉與 `T−`／`T+` 垂直排列於右側，1001
    狀態、連結與曲目控制則重組為下方來源操作列；常駐的
    `SRC | YT | 1001` 分段選擇器會標示目前來源，無資料來源則可見但停用。
11. v5.7.0 將 1001 改為可展開的複合控制，內含來源選用、重試與原頁連結；
    曲目開關移至右側，來源區下方加入前／後曲目跳躍。CD 尺寸同時跟隨視窗
    與文字大小；HUD、曲目面板均保留拖移並新增右下縮放把手，曲目面板另有
    標題列與右上關閉按鈕。
12. v5.7.1 增加 CD 左右留白並將預設直徑提高為 v5.7.0 的 120%；HUD 最小
    寬高會依目前曲目文字與全部控制元件動態計算，防止手動縮放造成裁切，
    最大可用範圍仍受 YouTube 播放器限制。
13. v5.8.0 新增 `extension/` Manifest V3 擴充版；其內容 HUD 由
    `src/youtube-cd-hud.user.js` 產生，`scripts/build-extension.mjs` 負責同步。
    擴充控制頁可調整 1001 查詢行為、HUD 字級、CD 倍率、透明度、訊號色、
    顯示元件與自訂 CSS。設定只保存在 `chrome.storage.local`，1001 跨站請求
    由背景 service worker 執行；當時採匿名請求，後續由 v5.8.3 改為可使用
    1001 網站既有的驗證狀態。
14. v5.8.1 將 HUD 寬高鎖定為內容自然尺寸，縮放把手改為等比例縮放；來源與
    固定寬度跳曲按鈕合併為同一列，CD 依右側內容高度平衡並加入游標追蹤
    反光。1001 為目前來源時，HUD 標題只取用 1001 曲名，不再讀取 YouTube
    播放器的系統章節標籤。面板不透明左界改為 CD 圓心，CD 左半伸出面板，
    其外接矩形保持透明且可穿透滑鼠；CD 貼齊面板上下邊。擴充版 1001 橋接
    另補 callback 相容路徑、分階段錯誤、明確逾時與停用快取。
15. v5.8.2 確認擴充版的 CAPTCHA 訊息來自候選曲目 GET 成功載入的真實
    1001 IP 阻擋頁，並非背景橋接失效或 parser 誤判。搜尋到候選請求及每次
    候選回退加入 1.2 秒節流；阻擋後自動搜尋冷卻五分鐘，人工完成 CAPTCHA
    後的 `RETRY SEARCH` 可立即略過冷卻。擴充背景恢復預設快取；該版仍採匿名
    請求，後續由 v5.8.3 的網站驗證狀態支援取代。
    同版另將「顯示唱片」改為只切換 CD 可見性與互動；CD 占位及面板圓心左界
    保持不變，文字和控制元件不再因開關唱片而位移，擴充設定預覽同步此行為。
16. v5.8.3 修復「一般 1001 分頁已可閱讀，但擴充背景仍判定 CAPTCHA」：背景
    fetch 從 `credentials: 'omit'` 改為 `include`，使 Chrome 可對既有 HTTPS
    1001 allowlist 請求附帶網站自己的驗證 Cookie。Manifest 未新增 `cookies`
    權限，程式未呼叫 `chrome.cookies`，不讀取、儲存或輸出 Cookie 值。

## 目前驗收邊界

本機語法與單元測試可驗證搜尋標題、候選排序與時間戳解析，但不代表
Tampermonkey 權限、YouTube DOM、1001Tracklists 防護或真實瀏覽器 UI 已通過。
最終需要操作者在實際 Chrome/Tampermonkey 環境重新載入並觀察 HUD。

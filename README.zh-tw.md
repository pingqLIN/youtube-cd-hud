# YouTube CD HUD

![YouTube CD HUD 吉祥物 Vinyl Sentinel 位於簡潔的深色音訊工作室](docs/assets/readme/youtube-cd-hud-mascot-banner-v3.png)

[English](README.md)

YouTube CD HUD 的核心功能是依目前 YouTube 影片搜尋可選的曲目資料來源、匯入
帶時間戳的曲目，並讓目前曲目隨播放時間同步更新。同時相容 YouTube 原生章節
標題與影片說明欄內的時間戳曲目；既有 YouTube 曲目資訊會維持為預設來源，
不會因 1001Tracklists 搜尋而被強制取代。

同步後的曲目資訊會呈現在唱片風格 HUD 與曲目面板中。專案同時提供
Tampermonkey Userscript 與 Manifest V3 Chrome 擴充版。

Userscript 原始檔位於 `src/youtube-cd-hud.user.js`，可載入的 Chrome 擴充位於
`extension/`；兩個版本目前皆為 v5.9.0。

## 功能亮點

- 以正規化後的 YouTube 影片標題搜尋 1001Tracklists、排列相符結果，並依序
  嘗試含時間戳的候選曲目頁。
- 提供互相獨立的 MixesDB 與 TrackId.net 手動查詢。優先採用完全相同的
  YouTube ID；備援候選仍須通過標題與錄音長度檢查。
- 將選定曲目來源與 YouTube 播放位置同步：自動高亮目前曲目，並提供上一曲／
  下一曲跳轉。
- 相容 YouTube 原生章節標題與影片說明欄的時間戳曲目。可在 `YT` 與 `1001`
  來源間切換；兩者都有資料時，預設仍優先使用 YouTube。
- 明確辨識 1001Tracklists CAPTCHA／IP 限制頁，自動查詢暫停五分鐘；完成網站
  驗證後仍可手動重試。
- 以可拖移、等比例縮放的唱片風格 HUD 呈現同步資料，並提供圓形影片封面、
  封面取色、曲目面板與唱片拖曳播放。

## 曲目來源與同步方式

| 狀況 | 行為 |
|---|---|
| YouTube 說明欄含時間戳曲目 | 載入為 `YT` 來源，並預設使用這份曲目。 |
| YouTube 顯示原生章節標題 | 使用 `YT` 來源時同步顯示該章節標題。 |
| 1001Tracklists 找到含時間戳的曲目 | 新增可切換的 `1001` 來源，並依同一影片播放時間同步。 |
| MixesDB 或 TrackId.net 找到可信結果 | 新增獨立的可切換來源，不與其他供應者資料自動合併。 |
| 多個來源都有資料 | 預設保持 `YT`；啟用「優先採用 1001」後，可在 1001 搜尋成功時自動切換。 |
| 1001Tracklists 遭阻擋或沒有可用結果 | 保留現有 YouTube 來源，顯示 1001 搜尋狀態，不會覆蓋原有曲目。 |

切換來源時，曲目清單、目前曲目高亮、HUD 曲名與上一曲／下一曲目標會一起
更新，不會改變當下的 YouTube 播放時間。

## 安裝

### Tampermonkey

1. 把 `src/youtube-cd-hud.user.js` 匯入 Tampermonkey。
2. 停用較舊的重複腳本。
3. 完整重新載入 YouTube 分頁。

### Chrome 擴充功能

1. 修改共用 userscript 原始碼後，執行 `npm run build:extension`。
2. 開啟 `chrome://extensions`，啟用「開發人員模式」，選擇「載入未封裝項目」。
3. 選取本專案的 `extension/` 目錄。
4. 開啟擴充控制頁、儲存偏好設定，再重新載入已開啟的 YouTube 分頁。

目前是原始碼散布形式，本說明未宣稱它已在 Chrome 線上應用程式商店發布。

## 控制頁

控制頁可調整 HUD 總開關、啟用的曲目資料來源、1001Tracklists 行為、字級、唱片倍率、面板透明度、
訊號色、顯示控制與自訂 CSS；建議使用 `#yt-cd-hud` 或
`.yt-tracklist-panel` 自行限定選擇器範圍。

![YouTube CD HUD 控制頁顯示預設本機設定與即時 HUD 預覽](docs/assets/readme/youtube-cd-hud-options-overview.png)

下圖記錄一次實際控制頁操作：把訊號色改為亮黃、唱片倍率調為 115%、面板
不透明度調為 92%、隱藏跳曲控制，並由設定表單回報儲存成功。

![YouTube CD HUD 控制頁完成亮黃訊號色、115% 唱片倍率、92% 不透明度與隱藏跳曲控制設定](docs/assets/readme/youtube-cd-hud-options-configured.png)

截圖實際執行專案內的 `options.html`、`options.css`、`settings.js` 與
`options.js`；僅以有界的記憶體介面替代 `chrome.storage.local`，未使用個人
Chrome 設定檔或瀏覽資料。因此它能驗證控制頁互動，但不能取代 YouTube 分頁
上的安裝與操作驗收。

## 隱私與權限

- 擴充偏好只保存在 Chrome 本機儲存空間。
- Manifest 僅要求 `storage`，主機存取範圍限制於 YouTube、1001Tracklists、
  MixesDB 與 TrackId.net 的 HTTPS 頁面。
- 擴充沒有 `cookies` 權限，不呼叫 `chrome.cookies`，也不讀取或輸出 Cookie
  值。
- 啟用 1001Tracklists 整合後，Chrome 可在 allowlist HTTPS 請求附帶該網站
  自己的驗證 Cookie；擴充本身無法讀取這些 Cookie 值。
- MixesDB 與 TrackId.net 僅使用不帶憑證的匿名唯讀請求；擴充不會上傳音訊，
  也不會提交新的辨識工作。
- 專案不收集瀏覽紀錄、帳密或分析資料。

## 吉祥物

Vinyl Sentinel 是本專案的原創唱片守護者。手腕、唱片外圈與鞋底的亮黃色細節
呼應高辨識度 cue 標記，青藍與洋紅光線則延續 HUD 的工業遙測語彙。

![Vinyl Sentinel 在午夜聆聽室把 cue 光點放到唱盤上](docs/assets/readme/youtube-cd-hud-mascot-listening-room-v1.png)

![Vinyl Sentinel 在簡潔控制桌引導三張抽象曲目卡](docs/assets/readme/youtube-cd-hud-mascot-tracklist-desk-v1.png)

吉祥物與場景是為本專案建立的原創生成圖像，不重製第三方角色、標誌或介面
截圖。

## 開發與驗證

```powershell
npm run check
npm test
```

`npm run check` 會確認擴充內容腳本與 userscript 原始碼同步，並執行 JavaScript
語法檢查；`npm test` 會執行 Node.js 測試。這些都屬於本機檢查；最終仍需在
操作者的實際瀏覽器設定檔，使用 userscript 或未封裝擴充完成可見的 YouTube
影片驗收。

## 版本紀錄

### v5.9.0

- 以獨立 adapter 新增可選的 MixesDB 與 TrackId.net 曲目來源。
- 兩個補充來源都維持手動、唯讀查詢；候選結果會依來源 URL／YouTube ID，並以
  標題、錄音長度與時間戳覆蓋範圍作保守驗證。
- 各供應者曲目維持分離，由操作者明確選擇目前來源，不自動合併。

### v5.8.3

- 擴充背景的 1001 請求會使用 Chrome 已有的 1001Tracklists 網站驗證狀態，
  解決一般分頁可閱讀、背景抓取卻仍收到 CAPTCHA 阻擋頁的差異。
- 擴充沒有新增 `cookies` 權限，也不讀取、儲存或輸出 Cookie；Chrome 只會在
  既有 HTTPS 1001 allowlist 請求上附帶該網站自己的 Cookie。

### v5.8.2

- 關閉「顯示唱片」現在只隱藏 CD 圖像與互動，保留原本占位及面板圓心左界，
  因此曲名、控制列與整個 HUD 不會左右跳動；設定頁預覽亦採相同行為。
- 1001 搜尋頁與候選曲目頁之間加入 1.2 秒節流，候選回退也不再連續瞬間發送。
- 偵測到 1001 的 IP/CAPTCHA 阻擋頁後，自動查詢會暫停五分鐘；操作者完成
  CAPTCHA 後仍可使用 `RETRY SEARCH` 立即重試。
- 擴充背景請求恢復使用瀏覽器預設快取，避免反覆重載同一候選頁；該版仍採
  匿名請求，已由 v5.8.3 的網站驗證狀態支援取代。Console 會附上失敗階段、
  候選序號、HTTP 狀態與 URL。

### v5.8.1

- HUD 寬高改為鎖定完整內容的自然尺寸；右下角把手改為等比例縮放 HUD，
  不再把面板拉成含大片空白的畫布。
- 面板的不透明左界改為穿過 CD 圓心；CD 左半自然伸出面板，外接矩形區保持
  完全透明並可讓滑鼠事件穿透。CD 同時貼合面板上下邊，形成內接的半懸浮構圖。
- CD 預設會比右側曲名、時間與控制列總高度略高，並加入隨滑鼠位置移動的
  唱片表面反光；拖曳唱片時反光會暫停，避免干擾快轉與短取樣操作。
- 將 `SRC / YT / 1001` 與固定寬度的上一曲／下一曲按鈕整合為同一列，兩組
  控制間保留細分隔線與間距。
- 當目前來源為 1001 時，HUD 只使用 1001 的當前曲名，不再被 YouTube
  播放器的「影片相關資訊」等系統章節標籤覆蓋。
- 擴充版的 1001 背景橋接改用相容性較高的 callback 回應路徑，補上分階段
  錯誤資訊與明確逾時。

### v5.8.0

- 在保留 Tampermonkey 版本的同時，新增 Manifest V3 Chrome 擴充版。
- 新增獨立擴充控制頁，可開關 HUD、調整 1001 搜尋行為、曲名與時間字級、
  CD 倍率、面板透明度、訊號色、個別控制列顯示，以及套用自訂 CSS；建議
  使用 `#yt-cd-hud` 或 `.yt-tracklist-panel` 自行限定選擇器範圍。
- 擴充設定只保存在 Chrome 本機，開啟中的 YouTube 分頁可即時套用。
- 跨站權限只限 YouTube 與 1001Tracklists；不收集瀏覽紀錄、帳密、Cookie
  值或分析資料。Chrome 可在 1001 請求中附帶該網站既有的驗證 Cookie，但
  擴充不具備讀取 Cookie 的權限。

### v5.7.1

- 增加 CD 左右兩側留白，預設 CD 直徑調整為原本的 120%。
- HUD 會依目前曲目文字、CD、來源控制、跳曲按鈕與右側工具列動態鎖定最小
  完整寬高，避免使用縮放把手時裁切元件；最大尺寸仍限制於播放器可用範圍。

### v5.7.0

- 將 1001 狀態與來源控制整合成複合式展開按鈕；選單內提供「使用 1001」、
  「重新搜尋」與「開啟 1001 原頁」。
- 曲目面板按鈕移到右側垂直工具列，來源區下方新增上一曲／下一曲跳躍鍵。
- CD 尺寸同時依視窗短邊與文字大小調整，並增加內距，避免唱片及元件貼邊。
- 曲目面板新增標題列與右上角關閉按鈕。
- HUD 與曲目面板皆可拖移，右下角另有滑鼠縮放把手，尺寸會限制在 YouTube
  播放器範圍內。

### v5.6.0

- 修正曲目按鈕：面板改為明確切換 `display: block`／`display: none`，不再
  因空白行內樣式回落到 CSS 的隱藏狀態。
- 移除 CD 大小調整按鈕，改以視窗短邊自動計算，並限制在 44–64px。
- 右上角改為垂直排列的關閉、縮小字級與放大字級工具列。
- 將來源選擇改為常駐的 `SRC | YT | 1001` 分段控制，並與圓形 1001 狀態
  燈、`1001↗` 連結及 `TRACKS` 曲目按鈕重組為單列操作區。無資料的來源仍
  保持可見但停用，目前來源則明確高亮。

### v5.5.2

- 辨識 1001Tracklists 自有的限流 CAPTCHA 頁，包括 HTTP 200／206 回應中
  出現的 `unblock_ip` 表單。
- 偵測到封鎖頁時立即停止候選回退，改為提示需要瀏覽器驗證，不再誤報五個
  候選曲目頁都沒有時間戳。

### v5.5.1

- 將狀態燈外觀恢復為圓形，保留待機、搜尋、成功、錯誤與鍵盤焦點狀態。
- 1001Tracklists 回應只要是成功的 HTTP 2xx（包含 206）就繼續交由既有的
  HTML、封鎖頁與時間戳驗證，不再直接誤判為載入失敗。
- 新增唱片拖曳互動：按住時暫停、順時針快轉、逆時針循環播放 80 毫秒短
  取樣，放開後自動恢復播放。
- 右上角新增關閉按鈕；點擊後隱藏 HUD 與曲目面板，重新載入 YouTube 分頁
  即可恢復顯示。

### v5.5.0

- 改用原生 16:9 YouTube 縮圖並以 `background-size: cover` 裁切，讓封面
  完整填滿圓盤，不再露出邊緣或 4:3 信箱黑邊。
- 套用緊湊的工業遙測設計系統：硬邊框、深灰藍玻璃面板、等寬數據、明確
  狀態色與一致的控制按鈕狀態。
- 封面取色只影響唱片邊緣微光，維持 HUD 的固定對比與資訊層級。
- 新增鍵盤焦點樣式、減少動態偏好支援與窄螢幕收斂版面。

### v5.4.1

- 優先使用限定範圍的 Trusted Types policy 與惰性 DOM 解析器，再以 Chrome
  的 `Document.parseHTML()` 安全解析器作為回退。Chrome 的安全解析器會移除
  現行 1001Tracklists 曲目列，即使原始 HTML 含有有效 cue。

### v5.4.0

- 改用 1001Tracklists 現行 POST 搜尋格式。
- 搜尋前移除 YouTube 標題中常見的 Official、Live、4K、Full Set 等後綴。
- 依標題關鍵字相似度排列搜尋結果。
- 前一個結果沒有時間戳時，自動嘗試最多五個候選曲目頁。
- 可從畫面時間、隱藏的 `cue_seconds` 欄位或 cue 操作資料讀取時間戳。
- YouTube 單頁換片時中止舊請求並清除舊計時器。
- Trusted Types 解析維持在限定範圍，第三方解析 DOM 不會插入 YouTube 頁面。

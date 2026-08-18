# YouTube CD HUD

把 YouTube DJ Set、Mix 與音樂影片轉成**可切換資料來源、會跟著播放時間同步的曲目 HUD**。

[English](README.md)

![Cue Fox 在環形播放時間軸上同步時間戳曲目卡](docs/assets/readme/youtube-cd-hud-cue-fox-sync-banner-v1.png)

> 找到曲目資料、對準播放時間軸，讓目前播放的曲目一直保持同步。

[![Version 5.11.0](https://img.shields.io/badge/version-5.11.0-2563eb)](package.json)
[![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](extension/manifest.json)
[![Tampermonkey userscript](https://img.shields.io/badge/Tampermonkey-userscript-111111?logo=tampermonkey&logoColor=white)](src/youtube-cd-hud.user.js)

---

## 目錄

- [專案狀態](#專案狀態)
- [這個專案在做什麼](#這個專案在做什麼)
- [安裝方式怎麼選](#安裝方式怎麼選)
- [快速開始](#快速開始)
- [曲目來源與匹配方式](#曲目來源與匹配方式)
- [1001Tracklists 瀏覽器驗證](#1001tracklists-瀏覽器驗證)
- [介面與控制](#介面與控制)
- [隱私、權限與快取](#隱私權限與快取)
- [開發與驗證](#開發與驗證)
- [專案結構](#專案結構)

---

## 專案狀態

YouTube CD HUD 目前以**原始碼 Beta** 形式發布。Userscript 與 Manifest V3 Chrome 擴充功能的目前版本皆為 **5.11.0**。

本 repository 沒有宣稱已發布 Chrome 線上應用程式商店版本。Chrome 版採「載入未封裝項目」安裝；Userscript 則透過 Tampermonkey 安裝。

---

## 這個專案在做什麼

YouTube CD HUD 的核心不是 CD 動畫本身，而是**曲目資料搜尋、來源選擇，以及與 YouTube 播放時間軸同步**。

它可以：

- 使用 YouTube 原生章節標題，或影片說明欄內帶時間戳的曲目資料。
- 查詢 **1001Tracklists**、**MixesDB**、**TrackId.net** 等額外曲目來源。
- 將不同供應者的結果分開保存，不因文字看起來相似就自動混在一起。
- 依 YouTube 目前播放時間，自動判斷並高亮正在播放的曲目。
- 提供上一曲／下一曲跳轉。
- 在不同資料來源間切換，但**不改變目前播放時間**。
- 用可拖移的 CD 風格 HUD 與曲目面板呈現同步結果。

如果 YouTube 本身已經有可用的章節或時間戳曲目，`YT` 會維持預設來源；外部服務的用途是補充，而不是直接覆蓋 YouTube 原有資料。

---

## 安裝方式怎麼選

兩個版本共用相同核心原始碼，但適合的使用方式不同。

| 版本 | 適合誰 | 特點 |
| --- | --- | --- |
| **Tampermonkey Userscript** | 想最快試用，或本來就有使用 Userscript 的人 | 單一腳本，直接注入 YouTube |
| **Chrome 擴充功能** | 想使用完整設定頁與較完整瀏覽器整合的人 | Manifest V3、獨立 Options 頁、背景請求處理，以及 1001Tracklists 第一方驗證橋接 |

### 方案 A — Tampermonkey

1. 先在瀏覽器安裝 Tampermonkey。
2. 開啟 [`src/youtube-cd-hud.user.js`](src/youtube-cd-hud.user.js)。
3. 使用 Tampermonkey 安裝或匯入這個檔案。
4. 如果以前裝過舊版 YouTube CD HUD，先停用重複腳本。
5. 完整重新載入 YouTube 分頁。

### 方案 B — Chrome 擴充功能

**單純使用目前 repository 內的版本，不需要先執行 build。**

1. 下載本 repository 並解壓縮。
2. 在 Chrome 開啟 `chrome://extensions`。
3. 開啟右上角的**開發人員模式**。
4. 按**載入未封裝項目**。
5. 選擇解壓縮後的 `extension/` 資料夾。
6. 如需調整資料來源、外觀或控制項目，開啟擴充功能的設定頁。
7. 把已經開著的 YouTube 分頁重新載入一次。

> [!NOTE]
> `npm run build:extension` 是**開發者**修改共用原始碼後才需要使用的指令。一般使用者載入目前 repository 內已存在的 `extension/`，不需要先跑 build。

---

## 快速開始

1. 開啟 YouTube DJ Set、Mix、Radio 錄音或音樂影片。
2. 如果 YouTube 已提供章節或說明欄時間戳，YouTube CD HUD 會先載入成 `YT` 來源。
3. 使用來源控制查詢或切換 `1001`、`MIXESDB`、`TRACKID`。
4. 如果某個供應者找到多個可信候選，可逐一切換結果。
5. 播放或拖曳 YouTube 時間軸；目前曲名、高亮與上一曲／下一曲目標會跟著播放位置更新。
6. 隨時切換來源。切換只會改變顯示與同步所使用的曲目資料，不會把影片跳到別的時間。

同一供應者若回傳多個可信候選，來源按鈕會顯示 `(1)`、`(2)` 等編號。每按一次切到下一個候選；到最後一個候選後再按一次，才會開啟該來源頁面。

---

## 曲目來源與匹配方式

YouTube CD HUD 把「找到正確 tracklist」當成資料匹配問題處理，而不是只做畫面疊加。**不是所有來源都只靠標題相似度決定結果。**

| 來源 | 主要證據 | 匹配／備援方式 |
| --- | --- | --- |
| `YT` | YouTube 原生章節或說明欄時間戳 | 不需要外部匹配；有資料時預設優先使用 |
| `1001` | 正規化後的影片標題、1001Tracklists 搜尋排序、候選頁時間戳 | 以標題證據為主並搭配時間資訊排序；因此截短版錄影仍可對應較完整的活動 tracklist |
| `MIXESDB` | 可取得時優先比對完全相同的 YouTube ID | 備援候選仍須通過保守的標題、影片長度與 cue coverage 檢查 |
| `TRACKID` | 可取得時優先比對完全相同的 YouTube ID | 備援候選會檢查標題與長度；短篇單曲影片可改以 artist／title／version 比對公開單曲索引 |

不同供應者的 tracklist 彼此保持獨立；專案不會因為部分文字剛好相似，就把兩個來源的資料自動合併。

<p align="center">
  <img src="docs/assets/readme/youtube-cd-hud-cue-fox-provider-banner-v1.png" width="880" alt="Cue Fox 在多個曲目供應者訊號之間進行匹配與選擇。" />
</p>

### 常見狀況

| 狀況 | YouTube CD HUD 的行為 |
| --- | --- |
| YouTube 說明欄有時間戳曲目 | 載入為 `YT`，並預設使用 |
| YouTube 有原生章節標題 | `YT` 啟用時顯示目前章節 |
| 1001Tracklists 找到可用的時間戳 tracklist | 新增可切換的 `1001` 來源，依同一播放時間同步 |
| MixesDB 或 TrackId.net 找到可信結果 | 各自新增成獨立來源，不與其他供應者自動合併 |
| 同時存在多個來源 | 預設保持 `YT`；若已設定 Prefer 1001，成功搜尋後可自動切到 1001 |
| 遠端來源被擋或沒有可信結果 | 保留既有 YouTube／本機資料，不使用弱匹配覆蓋它 |

---

## 1001Tracklists 瀏覽器驗證

1001Tracklists 有時會回傳 CAPTCHA、瀏覽器驗證頁或 IP 限制。

使用 **Chrome 擴充功能**時：

1. 按 **OPEN 1001**。
2. 在開啟的 1001Tracklists 分頁完成網站要求的驗證。
3. 等待結果頁完整載入。
4. 回到原本的 YouTube 分頁。

擴充功能可透過已完成驗證的第一方 1001Tracklists 分頁重試。這個短效橋接只接受與原始 YouTube 分頁相關、且在白名單內的 1001Tracklists 請求。

偵測到阻擋後，自動 1001 查詢會暫停；完成網站驗證後仍可手動重試。

---

## 介面與控制

HUD 的角色是呈現同步後的資料，而不是取代資料匹配流程本身。

主要介面功能：

- 可拖移的 CD 風格 HUD。
- 以目前 YouTube 縮圖製作的圓形唱片圖。
- 從封面推導的 accent color。
- 目前曲名與來源指示。
- 上一曲／下一曲跳轉。
- 會高亮目前曲目的 tracklist 面板。
- 直接拖曳唱片調整播放位置。
- 可調整 HUD 寬度與文字大小。
- Chrome 擴充功能提供獨立設定頁，可調整供應者、字型、唱片倍率、面板透明度、accent color、顯示控制與自訂 CSS。

![YouTube CD HUD 控制頁顯示預設本機設定與即時 HUD 預覽](docs/assets/readme/youtube-cd-hud-options-overview.png)

若使用自訂 CSS，建議盡量把 selector 限定在 `#yt-cd-hud` 或 `.yt-tracklist-panel`，避免樣式影響 YouTube 其他介面。

---

## 隱私、權限與快取

Chrome 擴充功能只要求 `storage` 權限，主機存取範圍限制在：

- YouTube
- 1001Tracklists
- MixesDB
- TrackId.net

專案**不要求** Chrome `cookies` 權限、不呼叫 `chrome.cookies`、不收集瀏覽紀錄，也沒有內建 analytics。

Chrome 對白名單內的 1001Tracklists 請求，可能會自動附帶該網站自己的驗證 Cookie；擴充功能本身不讀取、儲存或輸出 Cookie 值。

MixesDB 與 TrackId.net 查詢是匿名唯讀請求。專案不會上傳音訊，也不會提交新的音訊辨識工作。

解析完成的曲目資料與來源連結可在本機快取最長 **6 小時**，上限為**最近 30 部影片**、**每個供應者 300 首曲目**。第三方 HTML、Cookie 與 challenge 資料不會被存進這份快取。

<p align="center">
  <img src="docs/assets/readme/youtube-cd-hud-cue-fox-cache-banner-v1.png" width="880" alt="Cue Fox 守護有容量與時間限制的本機曲目快取。" />
</p>

---

## 開發與驗證

共用原始碼位於：

```text
src/youtube-cd-hud.user.js
```

Chrome 擴充功能位於：

```text
extension/
```

修改共用原始碼後執行：

```powershell
npm run build:extension
npm run check
npm test
```

`npm run check` 會確認 extension content script 與 userscript 共用原始碼保持同步，並執行 JavaScript 語法檢查；`npm test` 會執行 Node.js 測試。

這些檢查可以驗證 repository 狀態，但最終驗收仍應在實際瀏覽器設定檔中，用已安裝的 Userscript 或未封裝擴充功能打開真正的 YouTube 影片測試。

---

## 專案結構

| 路徑 | 用途 |
| --- | --- |
| `src/youtube-cd-hud.user.js` | 共用 Userscript 原始碼 |
| `extension/` | Manifest V3 Chrome 擴充功能 |
| `extension/options/` | 擴充功能設定介面 |
| `extension/background/` | 背景請求處理 |
| `extension/content/` | YouTube content script 與 1001 第一方橋接 |
| `scripts/build-extension.mjs` | 將共用來源同步到 extension |
| `tests/` | Node.js 測試 |
| `docs/assets/readme/` | README 插圖與截圖 |
| `archive/` | 歷史專案資料 |

---

## 備註

YouTube、1001Tracklists、MixesDB、TrackId.net、Chrome 與 Tampermonkey 均為第三方產品或服務。YouTube CD HUD 是獨立的原始碼專案，不代表上述服務的官方整合。

# YouTube CD HUD

為 YouTube DJ Set、Mix 與音樂影片加入**可切換資料來源、並隨播放進度同步的曲目 HUD**。

[English](README.md)

![Cue Fox 沿著環形播放時間軸同步帶有時間戳的曲目卡片](docs/assets/readme/youtube-cd-hud-cue-fox-sync-banner-v1.png)

> 找到曲目資料、對齊播放時間軸，讓 HUD 隨播放進度持續顯示正確曲目。

[![Version 5.11.0](https://img.shields.io/badge/version-5.11.0-2563eb)](package.json)
[![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](extension/manifest.json)
[![Tampermonkey userscript](https://img.shields.io/badge/Tampermonkey-userscript-111111?logo=tampermonkey&logoColor=white)](src/youtube-cd-hud.user.js)

---

## 目錄

- [專案狀態](#專案狀態)
- [這個專案在做什麼](#這個專案在做什麼)
- [如何選擇安裝方式](#如何選擇安裝方式)
- [快速開始](#快速開始)
- [曲目來源與比對方式](#曲目來源與比對方式)
- [1001Tracklists 的瀏覽器驗證](#1001tracklists-的瀏覽器驗證)
- [介面與控制](#介面與控制)
- [隱私、權限與快取](#隱私權限與快取)
- [開發與驗證](#開發與驗證)
- [專案結構](#專案結構)

---

## 專案狀態

YouTube CD HUD 目前以**原始碼 Beta 測試版**形式提供。Userscript 與 Manifest V3 Chrome 擴充功能的版本皆為 **5.11.0**。

目前尚未提供 Chrome 線上應用程式商店版本。Chrome 版需以「載入未封裝項目」方式安裝；Userscript 則透過 Tampermonkey 安裝。

---

## 這個專案在做什麼

YouTube CD HUD 的核心不是 CD 動畫本身，而是**搜尋曲目資料、選擇資料來源，並讓曲目資訊與 YouTube 播放時間軸同步**。

它可以：

- 讀取 YouTube 原生章節標題，或影片說明欄中帶有時間戳的曲目資料。
- 查詢 **1001Tracklists**、**MixesDB**、**TrackId.net** 等額外曲目來源。
- 將不同資料來源的結果分開保存，避免僅因文字相似就誤合併。
- 根據 YouTube 目前播放位置，自動判斷並醒目標示正在播放的曲目。
- 提供上一曲／下一曲跳轉。
- 在不同資料來源間切換，但**不改變目前播放位置**。
- 透過可拖移的 CD 風格 HUD 與曲目列表面板呈現同步結果。

如果 YouTube 本身已有可用的章節或時間戳曲目，`YT` 會維持為預設來源；外部服務只用來補充資料，不會自動覆蓋 YouTube 原有資訊。

---

## 如何選擇安裝方式

兩個版本共用相同的核心原始碼，但適合不同的使用方式。

| 版本 | 適合誰 | 特點 |
| --- | --- | --- |
| **Tampermonkey Userscript** | 想快速試用，或平常已使用 Userscript 的人 | 單一腳本，直接在 YouTube 頁面執行 |
| **Chrome 擴充功能** | 希望使用完整設定頁與較完整瀏覽器整合的人 | Manifest V3、獨立設定頁、背景請求處理，以及 1001Tracklists 的第一方驗證橋接 |

### 方案 A — Tampermonkey

1. 先在瀏覽器安裝 Tampermonkey。
2. 開啟 [`src/youtube-cd-hud.user.js`](src/youtube-cd-hud.user.js)。
3. 使用 Tampermonkey 安裝或匯入這個檔案。
4. 如果以前安裝過舊版 YouTube CD HUD，請先停用重複的腳本。
5. 完整重新載入 YouTube 分頁。

### 方案 B — Chrome 擴充功能

**若只是使用目前專案中的版本，不需要先執行 build。**

1. 下載本專案原始碼並解壓縮。
2. 在 Chrome 開啟 `chrome://extensions`。
3. 開啟右上角的**開發人員模式**。
4. 按**載入未封裝項目**。
5. 選擇解壓縮後的 `extension/` 資料夾。
6. 如需調整資料來源、外觀或控制項目，開啟擴充功能的設定頁。
7. 重新載入已經開啟的 YouTube 分頁。

> [!NOTE]
> `npm run build:extension` 是**開發者**修改共用原始碼後才需要使用的指令。一般使用者直接載入專案中既有的 `extension/` 即可，不需要先執行 build。

---

## 快速開始

1. 開啟 YouTube DJ Set、Mix、Radio 錄音或音樂影片。
2. 如果 YouTube 已提供章節或說明欄中的時間戳曲目，YouTube CD HUD 會先將它們載入為 `YT` 來源。
3. 使用資料來源控制項查詢或切換 `1001`、`MIXESDB`、`TRACKID`。
4. 如果某個資料來源找到多個可信候選結果，可逐一切換查看。
5. 播放影片或拖曳 YouTube 時間軸；目前曲名、曲目標示，以及上一曲／下一曲的跳轉位置都會隨播放位置更新。
6. 隨時切換資料來源。切換只會改變 HUD 顯示與同步所使用的曲目資料，不會改變影片播放位置。

同一資料來源若回傳多個可信候選結果，來源按鈕會顯示 `(1)`、`(2)` 等編號。每按一次會切換至下一個候選結果；切到最後一個候選後再按一次，才會開啟該來源頁面。

---

## 曲目來源與比對方式

YouTube CD HUD 把「找到正確的 tracklist（曲目列表）」視為資料比對問題，而不只是畫面疊加。不同資料來源會使用不同的判斷依據，**不會只憑標題相似度決定所有結果。**

| 來源 | 主要判斷依據 | 比對／備援邏輯 |
| --- | --- | --- |
| `YT` | YouTube 原生章節或說明欄中的時間戳曲目 | 不需要外部比對；有資料時預設優先使用 |
| `1001` | 正規化後的影片標題、1001Tracklists 搜尋結果排序、候選頁面的時間戳 | 以標題為主要依據，搭配時間資訊進行排序；因此截短版錄影仍可能對應較完整的活動 tracklist |
| `MIXESDB` | 可取得時，優先比對完全相同的 YouTube ID | 備援候選仍需通過保守的標題、影片長度與 cue coverage（時間點覆蓋率）檢查 |
| `TRACKID` | 可取得時，優先比對完全相同的 YouTube ID | 備援候選會比對標題與長度；較短的單曲影片可改用 artist／title／version（藝人／曲名／版本）比對公開單曲索引 |

不同資料來源的 tracklist 會彼此保持獨立；專案不會因為部分文字剛好相似，就自動合併兩個來源的資料。

<p align="center">
  <img src="docs/assets/readme/youtube-cd-hud-cue-fox-provider-banner-v1.png" width="880" alt="Cue Fox 比較多個曲目資料來源的判斷依據，並選擇可同步的結果。" />
</p>

### 常見情境

| 情境 | YouTube CD HUD 的行為 |
| --- | --- |
| YouTube 說明欄有時間戳曲目 | 載入為 `YT`，並預設使用 |
| YouTube 有原生章節標題 | `YT` 啟用時顯示目前章節 |
| 1001Tracklists 找到可用的時間戳 tracklist | 新增可切換的 `1001` 來源，並依同一播放時間同步 |
| MixesDB 或 TrackId.net 找到可信結果 | 各自新增為獨立來源，不與其他資料來源自動合併 |
| 同時存在多個來源 | 預設維持 `YT`；若已設定 Prefer 1001，搜尋成功後可自動切換至 1001 |
| 遠端來源遭阻擋或沒有可信結果 | 保留既有的 YouTube／本機資料，不以低可信度的比對結果覆蓋 |

---

## 1001Tracklists 的瀏覽器驗證

1001Tracklists 有時會要求 CAPTCHA、顯示瀏覽器驗證頁，或因 IP 限制而拒絕請求。

使用 **Chrome 擴充功能**時：

1. 按 **OPEN 1001**。
2. 在開啟的 1001Tracklists 分頁完成網站要求的驗證。
3. 等待結果頁完整載入。
4. 回到原本的 YouTube 分頁。

擴充功能可利用已完成驗證的 1001Tracklists 第一方分頁重新嘗試請求。這個短時間有效的橋接機制只接受與原始 YouTube 分頁相關、且符合白名單的 1001Tracklists 請求。

偵測到阻擋後，自動查詢 1001Tracklists 會暫停；完成網站驗證後，可再手動重試。

---

## 介面與控制

HUD 負責呈現同步後的曲目資料，不取代資料來源的搜尋與比對邏輯。

主要介面功能：

- 可拖移的 CD 風格 HUD。
- 依目前 YouTube 縮圖產生的圓形唱片圖。
- 依封面自動產生的強調色（accent color）。
- 目前曲名與資料來源指示。
- 上一曲／下一曲跳轉。
- 曲目列表（tracklist）面板會醒目標示目前曲目。
- 直接拖曳唱片以調整播放位置。
- 可調整 HUD 寬度與文字大小。
- Chrome 擴充功能提供獨立設定頁，可調整資料來源、字型、唱片比例、面板透明度、強調色、顯示控制項與自訂 CSS。

![YouTube CD HUD 控制頁顯示預設本機設定與即時 HUD 預覽](docs/assets/readme/youtube-cd-hud-options-overview.png)

若使用自訂 CSS，建議盡量將 CSS selector（選擇器）限制在 `#yt-cd-hud` 或 `.yt-tracklist-panel`，避免樣式影響 YouTube 的其他介面。

---

## 隱私、權限與快取

Chrome 擴充功能僅要求 `storage` 權限；可存取的網站範圍限制在：

- YouTube
- 1001Tracklists
- MixesDB
- TrackId.net

專案**不要求** Chrome `cookies` 權限、不呼叫 `chrome.cookies`、不收集瀏覽紀錄，也不包含內建的分析追蹤（analytics）。

Chrome 對白名單內的 1001Tracklists 發出請求時，瀏覽器可能會自動附帶該網站自己的驗證 Cookie；擴充功能本身不會讀取、儲存或輸出 Cookie 值。

MixesDB 與 TrackId.net 查詢皆為匿名、唯讀請求。專案不會上傳音訊，也不會建立新的音訊辨識任務。

解析完成的曲目資料與來源連結，最長可在本機快取 **6 小時**；快取上限為**最近 30 部影片**，且**每個資料來源最多 300 首曲目**。第三方 HTML、Cookie 與驗證挑戰（challenge）資料不會寫入這份快取。

<p align="center">
  <img src="docs/assets/readme/youtube-cd-hud-cue-fox-cache-banner-v1.png" width="880" alt="Cue Fox 守護具有容量與保存時間限制的本機曲目快取。" />
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

`npm run check` 會確認擴充功能的 content script（內容指令碼）與 Userscript 共用原始碼保持同步，並執行 JavaScript 語法檢查；`npm test` 會執行 Node.js 測試。

這些檢查可以驗證專案原始碼狀態，但最終驗收仍應使用實際的瀏覽器使用者設定檔，安裝 Userscript 或載入未封裝擴充功能，並開啟真正的 YouTube 影片進行測試。

---

## 專案結構

| 路徑 | 用途 |
| --- | --- |
| `src/youtube-cd-hud.user.js` | 共用 Userscript 原始碼 |
| `extension/` | Manifest V3 Chrome 擴充功能 |
| `extension/options/` | 擴充功能設定介面 |
| `extension/background/` | 背景請求處理 |
| `extension/content/` | YouTube content script（內容指令碼）與 1001Tracklists 第一方分頁橋接 |
| `scripts/build-extension.mjs` | 將共用原始碼同步至 `extension/` |
| `tests/` | Node.js 測試 |
| `docs/assets/readme/` | README 插圖與截圖 |
| `archive/` | 歷史專案資料 |

---

## 備註

YouTube、1001Tracklists、MixesDB、TrackId.net、Chrome 與 Tampermonkey 均為第三方產品或服務。YouTube CD HUD 為獨立開發的原始碼專案，並非上述服務的官方整合或合作專案。

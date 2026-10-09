# YouTube CD HUD — 模組化操作台設定區恢復紀錄

日期：2026-10-09
工作樹：`D:\projects\youtube-cd-hud-recovery-20261009\candidate`
分支：`recovery/modular-settings-sections-20261009`
來源基準：`6036925`（先前從 `bf10c92` 重建的 CDJ/Skin/選用角色）

## 恢復依據與限制

- 2026-09-29 舊 Codex 紀錄確認本機提交 `07f234e`：42 檔、305/305 測試通過，未推送；目前 Git 物件不在現有儲存庫。
- 舊解耦計畫已從 session 原始輸出救出，另存 `../hud-decoupling-plan-recovered.md`。
- 三份原始 WebMCP 程式碼已救出至 `../historical-source/restored-20260928/`，此階段**不自動載入或啟用**，避免略過後續安全與授權驗證。
- 這次的模組化重構是依原有架構補強的工作，不宣稱與 `07f234e` 位元相同。

## 本次實作

原有 `live-monitor-property-toolbar.js` 將所有設定集中於 `update()`；現拆成四個獨立載入的 renderer：

| 模組 | 檔案 | 範圍 |
|---|---|---|
| unit | `property-sections/unit.js` | 可見性、LOCK、寬高、分離控制、圖層 |
| appearance | `property-sections/appearance.js` | 底色、邊線、不透明度、角、唱片與其他單元外觀 |
| text | `property-sections/text.js` | 文字色、字型、字重、字級、對齊 |
| effects | `property-sections/effects.js` | 元件允許的效果 |

`property-section-registry.js` 明確管理載入順序、重複註冊、缺件與區域呼叫。
原工具列仍負責選取元件、共用更新邏輯、單一 Layout/Skin 提交與原有 DOM 結構；不新增第二份儲存來源。
各模組經由注入的 context 取得必要的功能，不自行讀寫 Chrome storage。

原本的使用者設定、布局 Schema、元件 ID、事件觸發時機與視覺 CSS 不預期變更。
這是設定工具列四區的程式碼解耦，不代表整個 Options 設定頁（總開關／語言／資料來源／Agent）皆已完成獨立生命週期模組化。

## 驗收界線

- 靜態檢查與 Node 回歸測試可確認程式碼結構、欄位、單元行為。
- 必須另行實機驗證：選取／鎖定／隱藏各模組、顏色與字型、CDJ 版型儲存／還原、YouTube 真正 HUD 更新。
- 禁止把 WebMCP 舊檔直接接入網頁或背景服務，直到來源身分檢查、權限範圍、allowlist、取消／逾時、回歸測試與 Chrome 實機驗收完成。
- 現階段不更動或清理 `D:\projects\youtube-cd-hud` 原主線，亦不 push、發布或安裝。

## 下一步

1. 將整體 Options 設定頁的總開關、語言、主題、資料來源與 Agent 控制器再按此 contract 分離，保留既有 revision-aware settings coordinator 的唯一寫入界線。
2. 將三份恢復的 WebMCP 原始檔案與歷史 `07f234e` 的 manifest/schema/adapter 對照，先獨立建立安全測試，再考慮接回實際顯示端。
3. 對照歷史 305 項與恢復候選測試清單，建立功能缺口，而非僅追求測試數字。

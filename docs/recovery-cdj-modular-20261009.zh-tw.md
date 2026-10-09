# YouTube CD HUD｜CDJ 模組化操作台災後恢復紀錄（2026-10-09）

## 狀態與範圍

- 工作樹：`D:\projects\youtube-cd-hud-recovery-20261009\candidate`
- 分支：`recovery/cdj-modular-20261009`，基底 `bf10c92bd535dcd9a8db294c324af695d466370b`
- 本地原始主線：`D:\projects\youtube-cd-hud`（有三個未提交修改；本次未變更）
- 可追溯來源：舊系統 `H:\OS\miles\.codex\sessions\2026\09\28` 的 Codex 執行紀錄；擷取的片段及雜湊在 `D:\projects\youtube-cd-hud-recovery-20261009\historical-source`。
- 本版不是災前候選 ZIP 的位元相同還原；該 ZIP 實體仍未找到。以下為逐步重建、並在新工作樹執行驗證的結果。

## 架構與回復功能

1. **Role/Component**：Composer Registry 由原十個角色擴至十三個，新增 `volume-control`、`agent-tools`、`system-status`，三者預設 `present:false`。現有版型、新增版型與既有元件互不強制綁定。
2. **Layout**：可選 `cdj-inspired`（448 × 640 CSS px）保留可操作的唱盤、曲目、時間、來源、清單與拆分跳曲控制。載入此預設不佔用或覆寫 0–9 儲存槽。
3. **Skin**：`extension/options/hud-skin.js` 是受驗證的純資料契約，建置時同步嵌入 Studio Composer 與 Userscript runtime；不提供可執行 CSS/JavaScript 注入。
4. **Jog 細節**：共用 SVG 資料 URI；28 個外圈凹槽、56 個小凹點、內圈紋理。這是材質顯示，不改變原有 Scrub 的控制語意。
5. **音量模組**：Fader 或 Knob；連結目前 HTMLVideoElement 音量、靜音、volumechange，同步外部狀態；使用者輸入時才改值，影片替換/移除時解除舊監聽。
6. **系統狀態模組**：區分瀏覽器 online/offline 訊號、資料來源活動、快取是否命中與保存時間；未驗證服務連線不標示為健康。
7. **Agent 工具模組**：Registry/UI 保留可選角色，但目前主線不含舊版 `extension/content/hud-webmcp.js`。若沒有具授權的 WebMCP runtime，模組僅顯示不可用，不宣稱能操作 Agent。

## 驗證

- `npm run build:extension`：PASS
- `npm run check`：PASS
- `npm test`：249 tests / 249 pass / 0 fail
- `git -c core.safecrlf=false diff --check`：PASS
- 針對 CDJ、UI 樣式、可選控制等共 19 項測試：PASS
- 遷移測試：舊十角色配置加入三個預設關閉的新角色，已驗證；往返及序列化測試通過。
- 未執行：YouTube 實際播放、Tampermonkey/Chrome MV3 視覺驗收、音量硬體/觸控實測、瀏覽器內 WebMCP 權限交互。
- 不可宣稱與災前最終版完全相同：歷史紀錄最晚顯示 305/305 測試，但此工作樹目前 249/249。差額與歷史客製工具、回歸測試及 WebMCP runtime 未還原有關。

## 恢復材料與回退

- 先前 main 工作目錄的三個未提交變更已另存於 `D:\projects\youtube-cd-hud-recovery-20261009\working-tree.patch` 與三份原檔副本。
- `historical-source\inventory.json` 紀錄 86 份擷取程式及 SHA-256；`second-fragments.json` 保存第二段源碼片段紀錄。
- `jog-detail-surface.svg` 是從歷史程式碼重新產生的材料檔。
- 恢復分支與主線工作樹完全分離。回退方式是停用此候選、使用原主線；**不要**在有未提交修改的 main 上執行 `git reset --hard`。
- 如需在 Chrome 手動驗收，先確認不會與原已啟用的 YouTube CD HUD 重複注入；此步尚未執行。

## 尚待完成

1. 從舊執行紀錄或其他可信備份還原 `extension/content/hud-webmcp.js`、其測試及受控啟用架構；需重新安全審查、權限限制與瀏覽器驗收。
2. 用 Chrome + YouTube 實際檢查 CDJ 外觀、Jog 圖層、模組拖曳/設定保存、音量控制與縮放行為。
3. 針對歷史 305 項測試與目前 249 項差距建立精確的測試映射，避免直接將測試數當成完整性證明。
4. 通過驗收後再評估是否合併回原始 main；未經獨立授權不 push、不安裝、不部署。

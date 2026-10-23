# YOUTUBE CD HUD｜ChatGPT 對話整理資料（獨立歸屬）

此資料夾由 YouTube CD HUD 專案自行維護。只保存 YouTube CD HUD 的候選設定與交接研究，不複製通用 ChatGPT 對話整理程式碼。

## 檔案歸屬

- `youtube-cd-hud.json`：供通用 ChatGPT Conversation Organizer 使用的 YouTube 專用設定與候選。
- `HANDOFF_20261017.md`：2026-10-17 歷史交接紀錄（原文完整保留）；其中 organizer 舊相對路徑只反映當時檔案位置。
- `PROJECT_CONTEXT_20261017.md`：專案歷史資料索引。
- `tests/conversation-intake-config.test.mjs`（專案根目錄）：此專案自身的設定契約測試。

含聊天紀錄或對話證據的私有 JSON 已另外保存在 Git 之外：

`%LOCALAPPDATA%\youtube-cd-hud\conversation-intake\20261017\`

其中包含 `youtube-cd-hud-ledger.json` 及 `youtube-cd-hud-inventory-20261017.json`，已與原檔逐一進行 SHA-256 核對。**不可提交到 Git 或上傳 PR/Issue**。

## 現行操作方法

在 Windows 執行以下 PowerShell：

```powershell
$organizer = 'D:\projects\chatgpt-conversation-organizer'
$config = 'D:\projects\youtube-cd-hud\docs\chatgpt-conversation-intake\youtube-cd-hud.json'
$ledger = Join-Path $env:LOCALAPPDATA 'youtube-cd-hud\conversation-intake\20261017\youtube-cd-hud-ledger.json'

node "$organizer\scripts\organize.mjs" plan --config $config
node "$organizer\scripts\organize.mjs" audit --config $config --ledger $ledger
node --test tests/conversation-intake-config.test.mjs
```

上述命令只產生離線搜尋計畫與讀取核驗台帳，不會搬移 ChatGPT 對話。正式 Project 搬移須以官方 UI 另行核對並回讀，原交接文件的「0 筆已驗證搬移」是該時間點的紀錄，不能從此推斷後來有無新搬移。

## 專案責任邊界

- YouTube CD HUD 產品程式、UI、擴充與本資料夾設定：`D:\projects\youtube-cd-hud`。
- 通用 ChatGPT 對話整理、Project 規劃、SOP 與 2×10 標題操作：`D:\projects\chatgpt-conversation-organizer`。
- 本資料原屬整理器分支的 `4c405a1` 提交，2026-10-23 分離至本產品專案。Git 歷史保留，可追溯。

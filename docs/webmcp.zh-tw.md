# WebMCP 面板工具

設定頁可為相容的 WebMCP 用戶端註冊六個結構化工具。進入
**面板排版 → Agent 設計助手**，勾選啟用本頁工具。使用
`document.modelContext.registerTool`；API 不可用時，原有編輯器仍可操作。
工具已註冊不代表 Agent 已連線。
「Chrome 原生連線自檢」會透過原生 getTools／executeTool 探索工具並呼叫 panel_read；
只验证唯讀路徑，不代表外部 Agent 或寫入驗收。

目前為原型。`chrome-extension://` 頁面的原生工具探索與執行，仍需使用
目標瀏覽器和 Agent 驗證。WebMCP 不會解除用戶端對受限頁面的存取政策。
此功能沒有新增擴充權限、外部端點、模型服務、麥克風存取或 API 金鑰。

## 來源隔離錯誤

若 Chrome 回報 `document.modelContext cannot be used when document.domain is enabled.`，
表示原生 WebMCP 的來源隔離檢查未通過，不代表一定有腳本寫入 document.domain。
manifest 使用 COOP `same-origin` 與 COEP `require-corp`，要求擴充頁跨來源隔離。
更新後須在 Chrome 擴充功能管理頁重新載入擴充，關閉舊設定分頁並重新開啟；
只重新整理既有頁面不會載入新的 manifest。

失敗結果包含 secureContext、originAgentCluster、crossOriginIsolated，以及實際載入
的擴充版本與 COOP／COEP 設定，缺少的值保持 null。請保留結果供排查。
COEP 會限制未明確允許的跨來源嵌入資源；目前設定頁使用本機資產，跨來源通訊
使用既有擴充訊息通道。後續新增外部圖片、iframe 或 opener 整合時須重新驗證。
此設定修正尚須在目標 Chrome 重新載入後完成原生註冊與呼叫驗收。

參考：[Chromium 的原生隔離判定](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/script_tools/model_context.cc)、
[Chrome 擴充跨來源隔離](https://developer.chrome.com/docs/extensions/develop/concepts/cross-origin-isolation)。

## 使用流程

1. 手動解鎖面板與需要修改的元件。在助手輸入設計要求，再按「更新設計要求」。
   文字保存在本頁記憶體，尚未傳給模型。
2. Agent 呼叫 `panel_read`，再用取得的 revision 呼叫 `panel_preview_patch`。
   草稿顯示於獨立預覽，不修改工作區，也不觸發 YouTube 自動同步。
3. Agent 驗證草稿並呼叫 `panel_apply`，取得 `AWAITING_USER`。使用者檢查後
   按「確認套用」，或取消草稿。
4. 套用使用草稿建立時的儲存版本；衝突時不讀取新版重試覆寫。
   `STORED` 表示儲存完成；`runtime.status: APPLIED` 表示內容腳本已回覆。
   `PENDING`／`UNKNOWN` 都不代表畫面驗收完成。
5. `panel_undo` 產生上一次 Agent 操作的復原草稿，仍需另行確認。
   若已有人工修改，會拒絕覆寫。

## 工具與邊界

| 工具 | 功能 |
| --- | --- |
| `panel_read` | 讀取配置、版本、選取元件、使用者要求與上次完成結果；要求文字視為不可信內容。 |
| `panel_preview_patch` | 傳入 `baseRevision` 與 1–40 個元件修改。x/y 為畫布比例座標，寬高與字級為像素。僅接受明確允許的欄位。 |
| `panel_validate` | 驗證草稿 ID、版本、LOCK、碰撞及底座連接。 |
| `panel_apply` | 請求使用者確認草稿，不將等待確認回報成完成。 |
| `panel_undo` | 傳入目前版本，產生獨立復原草稿。 |
| `panel_slot` | 讀取、載入或儲存字串槽號 `"0"`–`"9"`。載入與儲存需要版本；載入產生草稿，儲存需要確認。 |

錯誤包含 `PANEL_LOCKED`、`COMPONENT_LOCKED`、`CONFLICT`、`BUSY`、
`COLLISION`、`LAYOUT_DISCONNECTED`、`OUT_OF_RANGE_OR_UNSUPPORTED` 與
`UNDO_CONFLICT`。批次失敗不會部分修改工作區。

若儲存期間使用者繼續編輯，Chrome 可能已完成寫入，但本機新修改會保留，
自動同步暫停；使用者確認後再儲存，或關閉自動同步再重新讀取以處理差異。
草稿、設計要求與 Agent 復原資料只存在本頁；數字儲存槽持續保存在擴充本機儲存。
語音按鈕是停用的接入預留，不會錄音或辨識語音。

## 驗證範圍

自動測試涵蓋真實 composer 驗證、草稿隔離、確認、鎖定、衝突、儲存槽與模擬
WebMCP 註冊，無法證明原生 Agent 能探索擴充頁工具。
原生驗收需記錄瀏覽器／用戶端版本、探索到工具、草稿回傳、使用者確認、
對應的儲存版本及 HUD 回覆，另檢查 YouTube 實際呈現。

參考：[WebMCP 概覽](https://developer.chrome.com/docs/ai/webmcp)、
[Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)。

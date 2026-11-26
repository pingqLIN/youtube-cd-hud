# Live Monitor MVP 驗收紀錄

## 必要流程

1. 開啟未封裝擴充功能的 Options。
2. 選取、拖曳、滾輪調整與四角 handle 調整元件。
3. 修改 contextual property 並刪除可刪除元件。
4. 嘗試刪除必要元件，確認仍然存在。
5. 儲存、重新載入 Options，確認 layout 持久化。
6. 開啟真實 YouTube 影片，確認 HUD 內部 layout 已改變。
7. 確認 HUD 外層拖曳、寬度調整、scrubbing、換曲、來源、tracklist、i18n
   與 custom CSS 仍可用。

## 證據

完成本文件前，必須記錄瀏覽器 profile、頁面 identity、桌面與窄 viewport、
console、互動結果與截圖。Build/check/test 不能取代可視 Chrome 驗收。

## 目前 gate

程式與 local contract tests 正在完成；尚未取得 live Options 與 YouTube session
證據前，不得標記 PASS。

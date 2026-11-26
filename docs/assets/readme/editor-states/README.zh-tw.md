# 編輯狀態模擬圖

五張直式圖重建現有 UI 功能。SVG 是可編輯原稿，JPEG 是這些模擬圖的瀏覽器截圖，並非已安裝擴充功能的原樣截圖。曲名與數值是說明範例，不含使用者資料。圖帶將五張連續並排。新圖為 SDR，既有 HDR 原檔不變。

為適合直式閱讀，控制項經過重新排列。尋找空位的示意不表示拖曳一定自動繞過障礙。等比例行為屬於 Size 與 SCALE %，沒有額外鎖定開關。自動保存位置限於播放端拖移流程；編輯器須按儲存並套用。

## 功能依據

- Properties: `extension/options/live-monitor-property-toolbar.js`
- Limits, layers, free-space search: `extension/options/live-monitor-composer.js`
- Collision confirmation/removal: `extension/options/live-monitor-canvas-editor.js`
- Group scaling: `extension/options/live-monitor-resize-engine.js`
- Session slots: `extension/options/live-monitor-layout-presets.js`
- Explicit editor save: `extension/options/options.js`
- Runtime drag save: `src/youtube-cd-hud.user.js`, `bindRuntimeLayoutUnitDragging` / `persistRuntimeLayout`

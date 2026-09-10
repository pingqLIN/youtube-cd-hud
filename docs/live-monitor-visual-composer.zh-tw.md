# Live Monitor 視覺化編輯器

5.13.0 Chrome 擴充功能設定頁提供受約束的 2D HUD 內部版面編輯器。MVP
採每種最小功能單元一個 instance、normalized 座標、closed-state 碰撞邊界與
最小／最大尺寸，避免把任意 CSS 當成狀態。

## 操作

- 「儲存並套用」固定於視窗底部；右側預覽區可展開「HUD 外觀」與「自訂 CSS」。
  面板邊框、分隔線與強調線採固定 1px 細線，調整元件尺寸時不會跟著加粗。
- 每次安裝都附有兩套「內建面板」：「精簡播放」以小面板保留主要操作；
  「曲目閱讀」加大文字，並在右側固定顯示曲目列表。點選後先預覽，再按
  「儲存並套用」。重新啟動瀏覽器後仍可使用，不會自動覆蓋既有版面或 A/B/C 暫存槽。
- 每套內建面板保留設計時的位置、尺寸、圖層與樣式。「曲目閱讀」包含較大的唱片
  與固定列表，「精簡播放」則可依需要開啟列表。重新點選內建面板即可載入新版；
  已儲存版面不會自動移位。
- 點選元件選取；點舞台空白或按 Escape 取消選取。
- 拖曳時只限制元件不得離開畫布，不即時阻擋碰撞。放開滑鼠後若偵測到同層重疊，
  可選擇自動替整組衝突元件啟用 Z 軸並配置不同層；若不啟用，衝突元件會全部移出
  面板並回到元件庫。
- 在選取元件上滾輪或拖曳四角 handle 調整大小。
- Contextual toolbar 只顯示該元件支援的控制。
- 每個元件可各自開關固定輔色的區塊描邊。矩形元件可另行開啟圓角並選擇 1–10
  級圓度；CD 圓盤維持固定圓形，不提供圓角切換。
- 背景透明度預設只套用一般 alpha 透明效果；背景模糊改為每個元件可獨立開啟的
  選項。
- Canvas 與 Contextual toolbar 組成同一個 workbench；工具列緊接在實際可操作 Canvas
  下緣，切換選取元件時就地更新。
- 曲名與時間等文字元件可選左對齊、右對齊、置中或平均分散。文字大小上限為
  192 個邏輯像素（原上限六倍），元件高度會自動擴張以容納該文字行。
- 曲目切換控制預設維持左右相連。啟用「左右分離」後，PREVIOUS 與 NEXT 可分別拖至
  不同位置；兩者仍共用尺寸、色彩、字體、透明度及 Z 軸。
- 使用 Delete 或工具列按鈕移除元件；移除後會回到元件庫，重新加入後即從元件庫消失。
- 支援層次的元件預設關閉 Z 軸並視為 `z=0`；啟用後可輸入 `-99..99`。不同有效 Z
  值可重疊，同層仍受 closed-state 邊界限制。
- CD 圓盤固定啟用 Z 軸、預設 `z=1`，沒有碰撞邊界，也不參與底座範圍計算。
- 面板底座永遠存在、Z 值永遠低於全部可見元件，範圍只依具有邊界的可見元件聯集
  與 padding 動態調整。
- Composer 內的 `RESET` 只重設版面。先選 A/B/C，再以共用的 `SAVE / LOAD`
  暫存或載入完整版面；資料位於 `chrome.storage.session`，瀏覽器工作階段結束後即失效。
- `AUTO ALIGN` 預設開啟；拖曳與尺寸調整會吸附至不可見的 8×8 邏輯像素格。
- 按「儲存並套用」寫入 settings 與 layout；「恢復預設」先在記憶體恢復，
  要持久化仍需儲存。

Layout 以 schema version 2 存在 Chrome local storage 的
`ytCdHudLayoutV2`。既有 `ytCdHudLayoutV1` 只作為 migration source，
不會自動刪除。

一般有邊界的儲存單元使用以下結構：

```json
{
  "id": "track-title",
  "type": "track-title",
  "present": true,
  "geometry": { "x": 0.34, "y": 0.43, "width": 430, "height": 48, "z": 0 },
  "layer": { "enabled": false },
  "boundary": { "state": "closed", "shape": "rect", "collision": true },
  "style": {
    "backgroundColor": "#1a202c",
    "borderColor": "#63b3ed",
    "opacity": 1,
    "borderEnabled": true,
    "cornerEnabled": false,
    "cornerRadiusLevel": 1,
    "backgroundBlurEnabled": false
  },
  "textStyle": { "color": "#63b3ed", "opacity": 1, "font": "cascadia-mono", "fontSize": 14, "textAlign": "left" },
  "effects": { "marquee": true }
}
```

- `geometry`：位置、尺寸與 z 軸數值。
- `layer.enabled`：是否採用 `geometry.z`；關閉時有效層一律為 `0`。
- `boundary`：closed-state 邊界及碰撞規則。
- `style`：區塊背景、透明度、描邊、圓角與背景模糊。
- `textStyle`：獨立的文字顏色、透明度、字體、字級與對齊。
- `effects`：隨功能單元附加的裝飾或效果；不另拆成無功能的元件。
- 動態曲名、播放時間與查詢結果不存入版面 schema。
- CD 圓盤是刻意的 schema 例外：具有 `geometry`、`layer`、`style`、`effects`，但不含
  `boundary`，並固定維持圓形。
- 曲目切換控制以單一 `transport-controls` 元件保存共享參數，另以
  `arrangement: { split, partSize, positions: { previous, next } }` 保存分離狀態與兩組位置；
  不複製兩份 style 或 layer authority。

目前 Registry 包含面板底座、唱片控制、曲名、時間、來源選擇器、曲目表開關、
跳曲控制、關閉控制、字級控制及曲目面板。展開式選單不參與碰撞檢查；加入版面的
曲目面板會以未展開狀態的邊界參與檢查。

畫布以 24px 間隔原點與 96px 主格線呈現，沿用設定頁的深色工業式 palette。
吸附格另存於 `canvas.alignmentGrid`，目前為
`{"enabled":true,"unitWidth":8,"unitHeight":8,"visible":false}`，不等同於可見背景格線。

目前不包含雲端同步、複製 instance、使用者持久範本庫、import/export 或 undo history。
Local checks 仍不能取代 Chrome Options 與真實 YouTube 的可視驗收。

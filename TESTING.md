# 測試清單

每次送審前跑一遍。單元測試自動跑，其他項目在 Chrome 手動確認：
`chrome://extensions` → 開發人員模式 → 載入未封裝項目 → 選本資料夾。改完程式後按擴充功能卡片上的重新整理圖示。

## 1. 單元測試

```
node --test tests/*.test.js
```

涵蓋語系偵測（`zh-TW`、`ja`、`ko`、英文、不像語系的路徑、無效網址）、英文網址產生、結構比對。

## 2. 網址判斷

| 網址 | 預期 |
|---|---|
| `/zh-TW/courses/claude-code-in-action` | 顯示英文，按鈕提示「顯示 / 隱藏英文原文」 |
| `/ja/courses/claude-code-in-action` | 顯示英文，按鈕提示日文 |
| `/ko/courses/claude-code-in-action` | 顯示英文，按鈕提示韓文 |
| `/courses/claude-code-in-action`（英文） | 不插入，不顯示按鈕 |
| `/en/courses/claude-code-in-action` | 會轉到英文頁，不插入，不顯示按鈕 |
| `/ja-JP/courses/...`、`/xx/courses/...`（網站 404） | 不插入，console 沒有本擴充功能的訊息 |

## 3. 頁面行為

| 情境 | 怎麼測 | 預期 |
|---|---|---|
| 英文頁載入成功 | 打開任一 zh-TW 課程頁 | 2 秒左右出現英文，每段都有 |
| 英文頁載入失敗 | `/zh-TW/courses/no-such-course` | 不插入、不重試、頁面正常 |
| 結構一致 | 課程首頁、單元頁 | 每段都有對應英文 |
| 結構不一致 | 語系首頁 `/zh-TW`（各語系精選內容不同） | 不插入，console 只有一行 `[Parallel Reader] 頁面結構不同` |
| 重新整理 | 在單元頁按 F5 | 英文重新出現，沒有重複 |
| 站內換頁 | 從課程首頁點進單元 | 新頁出現新頁的英文，舊頁的英文消失 |
| 快速連續換頁 | 0.5 秒內連點三個單元 | 只有最後一頁有英文，而且是那一頁的英文 |
| 上一頁／下一頁 | 換頁後按上一頁 | 英文對應回到的那一頁 |
| 頁內錨點 | 點頁內的 `#` 連結 | 英文不會消失或重新載入 |
| 重複執行 | 在 `chrome://extensions` 重新載入擴充功能後，不重新整理頁面 | 頁面上只有一個按鈕，沒有重複英文 |
| 按鈕 | 點左下角 EN 兩次 | 隱藏再顯示，換頁後維持狀態 |
| 深色模式 | 切換網站／系統的深色模式 | 英文和按鈕顏色跟著變 |

## 4. 向後相容（zh-TW 不能比 v1.0 差）

在下面幾頁，插入的段落數和內容要跟 v1.0 一樣：

| 頁面 | v1.0 插入段數 |
|---|---|
| `/zh-TW/courses/claude-code-in-action` | 21 |
| `/zh-TW/courses/claude-code-in-action/steering-long-sessions` | 60 |
| `/zh-TW/courses/claude-code-in-action/a-claude-md-that-follows` | 62 |
| `/zh-TW/courses/claude-code-in-action/hooks` | 55 |
| `/zh-TW/courses/ai-fluency-framework-foundations` | 47 |
| `/zh-TW/all` | 48 |
| `/zh-TW`（首頁） | 0 |

段數是 2026-10-01 實測的數字，網站改版後可能會變；重點是新舊版一樣。

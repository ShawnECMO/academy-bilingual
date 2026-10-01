# Parallel Reader for Claude Academy

https://github.com/user-attachments/assets/5f3d8228-874a-4478-9159-d1ef6ad3fdf2

Read [Claude Academy](https://academy.claude.com/) in your language with the English original under every paragraph.

在 Claude Academy 的繁體中文、日文、韓文等語系頁面上，每一段下方顯示對應的官方英文原文。

## 功能

- 逐段對照：標題、段落、清單下方自動附上英文原文
- 支援 Claude Academy 所有語系頁面（已驗證：繁體中文 `zh-TW`、日文 `ja`、韓文 `ko`）
- 左下角「EN」按鈕一鍵顯示／隱藏英文
- 自動配合網站深色／淺色模式
- 課程換頁時自動更新
- 頁面結構對不上時不顯示對照，避免出現錯位的英文

## 安裝

- Chrome 線上應用程式商店：（上架後補上連結）
- 手動安裝：下載本 repo → 開啟 `chrome://extensions` → 開啟「開發人員模式」→「載入未封裝項目」→ 選擇本資料夾

## 運作方式

| 檔案 | 負責 |
|---|---|
| `locale.js` | 從網址判斷語系、產生同一頁的英文網址、介面文字 |
| `match.js` | 擷取段落、清理文字、比對兩邊的頁面結構 |
| `content.js` | 載入英文頁、插入英文、換頁偵測、配色、切換按鈕 |

1. 從網址取得語系，例如 `/ja/courses/...` → `ja`。英文頁沒有前綴，所以不動作。
2. 把語系前綴拿掉，就是同一頁的英文網址。
3. 用 `fetch` 載入英文頁的 HTML，在本機解析。
4. 兩邊的段落結構一致才配對：整頁一致就逐段對照；不一致時只對照標題相同、結構也相同的章節；都對不上就不顯示。
5. 在每個段落下方插入英文。

新增語系不需要改程式碼：網站有那個語系的頁面，擴充功能就會運作。要讓按鈕提示文字顯示成該語言，在 `locale.js` 的 `LANGUAGES` 加一行即可。

## 開發

```
node --test tests/*.test.js
```

手動測試項目見 [TESTING.md](TESTING.md)。

## 隱私權

本擴充功能不收集、不傳送任何使用者資料。詳見 [隱私權政策](PRIVACY.md)。

## 聲明

本專案為個人開發的非官方工具，與 Anthropic 或 Claude Academy 無隸屬、合作或背書關係。

# 現勘資料 Google Apps Script 版

這個版本只使用既有 Google 帳號與 GitHub：Apps Script 提供 HTTPS 手機頁面，Drive 保存照片，Sheets 保存說明、座標與連結。

## 安全設定

- Web App 存取權限使用「只有我自己」。
- Web App 執行身分使用「我（部署者）」。
- 不需要 Google OAuth Client Secret，也不要把原本的 OAuth JSON 上傳到 Apps Script 或 GitHub。

## Apps Script 檔案

- `Code.gs`：Drive、Sheets、重複上傳防護與資料讀取。
- `Index.html`：手機頁面。
- `Stylesheet.html`：手機介面樣式。
- `JavaScript.html`：IndexedDB 離線佇列與恢復網路後同步。
- `appsscript.json`：時區、權限與單一使用者設定。

## 部署

1. 在 Google Apps Script 建立獨立專案。
2. 建立以上四個程式／HTML 檔並貼入內容，顯示 `appsscript.json` 後同步清單。
3. 選擇「部署 → 新增部署 → 網頁應用程式」。
4. 執行身分選擇「我」，存取權選擇「只有我自己」。
5. 完成 Google Drive 與 Sheets 授權後，將 `/exec` 網址加入 iPhone 主畫面。

預設 Drive 資料夾與 Spreadsheet ID 已指向本專案先前建立的資源；如需更換，可在 Apps Script 的指令碼屬性設定 `DRIVE_FOLDER_ID` 與 `SPREADSHEET_ID`。

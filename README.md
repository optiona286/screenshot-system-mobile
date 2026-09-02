# BTC Options Mobile

獨立的手機優先 BTC 選擇權 K 線工具。它不依賴桌面版專案或本機 `localhost`，直接讀取 Binance Options 公開市場資料。

## 功能

- BTC 選擇權到期日與 CALL／PUT 篩選
- 履約價搜尋
- 15 分鐘、1 小時、4 小時 K 線
- 行動裝置友善介面
- 下載目前畫面為 PNG
- PWA 安裝支援

## 使用

專案包含 Vercel Serverless API，用來安全轉送不需要 API Key 的 Binance 公開行情。匯入 GitHub 倉庫到 Vercel 後即可直接部署；不需要設定環境變數。

本機開發：執行 `npm install`，再執行 `npm run dev`。

## 資料來源

公開行情由 Binance Options REST API 提供。行情僅供參考，不構成投資建議。

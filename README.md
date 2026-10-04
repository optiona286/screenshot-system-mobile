# BTC Options 手機看盤

網站：https://optiona286.github.io/screenshot-system-mobile/

手機與桌面共用 T 字期權鏈、BTC/USD 技術分析和歷史行情。使用 GitHub Pages，開啟網站不需要電腦上的 Node 服務，也不需要 API 金鑰。

## 功能

- 手機「期權鏈／K 線」分頁；單指拖曳、雙指縮放、輕點查看價格。
- CALL／PUT 報價查看期權；點中間履約價查看該到期日與履約價對應時段的 BTC/USD。
- 15m、1h、4h；來源為 1h 時不提供 15m。紅漲綠跌，MA7、MA20、布林帶、高低價與成交量。
- 最後 24 小時：到期前一日台北時間 16:00 至到期日 16:00，底色與起訖時間標記可開關。
- 到期日篩選、自選星號、成交量排序、設定記憶、PNG 與 CSV 匯出。
- 大型 CSV 在 Web Worker 解析；一次只保留一個歷史檔的解析快取。

## 歷史資料（本系統的資料儲存層）

`daily_options_trade_klines/` 是原始歷史行情 CSV，包括 K 線與合約清單。保留原始檔名與內容，未轉換成 SQL 資料庫；程式只讀取選定檔案，不修改歷史資料。

部署時 `scripts/build-site.cjs` 自動產生 `history-manifest.json`，讓手機從同一網站下載對應 CSV，無須呼叫 GitHub 目錄 API。`_site/` 是產生的網站成品，不提交到 Git。

新增歷史資料時，將桌面端新產生的 CSV 複製到本儲存庫同名資料夾，執行 `node scripts/build-site.cjs` 更新根目錄的 `history-manifest.json`，再將 CSV 與索引一併提交、推送；保留已有歷史檔。根目錄索引也支援直接從分支發布 Pages。頁面每 30 秒可重讀索引，但不會自行切換到其他日期。

## BTC/USD 資料

由 Coinbase Exchange 公開 candles API 讀取現貨 OHLCV，範圍取目前 CSV 中同一到期日、同一履約價 CALL／PUT 的最早開盤至最後一根結束。4h 由 1h 聚合，對齊週期邊界；畫面時間固定為台北時間。

來源缺失的 K 棒不補造。API 未提供成交筆數與成交額，顯示「--」或留空。BTC 資料需要網路；連線、跨域限制或限流時畫面會提示失敗，可稍後重讀。

API 文件：https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles

## 部署與預覽

推送 `main` 後，既有 GitHub Actions 流程建立 `_site/` 並發布至 GitHub Pages。首次開啟新版請重新整理，避免仍顯示舊版快取。

本機預覽（需要 Node.js 與 Python）：

```sh
node scripts/build-site.cjs
python -m http.server 8000 --directory _site
```

開啟 http://127.0.0.1:8000 。建置僅複製網站與資料，不執行測試。

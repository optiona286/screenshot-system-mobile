const BASE = "https://eapi.binance.com";
const ALLOWED_INTERVALS = new Set(["15m", "1h", "4h"]);
const SYMBOL_PATTERN = /^BTC-\d{6}-\d+-[CP]$/;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=20");
  try {
    const { action } = req.query;
    let url;
    if (action === "exchangeInfo") {
      url = `${BASE}/eapi/v1/exchangeInfo`;
    } else if (action === "index") {
      url = `${BASE}/eapi/v1/index?underlying=BTCUSDT`;
    } else if (action === "klines") {
      const symbol = String(req.query.symbol || "");
      const interval = String(req.query.interval || "1h");
      const limit = Math.min(200, Math.max(20, Number(req.query.limit) || 120));
      if (!SYMBOL_PATTERN.test(symbol)) return res.status(400).json({ message: "合約代碼格式錯誤" });
      if (!ALLOWED_INTERVALS.has(interval)) return res.status(400).json({ message: "不支援的週期" });
      url = `${BASE}/eapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
    } else {
      return res.status(400).json({ message: "不支援的行情請求" });
    }
    const upstream = await fetch(url, { headers: { "User-Agent": "screenshot-system-mobile/1.0" } });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ message: data.msg || "Binance 行情服務錯誤" });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ message: error.message || "無法取得行情" });
  }
};

// GitHub Pages data adapter: original historical CSVs plus Coinbase BTC/USD.
(() => {
"use strict";
const FILE_PATTERN = /^BTCUSDT_Options_.*_(?:1h|15m)_\d{4}-\d{2}-\d{2}_all_klines\.csv$/i;
const dataCache = new Map();
const btcCache = new Map();
let manifest = null;
let manifestAt = 0;
const pending = new Map();

async function jsonFile(relative, signal) {
  const response = await fetch(new URL(relative, self.location.href), { signal, cache: "no-store" });
  if (!response.ok) throw new Error("歷史資料載入失敗（HTTP " + response.status + "），請稍後重讀");
  return response.json();
}

async function listDataFiles(signal) {
  if (!manifest || Date.now() - manifestAt > 30000) {
    const data = await jsonFile("./history-manifest.json", signal);
    if (!Array.isArray(data.files)) throw new Error("歷史資料索引格式錯誤");

    const realFiles = data.files.filter((file) => FILE_PATTERN.test(file.name));
    const juneDatesWithOptionData = new Set(
      realFiles.filter((file) => String(file.date).startsWith("2026-06")).map((file) => file.date)
    );

    const btcOnlyDates = [];
    for (let day = 1; day <= 30; day += 1) {
      const date = `2026-06-${String(day).padStart(2, "0")}`;
      if (juneDatesWithOptionData.has(date)) continue;
      btcOnlyDates.push({
        name: `BTCUSD_only_15m_${date}`,
        date,
        interval: "15m",
        size: 0,
        modifiedAt: "2026-07-01T00:00:00.000Z",
        btcOnly: true,
        virtual: true,
      });
    }

    manifest = [...realFiles, ...btcOnlyDates]
      .sort((a, b) => b.date.localeCompare(a.date)
        || Number(Boolean(a.btcOnly)) - Number(Boolean(b.btcOnly))
        || (b.interval === "1h") - (a.interval === "1h"));
    manifestAt = Date.now();
  }
  return manifest;
}

async function loadRows(fileName, signal) {
  const files = await listDataFiles(signal);
  const selected = fileName ? files.find((file) => file.name === fileName) : files[0];
  if (!selected) throw new Error("找不到所選歷史資料檔，請重讀並重新選擇日期");

  if (selected.btcOnly) {
    return {
      selected,
      signature: `btc-only:${selected.date}:${selected.interval}`,
      rows: [],
      bySymbol: new Map(),
      symbols: [],
    };
  }

  const signature = selected.modifiedAt + ":" + selected.size;
  const cached = dataCache.get(selected.name);
  if (cached?.signature === signature) return { selected, ...cached };
  const csvUrl = new URL("./daily_options_trade_klines/" + encodeURIComponent(selected.name), self.location.href);
  csvUrl.searchParams.set("v", signature);
  const response = await fetch(csvUrl, { signal });
  if (!response.ok) throw new Error("無法下載歷史 CSV（HTTP " + response.status + "）");
  const text = await response.text();
  signal?.throwIfAborted();
  const rows = parseCsv(text).sort((a,b) => String(a.openTimeLocal).localeCompare(String(b.openTimeLocal)));
  const bySymbol = new Map();
  for (const row of rows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push(row);
  }
  const entry = { signature, rows, bySymbol, symbols: buildSymbolInfo(rows) };
  dataCache.delete(selected.name);
  dataCache.set(selected.name, entry);
  while (dataCache.size > 1) dataCache.delete(dataCache.keys().next().value);
  return { selected, ...entry };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, ""));
  return rows.map((values) => Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ""])));
}

function periodMinutes(period) {
  return { "15m": 15, "1h": 60, "4h": 240 }[String(period).toLowerCase()] || null;
}

function normalizePeriod(requestedPeriod, sourceInterval) {
  const source = String(sourceInterval || "").toLowerCase();
  const requested = String(requestedPeriod || source).toLowerCase();
  const period = requested === "source" ? source : requested;
  const sourceMinutes = periodMinutes(source);
  const requestedMinutes = periodMinutes(period);
  if (!requestedMinutes) throw new Error("不支援的週期");
  if (!sourceMinutes) throw new Error("來源 CSV 週期無法辨識");
  if (requestedMinutes < sourceMinutes) throw new Error(`目前來源是 ${sourceInterval}，無法還原成 ${period}`);
  if (requestedMinutes % sourceMinutes !== 0) throw new Error(`${sourceInterval} 無法整除聚合成 ${period}`);
  return period;
}

function groupKeyForLocalTime(time, minutes) {
  const match = String(time).match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return String(time);
  const date = match[1];
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const total = hour * 60 + minute;
  const bucket = Math.floor(total / minutes) * minutes;
  const hh = String(Math.floor(bucket / 60)).padStart(2, "0");
  const mm = String(bucket % 60).padStart(2, "0");
  return `${date} ${hh}:${mm}:00`;
}

function aggregateBars(rows, period, sourceInterval) {
  const target = normalizePeriod(period, sourceInterval);
  if (target === sourceInterval) return rows;

  const minutes = periodMinutes(target);
  const grouped = new Map();
  for (const row of rows) {
    const key = groupKeyForLocalTime(row.time, minutes);
    if (!grouped.has(key)) {
      grouped.set(key, {
        time: key,
        timeUtc: row.timeUtc,
        closeTime: row.closeTime,
        closeTimeUtc: row.closeTimeUtc,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: 0,
        quoteVolume: 0,
        trades: 0,
        takerBuyVolume: 0,
        takerBuyQuoteVolume: 0,
        sourceBars: 0,
      });
    }
    const item = grouped.get(key);
    item.high = Math.max(item.high, row.high);
    item.low = Math.min(item.low, row.low);
    item.close = row.close;
    item.closeTime = row.closeTime;
    item.closeTimeUtc = row.closeTimeUtc;
    item.volume += row.volume;
    item.quoteVolume += row.quoteVolume;
    item.trades += row.trades;
    item.takerBuyVolume += row.takerBuyVolume;
    item.takerBuyQuoteVolume += row.takerBuyQuoteVolume;
    item.sourceBars += 1;
  }
  return [...grouped.values()].sort((a, b) => a.time.localeCompare(b.time));
}

function buildSymbolInfo(rows) {
  const bySymbol = new Map();
  for (const row of rows) {
    if (!row.symbol) continue;
    if (!bySymbol.has(row.symbol)) {
      bySymbol.set(row.symbol, {
        symbol: row.symbol,
        expiryDate: row.expiryDate,
        strikePrice: Number(row.strikePrice),
        side: row.side,
        count: 0,
        firstTime: row.openTimeLocal,
        lastTime: row.openTimeLocal,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: 0,
        quoteVolume: 0,
        trades: 0,
      });
    }
    const item = bySymbol.get(row.symbol);
    const open = Number(row.open);
    const high = Number(row.high);
    const low = Number(row.low);
    const close = Number(row.close);
    item.count += 1;
    item.lastTime = row.openTimeLocal;
    if (Number.isFinite(open) && item.count === 1) item.open = open;
    if (Number.isFinite(high)) item.high = Math.max(item.high, high);
    if (Number.isFinite(low)) item.low = Math.min(item.low, low);
    if (Number.isFinite(close)) item.close = close;
    item.volume += Number(row.volume) || 0;
    item.quoteVolume += Number(row.quoteVolume) || 0;
    item.trades += Number(row.numberOfTrades) || 0;
  }

  return [...bySymbol.values()]
    .map((item) => ({
      ...item,
      changePct: item.open ? ((item.close / item.open) - 1) * 100 : 0,
    }))
    .sort((a, b) => a.strikePrice - b.strikePrice || a.side.localeCompare(b.side));
}

function buildOptionChain(symbols) {
  const byStrike = new Map();
  for (const item of symbols) {
    const key = `${item.expiryDate}:${item.strikePrice}`;
    if (!byStrike.has(key)) {
      byStrike.set(key, { expiryDate: item.expiryDate, strikePrice: item.strikePrice, call: null, put: null });
    }
    const row = byStrike.get(key);
    if (item.side === "CALL") row.call = item;
    if (item.side === "PUT") row.put = item;
  }
  return [...byStrike.values()].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.strikePrice - b.strikePrice);
}

function toBar(row) {
  return {
    time: row.openTimeLocal,
    timeUtc: row.openTimeUtc,
    closeTime: row.closeTimeLocal,
    closeTimeUtc: row.closeTimeUtc,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume) || 0,
    quoteVolume: Number(row.quoteVolume) || 0,
    trades: Number(row.numberOfTrades) || 0,
    takerBuyVolume: Number(row.takerBuyVolume) || 0,
    takerBuyQuoteVolume: Number(row.takerBuyQuoteVolume) || 0,
  };
}

function formatMarketTime(milliseconds, local = false) {
  return new Date(milliseconds + (local ? 8 * 3600000 : 0)).toISOString().slice(0, 19).replace("T", " ");
}

function optionTimestamp(row) {
  if (row.openTimeUtc) return Date.parse(row.openTimeUtc.replace(" ", "T") + "Z");
  return Date.parse(String(row.openTimeLocal).replace(" ", "T") + "+08:00");
}

async function fetchBtcCandles(start, end, granularity, signal) {
  // Coinbase public candles: [time, low, high, open, close, volume]; max 300 per request.
  const key = `${start}:${end}:${granularity}`;
  const cached = btcCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.items;
  const bars = new Map();
  const step = granularity * 1000;
  if ((end - start) / step > 10000) throw new Error("此契約時間範圍過長，請選擇較短的資料檔");
  for (let cursor = start; cursor < end; cursor += step * 299) {
    signal.throwIfAborted();
    const pageEnd = Math.min(end, cursor + step * 299);
    const url = new URL("https://api.exchange.coinbase.com/products/BTC-USD/candles");
    url.searchParams.set("start", new Date(cursor).toISOString());
    url.searchParams.set("end", new Date(pageEnd).toISOString());
    url.searchParams.set("granularity", String(granularity));
    let response;
    try {
      response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error("無法連線 Coinbase BTC/USD API，請確認網路後按重讀");
    }
    if (!response.ok) throw new Error(response.status === 429 ? "BTC/USD API 請求過於頻繁，請稍候再重讀" : `BTC/USD API 暫時無法提供資料（HTTP ${response.status}）`);
    const candles = await response.json();
    if (!Array.isArray(candles)) throw new Error("BTC/USD API 回傳格式異常");
    for (const candle of candles) {
      if (!Array.isArray(candle) || candle.length < 6 || candle.slice(0, 6).some((n) => n === null || !Number.isFinite(Number(n)))) continue;
      const [seconds, low, high, open, close, volume] = candle.map(Number);
      const time = seconds * 1000;
      if (time < start || time >= end || time >= Date.now()) continue;
      if (low <= 0 || high < Math.max(open, close) || low > Math.min(open, close) || volume < 0) continue;
      bars.set(time, {
        time: formatMarketTime(time, true), timeUtc: formatMarketTime(time),
        closeTime: formatMarketTime(time + step - 1000, true), closeTimeUtc: formatMarketTime(time + step - 1000),
        open, high, low, close, volume,
        quoteVolume: null, trades: null, takerBuyVolume: null, takerBuyQuoteVolume: null,
      });
    }
    if (pageEnd < end) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const items = [...bars.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1]);
  if (!items.length) throw new Error("Coinbase 在此契約對應的時間區間沒有 BTC/USD K 線資料");
  btcCache.delete(key);
  btcCache.set(key, { items, expires: Date.now() + (end < Date.now() - 3600000 ? 3600000 : 30000) });
  while (btcCache.size > 24) btcCache.delete(btcCache.keys().next().value);
  return items;
}

async function getMeta(fileName, signal) {
  const { selected, rows, symbols } = await loadRows(fileName, signal);
  return {
    ok: true,
    file: selected,
    files: await listDataFiles(signal),
    rowCount: rows.length,
    symbolCount: symbols.length,
    symbols,
    expiries: [...new Set(symbols.map((item) => item.expiryDate))].sort(),
    chain: buildOptionChain(symbols),
    periods: selected.interval === "15m" ? ["15m", "1h", "4h"] : ["1h", "4h"],
  };
}

async function getKlines(fileName, symbol, period, signal) {
  if (!symbol) throw new Error("缺少 symbol");
  const { selected, bySymbol } = await loadRows(fileName, signal);
  const rawItems = (bySymbol.get(symbol) || [])
    .map(toBar)
    .filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite))
    .sort((a, b) => a.time.localeCompare(b.time));
  const selectedPeriod = normalizePeriod(period, selected.interval);
  const items = aggregateBars(rawItems, selectedPeriod, selected.interval);
  return {
    ok: true,
    file: selected,
    symbol,
    sourceInterval: selected.interval,
    period: selectedPeriod,
    count: items.length,
    sourceCount: rawItems.length,
    items,
  };
}

async function getBtcKlines(fileName, symbol, period, signal) {
  const { selected, bySymbol, symbols } = await loadRows(fileName, signal);
  const selectedPeriod = normalizePeriod(period, selected.interval);
  const bucket = periodMinutes(selectedPeriod) * 60000;

  let reference = null;
  let optionStart = null;
  let optionEnd = null;
  let start;
  let end;
  let rangeMode = "contract";

  if (selected.btcOnly) {
    // Missing option-data date: show BTC/USD only for this calendar day.
    // Option chain stays empty; no synthetic option values are created.
    const dayStart = Date.parse(`${selected.date}T00:00:00+08:00`);
    const nextDay = new Date(dayStart + 24 * 3600000).getTime();
    start = Math.floor(dayStart / bucket) * bucket;
    end = Math.ceil(nextDay / bucket) * bucket;
    rangeMode = "day";
  } else {
    if (!symbol) throw new Error("缺少 symbol");
    reference = symbols.find((item) => item.symbol === symbol);
    if (!reference) throw new Error("找不到對應契約，請重新選擇履約價");

    const times = symbols
      .filter((item) => item.expiryDate === reference.expiryDate && item.strikePrice === reference.strikePrice)
      .flatMap((item) => bySymbol.get(item.symbol) || [])
      .map(optionTimestamp)
      .filter(Number.isFinite);

    if (!times.length) throw new Error("此契約沒有有效的歷史時間範圍");
    optionStart = Math.min(...times);
    optionEnd = Math.max(...times) + periodMinutes(selected.interval) * 60000;
    start = Math.floor(optionStart / bucket) * bucket;
    end = Math.ceil(optionEnd / bucket) * bucket;
  }

  if (start >= Date.now()) throw new Error("此日期尚未到來，無法取得 BTC/USD 歷史 K 線");

  const sourceInterval = selectedPeriod === "15m" ? "15m" : "1h";
  const granularity = periodMinutes(sourceInterval) * 60;
  const availableEnd = Math.min(end, Math.ceil(Date.now() / (granularity * 1000)) * granularity * 1000);
  const rawItems = await fetchBtcCandles(start, availableEnd, granularity, signal);
  const items = aggregateBars(rawItems, selectedPeriod, sourceInterval).map((bar) => ({
    ...bar,
    quoteVolume: null,
    trades: null,
    takerBuyVolume: null,
    takerBuyQuoteVolume: null,
    timeUtc: formatMarketTime(Date.parse(bar.time.replace(" ", "T") + "+08:00")),
  }));

  return {
    ok: true,
    market: "btc",
    symbol: "BTC-USD",
    provider: "Coinbase Exchange",
    file: selected,
    reference: reference ? {
      symbol: reference.symbol,
      expiryDate: reference.expiryDate,
      strikePrice: reference.strikePrice,
    } : null,
    range: {
      mode: rangeMode,
      date: rangeMode === "day" ? selected.date : null,
      start: formatMarketTime(start, true),
      end: formatMarketTime(end - 1000, true),
      optionStart: Number.isFinite(optionStart) ? formatMarketTime(optionStart, true) : null,
      optionEnd: Number.isFinite(optionEnd) ? formatMarketTime(optionEnd - 1000, true) : null,
    },
    period: selectedPeriod,
    sourceInterval,
    count: items.length,
    sourceCount: rawItems.length,
    missingSourceBars: Math.max(0, Math.round((availableEnd - start) / (granularity * 1000)) - rawItems.length),
    items,
  };
}

self.onmessage = async ({ data }) => {
  if (data.cancel) { pending.get(data.id)?.abort(); return; }
  const controller = new AbortController();
  pending.set(data.id, controller);
  try {
    const url = new URL(data.url, "https://local.invalid");
    const params = url.searchParams;
    const args = [params.get("file"), params.get("symbol"), params.get("period"), controller.signal];
    let result;
    if (url.pathname === "/api/meta") result = await getMeta(args[0], controller.signal);
    else if (url.pathname === "/api/klines") result = await getKlines(...args);
    else if (url.pathname === "/api/btc-klines") result = await getBtcKlines(...args);
    else throw new Error("不支援的行情請求");
    if (!controller.signal.aborted) self.postMessage({ id: data.id, result });
  } catch (error) {
    if (!controller.signal.aborted) self.postMessage({ id: data.id, error: error.message });
  } finally { pending.delete(data.id); }
};
})();

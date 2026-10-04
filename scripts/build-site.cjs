// Build only the public site and market CSVs. No logs, archives or local launchers.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const site = path.join(root, "_site");
const source = path.join(root, "daily_options_trade_klines");
const target = path.join(site, "daily_options_trade_klines");
fs.mkdirSync(target, { recursive: true });
for (const file of ["index.html", "data-api.js", "data-worker.js", "sw.js", "manifest.webmanifest", "icon.svg"]) {
  fs.copyFileSync(path.join(root, file), path.join(site, file));
}
const pattern = /^BTCUSDT_Options_.*_(15m|1h)_(\d{4}-\d{2}-\d{2})_all_klines\.csv$/i;
const files = [];
for (const name of fs.readdirSync(source)) {
  if (!name.endsWith(".csv")) continue;
  const filePath = path.join(source, name);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) continue;
  fs.copyFileSync(filePath, path.join(target, name));
  const match = name.match(pattern);
  if (match) files.push({ name, interval: match[1].toLowerCase(), date: match[2], size: stat.size, modifiedAt: stat.mtime.toISOString() });
}
files.sort((a, b) => b.date.localeCompare(a.date) || (b.interval === "1h") - (a.interval === "1h"));
const manifest = JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2) + "\n";
fs.writeFileSync(path.join(site, "history-manifest.json"), manifest);
// Also keep a root manifest for repositories still using branch-based Pages.
fs.writeFileSync(path.join(root, "history-manifest.json"), manifest);
console.log(`Published ${files.length} historical candle datasets.`);

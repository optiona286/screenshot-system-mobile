const API = "/api/market";
const state = { contracts: [], filtered: [], side: "C", expiry: "", symbol: "", bars: [] };
const $ = (id) => document.getElementById(id);
const ui = { expiry: $("expirySelect"), interval: $("intervalSelect"), search: $("strikeSearch"), list: $("contractList"), chart: $("chart"), status: $("status"), updated: $("updatedAt") };

const fmt = (n, digits = 2) => Number.isFinite(+n) ? Number(n).toLocaleString("zh-TW", { maximumFractionDigits: digits }) : "--";
function toast(message) { const el = $("toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 1800); }
async function getJson(path, params = {}) { const query = new URLSearchParams({ action: path, ...params }); const res = await fetch(`${API}?${query}`, { cache: "no-store" }); if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.message || `行情服務 ${res.status}`); } return res.json(); }
function parseSymbol(symbol) { const m = symbol.match(/^BTC-(\d{6})-(\d+)-([CP])$/); return m ? { expiry: m[1], strike: Number(m[2]), side: m[3] } : null; }
function readableExpiry(raw) { return raw ? `20${raw.slice(0,2)}-${raw.slice(2,4)}-${raw.slice(4,6)}` : "--"; }

async function loadMarket() {
  ui.status.textContent = "更新中"; ui.status.classList.remove("ok");
  const [info, index] = await Promise.all([getJson("exchangeInfo"), getJson("index")]);
  state.contracts = (info.optionSymbols || []).map(x => ({ ...x, parsed: parseSymbol(x.symbol) })).filter(x => x.parsed && (!x.status || x.status === "TRADING"));
  const expiries = [...new Set(state.contracts.map(x => x.parsed.expiry))].sort();
  ui.expiry.innerHTML = expiries.map(x => `<option value="${x}">${readableExpiry(x)}</option>`).join("");
  state.expiry = expiries[0] || ""; ui.expiry.value = state.expiry;
  $("spotPrice").textContent = `$${fmt(index?.indexPrice, 0)}`;
  ui.status.textContent = "即時行情"; ui.status.classList.add("ok"); ui.updated.textContent = new Date().toLocaleTimeString("zh-TW", { hour12: false });
  renderContracts(true);
}

function renderContracts(autoSelect = false) {
  const query = ui.search.value.trim();
  state.filtered = state.contracts.filter(x => x.parsed.expiry === state.expiry && x.parsed.side === state.side && (!query || String(x.parsed.strike).includes(query))).sort((a,b) => a.parsed.strike-b.parsed.strike);
  if (!state.filtered.length) { ui.list.innerHTML = '<div class="empty">找不到符合的合約</div>'; return; }
  ui.list.innerHTML = state.filtered.map(x => `<button class="contract ${x.symbol === state.symbol ? "active" : ""}" data-symbol="${x.symbol}"><b>${fmt(x.parsed.strike,0)}</b><small>${x.parsed.side === "C" ? "CALL" : "PUT"} · ${readableExpiry(x.parsed.expiry)}</small></button>`).join("");
  ui.list.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => selectContract(btn.dataset.symbol)));
  if (autoSelect || !state.filtered.some(x => x.symbol === state.symbol)) selectContract(state.filtered[Math.floor(state.filtered.length / 2)].symbol);
}

async function selectContract(symbol) {
  state.symbol = symbol; renderContracts(false); $("symbolLabel").textContent = symbol; ui.status.textContent = "載入 K 線"; ui.status.classList.remove("ok");
  try {
    const rows = await getJson("klines", { symbol, interval: ui.interval.value, limit: "120" });
    state.bars = rows.map(r => ({ time:+r[0], open:+r[1], high:+r[2], low:+r[3], close:+r[4], volume:+r[5] })).filter(x => [x.open,x.high,x.low,x.close].every(Number.isFinite));
    const first = state.bars[0], last = state.bars.at(-1); const change = first ? (last.close / first.open - 1) * 100 : 0;
    $("lastPrice").textContent = fmt(last?.close, 3); $("changePct").textContent = `${change >= 0 ? "+" : ""}${fmt(change)}%`; $("changePct").className = change >= 0 ? "positive" : "negative";
    [["openValue","open"],["highValue","high"],["lowValue","low"],["closeValue","close"]].forEach(([id,key]) => $(id).textContent = fmt(last?.[key],3));
    drawChart(); ui.status.textContent = "即時行情"; ui.status.classList.add("ok"); ui.updated.textContent = new Date().toLocaleTimeString("zh-TW", { hour12:false });
  } catch (error) { ui.status.textContent = "載入失敗"; toast(error.message); }
}

function drawChart() {
  const canvas = ui.chart, rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = rect.width*dpr; canvas.height = rect.height*dpr;
  const ctx = canvas.getContext("2d"); ctx.scale(dpr,dpr); const w=rect.width,h=rect.height,p={l:12,r:54,t:15,b:25}; ctx.clearRect(0,0,w,h);
  if (!state.bars.length) return; const bars=state.bars, lo=Math.min(...bars.map(x=>x.low)), hi=Math.max(...bars.map(x=>x.high)), range=hi-lo||1; const y=v=>p.t+(hi-v)/range*(h-p.t-p.b); const step=(w-p.l-p.r)/bars.length; const body=Math.max(2,Math.min(7,step*.62));
  ctx.strokeStyle="#172b3b";ctx.lineWidth=1;ctx.fillStyle="#7891a4";ctx.font="10px Segoe UI";ctx.textAlign="left";
  for(let i=0;i<5;i++){const yy=p.t+(h-p.t-p.b)*i/4;ctx.beginPath();ctx.moveTo(p.l,yy);ctx.lineTo(w-p.r,yy);ctx.stroke();ctx.fillText(fmt(hi-range*i/4,2),w-p.r+6,yy+3)}
  bars.forEach((b,i)=>{const x=p.l+step*(i+.5),up=b.close>=b.open;ctx.strokeStyle=ctx.fillStyle=up?"#ff5f6d":"#24d18b";ctx.beginPath();ctx.moveTo(x,y(b.high));ctx.lineTo(x,y(b.low));ctx.stroke();ctx.fillRect(x-body/2,Math.min(y(b.open),y(b.close)),body,Math.max(1,Math.abs(y(b.close)-y(b.open))))});
  const last=bars.at(-1);ctx.strokeStyle="#36d4ff";ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(p.l,y(last.close));ctx.lineTo(w-p.r,y(last.close));ctx.stroke();ctx.setLineDash([]);
}

document.querySelectorAll("[data-side]").forEach(btn => btn.addEventListener("click",()=>{document.querySelectorAll("[data-side]").forEach(x=>x.classList.toggle("active",x===btn));state.side=btn.dataset.side;renderContracts(true)}));
ui.expiry.addEventListener("change",()=>{state.expiry=ui.expiry.value;renderContracts(true)}); ui.interval.addEventListener("change",()=>state.symbol&&selectContract(state.symbol)); ui.search.addEventListener("input",()=>renderContracts(false)); $("refreshBtn").addEventListener("click",loadMarket); addEventListener("resize",drawChart);
$("captureBtn").addEventListener("click",async()=>{try{const canvas=await html2canvas($("captureArea"),{backgroundColor:"#071018",scale:2});const link=document.createElement("a");link.download=`BTC-Options-${state.symbol||"mobile"}.png`;link.href=canvas.toDataURL("image/png");link.click();toast("截圖已下載")}catch{toast("截圖失敗，請使用手機系統截圖")}});
loadMarket().catch(error=>{ui.status.textContent="連線失敗";toast(error.message)}); if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

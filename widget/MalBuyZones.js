// Mal Crypto Buy Zones: home screen widget for the free Scriptable app (iPhone / iPad).
// Shows the coins closest to their next DCA entry, live from Crypto.com prices and the
// buy zones on the Mal Crypto watchlist sheet. Tap the widget to open the full dashboard.
//
// Optional: long-press the widget > Edit Widget > Parameter, type a ticker (e.g. TRUMP)
// to pin one coin, or several separated by commas (e.g. TRUMP,FIL,SUSHI).

const SITE = "https://cryptowmal.github.io/buy-zones/";
const SHEET = "https://docs.google.com/spreadsheets/d/16ZyC_ub-WWFwk-dv0nY3otlvwnrMf86Xb5Hun_eFRkY/gviz/tq?tqx=out:csv&sheet=Watchlist&range=A3:AL300&headers=0";
const TICKERS = "https://api.crypto.com/exchange/v1/public/get-tickers";
const CLOSE = 0.05; // within 5% of the next entry counts as "close"

const C = {
  bg1: new Color("#070A18"), bg2: new Color("#140F33"),
  fg: new Color("#F6F8FF"), soft: new Color("#C3CBEA"), muted: new Color("#8F9AC4"),
  mint: new Color("#2EF2A6"), gold: new Color("#FFC53D"), coral: new Color("#FF5C7A"),
  violet: new Color("#A78BFA"), off: new Color("#2A3156"),
};

const num = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/[$,\s%]/g, "").replace("−", "-");
  if (s === "" || isNaN(Number(s))) return null;
  return Number(s);
};

function csv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (ch !== "\r") f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "mal-buy-zones-cache.json");
const readCache = () => { try { return fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : null; } catch (e) { return null; } };
const writeCache = (o) => { try { fm.writeString(cachePath, JSON.stringify(o)); } catch (e) {} };

async function loadData() {
  const cache = readCache() || {};
  let coins = cache.coins || [], prices = cache.prices || {}, at = cache.at || 0, live = false;
  try {
    const rows = csv(await new Request(SHEET + "&t=" + Date.now()).loadString());
    const hi = rows.findIndex((x) => x[0] === "Ticker");
    if (hi >= 0) {
      const list = rows.slice(hi + 1).filter((x) => x[0] && x[0].trim()).map((x) => {
        const t = x[0].trim().toUpperCase();
        return { t, top: num(x[7]), bot: num(x[8]), pair: ((x[37] || "").trim() || t + "_USD").toUpperCase(), sheetPrice: num(x[3]) };
      });
      if (list.length) coins = list;
    }
  } catch (e) {}
  try {
    const j = await new Request(TICKERS).loadJSON();
    const data = (j.result && j.result.data) || [];
    const p = {};
    data.forEach((d) => { const k = String(d.i || "").toUpperCase(); const last = parseFloat(d.a); if (k && Number.isFinite(last)) p[k] = { last, chg: Number.isFinite(parseFloat(d.c)) ? parseFloat(d.c) : null }; });
    if (Object.keys(p).length) { prices = {}; coins.forEach((c) => { if (p[c.pair]) prices[c.pair] = p[c.pair]; }); at = Date.now(); live = true; }
  } catch (e) {}
  writeCache({ coins, prices, at });
  return { coins, prices, at, live };
}

function compute(c, prices) {
  const q = prices[c.pair];
  const price = q ? q.last : c.sheetPrice;
  const o = { t: c.t, price, chg: q ? q.chg : null };
  if (c.top == null || c.bot == null || price == null) { o.status = "Awaiting levels"; return o; }
  const top = Math.max(c.top, c.bot), bot = Math.min(c.top, c.bot), step = (top - bot) / 4;
  o.entries = [0, 1, 2, 3, 4].map((k) => +(top - k * step).toPrecision(12));
  o.hits = o.entries.map((L) => L > 0 && price <= L);
  o.reached = o.hits.filter(Boolean).length;
  o.next = o.hits.findIndex((h, k) => !h && o.entries[k] > 0);
  o.pct = o.next >= 0 ? o.entries[o.next] / price - 1 : null;
  o.status = o.next === -1 ? "All entries filled" : price > top ? "Above buy zone" : "In buy zone";
  return o;
}

const dp = (p) => !p ? 0 : p >= 100 ? 2 : p >= 10 ? 3 : p >= 1 ? 4 : Math.min(8, Math.ceil(-Math.log10(p)) + 3);
const fp = (p) => p == null ? "–" : "$" + p.toFixed(dp(p));
const pc = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(1) + "%";

function background(w) {
  const g = new LinearGradient(); g.colors = [C.bg1, C.bg2]; g.locations = [0, 1];
  g.startPoint = new Point(0, 0); g.endPoint = new Point(1, 1); w.backgroundGradient = g;
}

function dots(stack, o, size) {
  const d = stack.addStack(); d.spacing = 3; d.centerAlignContent();
  for (let k = 0; k < 5; k++) {
    const s = d.addStack(); s.size = new Size(size, size); s.cornerRadius = size / 2;
    s.backgroundColor = o.hits && o.hits[k] ? C.mint : (o.next === k ? C.gold : C.off);
  }
}

function tone(o) { return o.next === -1 ? C.mint : o.pct != null && o.pct > -CLOSE ? C.gold : C.soft; }

function header(w, small) {
  const h = w.addStack(); h.centerAlignContent();
  const t = h.addText(small ? "BUY ZONES" : "MAL CRYPTO · BUY ZONES");
  t.font = Font.heavySystemFont(small ? 10 : 11); t.textColor = C.violet;
  h.addSpacer();
}

function footer(w, data) {
  w.addSpacer();
  const f = w.addStack(); f.centerAlignContent();
  const dot = f.addStack(); dot.size = new Size(6, 6); dot.cornerRadius = 3; dot.backgroundColor = data.live ? C.mint : C.coral;
  f.addSpacer(5);
  const when = data.at ? new Date(data.at) : null;
  const df = new DateFormatter(); df.useNoDateStyle(); df.useShortTimeStyle();
  const t = f.addText(data.live ? "Live · " + df.string(when) : when ? "Last update " + df.string(when) : "Offline");
  t.font = Font.mediumSystemFont(9); t.textColor = C.muted;
}

function row(w, o) {
  const r = w.addStack(); r.centerAlignContent();
  const left = r.addStack(); left.layoutVertically();
  const name = left.addText(o.t); name.font = Font.heavySystemFont(13); name.textColor = C.fg;
  const pr = left.addText(fp(o.price)); pr.font = Font.mediumMonospacedSystemFont(10); pr.textColor = C.muted;
  r.addSpacer();
  const right = r.addStack(); right.layoutVertically();
  const lab = o.next === -1 ? "All 5 filled" : o.next >= 0 ? `Entry ${o.next + 1}  ${pc(o.pct)}` : o.status;
  const a = right.addText(lab); a.font = Font.boldMonospacedSystemFont(11); a.textColor = tone(o); a.rightAlignText();
  right.addSpacer(3);
  const ds = right.addStack(); ds.addSpacer(); dots(ds, o, 6);
}

async function build() {
  const data = await loadData();
  const family = config.widgetFamily || "large";
  const pinned = (args.widgetParameter || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  let list = data.coins.map((c) => compute(c, data.prices)).filter((o) => o.entries);
  if (pinned.length) list = pinned.map((t) => list.find((o) => o.t === t)).filter(Boolean);
  else list.sort((a, b) => (a.pct == null ? 1 : 0) - (b.pct == null ? 1 : 0) || (b.pct ?? -9) - (a.pct ?? -9));

  const w = new ListWidget(); background(w); w.url = SITE;
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
  const small = family === "small";
  w.setPadding(small ? 14 : 14, 16, 12, 16);
  header(w, small);
  w.addSpacer(small ? 8 : 6);

  if (!list.length) { const t = w.addText("Can't load the watchlist right now."); t.font = Font.mediumSystemFont(12); t.textColor = C.soft; footer(w, data); return w; }

  if (small) {
    const o = list[0];
    const t = w.addText(o.t); t.font = Font.heavySystemFont(24); t.textColor = C.fg; t.minimumScaleFactor = 0.6;
    const p = w.addText(fp(o.price)); p.font = Font.semiboldMonospacedSystemFont(12); p.textColor = C.soft;
    w.addSpacer(6);
    const lab = o.next === -1 ? "All 5 filled" : `Entry ${o.next + 1} ${pc(o.pct)}`;
    const l = w.addText(lab); l.font = Font.boldMonospacedSystemFont(13); l.textColor = tone(o);
    w.addSpacer(5); dots(w, o, 8);
  } else {
    const n = family === "medium" ? 3 : family === "extraLarge" ? 9 : 7;
    list.slice(0, n).forEach((o, i) => { if (i) w.addSpacer(family === "medium" ? 5 : 7); row(w, o); });
  }
  footer(w, data);
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();

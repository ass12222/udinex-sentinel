import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : "./data";
const DATA_FILE = path.join(DATA_DIR, "sentinel.json");

interface Store {
  tokens: TokenRecord[];
  priceHistory: PriceRecord[];
  events: EventRecord[];
  smartEvents: SmartEventRecord[];
  blacklist: BlacklistRecord[];
  portfolio: PortfolioRecord[];
  scoringResults: ScoringRecord[];
  settings: Record<string, string>;
  alerts: AlertRecord[];
}

interface TokenRecord { mint: string; symbol: string; name: string; dev: string; mc: number; score: number; pctW: number; bSlots: number; swBuy: number; swSell: number; bonding: number; devSold: number; migrated: number; created_at: number; updated_at: number }
interface PriceRecord { mint: string; mc: number; bonding: number; ts: number }
interface EventRecord { sig: string; slot: number; action: string; wallet: string; mint: string; sol: number; ts: number }
interface SmartEventRecord { id: number; wallet: string; action: string; mint: string; sol: number; symbol: string; mc: number; dex: string; ts: number }
interface BlacklistRecord { dev: string; count: number; reason: string; last_seen: number }
interface PortfolioRecord { wallet: string; mint: string; mc_entry: number; symbol: string; sold: number; sold_ts: number; ts: number }
interface ScoringRecord { id: number; mint: string; score: number; verdict: string; bundle_pct: number; sw_buy: number; sw_sell: number; mc_at_score: number; peak_mc: number; is_profitable: number; ts: number }
interface AlertRecord { id: number; type: string; condition: string; enabled: number; chat_id: string }

let store: Store;
let smartIdCounter = 0;
let scoringIdCounter = 0;
let alertIdCounter = 0;

function defaultStore(): Store {
  return { tokens: [], priceHistory: [], events: [], smartEvents: [], blacklist: [], portfolio: [], scoringResults: [], settings: {}, alerts: [] };
}

function load(): Store {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (e) { console.warn("[Store] Errore lettura, reset:", e); }
  return defaultStore();
}

function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 0));
  } catch (e) { console.warn("[Store] Errore scrittura:", e); }
}

export function initStore() {
  store = load();
  // Resume counters
  if (store.smartEvents.length > 0) smartIdCounter = Math.max(...store.smartEvents.map(s => s.id)) + 1;
  if (store.scoringResults.length > 0) scoringIdCounter = Math.max(...store.scoringResults.map(s => s.id)) + 1;
  if (store.alerts.length > 0) alertIdCounter = Math.max(...store.alerts.map(s => s.id)) + 1;
  setInterval(save, 30000);
  save();
}

// ── Tokens ─────────────────────────────────────────────────────────────────
export function upsertToken(tok: any) {
  const i = store.tokens.findIndex(t => t.mint === tok.mint);
  const record: TokenRecord = { mint: tok.mint, symbol: tok.symbol || "", name: tok.name || "", dev: tok.dev || "", mc: tok.mc || 0, score: tok.score || 0, pctW: tok.pctW || 0, bSlots: tok.bSlots || 0, swBuy: tok.swBuy || 0, swSell: tok.swSell || 0, bonding: tok.bonding || 0, devSold: tok.devSold ? 1 : 0, migrated: tok.migrated ? 1 : 0, created_at: tok.ts || tok.created_at || Date.now(), updated_at: Date.now() };
  if (i >= 0) store.tokens[i] = record;
  else store.tokens.unshift(record);
  if (store.tokens.length > 500) store.tokens.length = 500;
}

export function getRecentTokens(limit = 100) {
  return store.tokens.slice(0, limit);
}

export function getToken(mint: string) {
  return store.tokens.find(t => t.mint === mint) || null;
}

export function savePriceSnapshot(mint: string, mc: number, bonding: number) {
  store.priceHistory.push({ mint, mc, bonding, ts: Date.now() });
  if (store.priceHistory.length > 10000) store.priceHistory = store.priceHistory.slice(-5000);
}

export function getTokenPriceHistory(mint: string, limit = 60) {
  return store.priceHistory.filter(p => p.mint === mint).slice(-limit);
}

// ── Events ─────────────────────────────────────────────────────────────────
export function saveEvent(ev: any) {
  if (store.events.some(e => e.sig === ev.sig)) return;
  store.events.push({ sig: ev.sig, slot: ev.slot || 0, action: ev.action, wallet: ev.wallet, mint: ev.mint, sol: ev.sol || 0, ts: ev.ts || Date.now() });
  if (store.events.length > 2000) store.events = store.events.slice(-1000);
}

export function getEvents(mint?: string, limit = 100) {
  let evs = store.events;
  if (mint) evs = evs.filter(e => e.mint === mint);
  return evs.slice(-limit).reverse();
}

// ── Smart events ───────────────────────────────────────────────────────────
export function saveSmartEvent(ev: any) {
  const id = smartIdCounter++;
  store.smartEvents.push({ id, wallet: ev.wallet, action: ev.action, mint: ev.mint, sol: ev.sol || 0, symbol: ev.symbol || "", mc: ev.mc || 0, dex: ev.dex || "pump.fun", ts: ev.ts || Date.now() });
  if (store.smartEvents.length > 1000) store.smartEvents = store.smartEvents.slice(-500);
}

export function getSmartEvents(limit = 50) {
  return store.smartEvents.slice(-limit).reverse();
}

export function getWalletStats(wallet: string) {
  const evs = store.smartEvents.filter(e => e.wallet === wallet);
  const buys = evs.filter(e => e.action === "buy");
  const sells = evs.filter(e => e.action === "sell");
  const tokens = new Set(evs.map(e => e.mint));
  return { wallet, totalBuys: buys.length, totalBuySol: buys.reduce((s, e) => s + e.sol, 0), totalSells: sells.length, totalSellSol: sells.reduce((s, e) => s + e.sol, 0), tokens: tokens.size };
}

// ── Blacklist ──────────────────────────────────────────────────────────────
export function upsertBlacklist(dev: string, reason: string) {
  const i = store.blacklist.findIndex(b => b.dev === dev);
  if (i >= 0) { store.blacklist[i].count++; store.blacklist[i].last_seen = Date.now(); store.blacklist[i].reason = reason; }
  else store.blacklist.push({ dev, count: 1, reason, last_seen: Date.now() });
}

export function getBlacklist() {
  return store.blacklist.sort((a, b) => b.count - a.count);
}

// ── Portfolio ──────────────────────────────────────────────────────────────
export function upsertPortfolio(wallet: string, mint: string, mcEntry: number, symbol: string) {
  if (store.portfolio.some(p => p.wallet === wallet && p.mint === mint)) return;
  store.portfolio.push({ wallet, mint, mc_entry: mcEntry, symbol: symbol || mint.slice(0, 6), sold: 0, sold_ts: 0, ts: Date.now() });
}

export function markPortfolioSold(wallet: string, mint: string) {
  const p = store.portfolio.find(p => p.wallet === wallet && p.mint === mint && !p.sold);
  if (p) { p.sold = 1; p.sold_ts = Date.now(); }
}

export function getPortfolio(wallet: string) {
  return store.portfolio.filter(p => p.wallet === wallet).sort((a, b) => b.ts - a.ts);
}

// ── Settings ───────────────────────────────────────────────────────────────
export function getSetting(key: string) { return store.settings[key] || null; }
export function setSetting(key: string, value: string) { store.settings[key] = value; }

// ── Scoring ────────────────────────────────────────────────────────────────
export function saveScoringResult(mint: string, score: number, verdict: string, bundlePct: number, swBuy: number, swSell: number, mcAtScore: number) {
  const id = scoringIdCounter++;
  store.scoringResults.push({ id, mint, score, verdict, bundle_pct: bundlePct, sw_buy: swBuy, sw_sell: swSell, mc_at_score: mcAtScore, peak_mc: 0, is_profitable: 0, ts: Date.now() });
  if (store.scoringResults.length > 5000) store.scoringResults = store.scoringResults.slice(-2500);
}

export function updateScoringOutcome(mint: string, peakMc: number, isProfitable: boolean) {
  const results = store.scoringResults.filter(r => r.mint === mint);
  for (const r of results) {
    if (peakMc > r.peak_mc) r.peak_mc = peakMc;
    if (isProfitable) r.is_profitable = 1;
  }
}

export function getScoringStats(minSamples = 5) {
  const now = Date.now();
  const monthAgo = now - 86400000 * 30;
  const recent = store.scoringResults.filter(r => r.ts > monthAgo);
  const buckets: Record<string, { samples: number; wins: number; totalMultiplier: number }> = {};
  for (const r of recent) {
    let bucket: string;
    if (r.score >= 75) bucket = "SNIPE_IT";
    else if (r.score >= 55) bucket = "ENTRA";
    else if (r.score >= 40) bucket = "WATCH";
    else if (r.score >= 20) bucket = "RISCHIO";
    else bucket = "SKIP";
    if (!buckets[bucket]) buckets[bucket] = { samples: 0, wins: 0, totalMultiplier: 0 };
    buckets[bucket].samples++;
    if (r.is_profitable) buckets[bucket].wins++;
    if (r.peak_mc > 0 && r.mc_at_score > 0) buckets[bucket].totalMultiplier += r.peak_mc / r.mc_at_score;
  }
  return Object.entries(buckets).filter(([, v]) => v.samples >= minSamples).map(([bracket, v]) => ({
    bracket, samples: v.samples, win_rate: v.samples > 0 ? +(v.wins / v.samples).toFixed(3) : 0, avg_multiplier: v.wins > 0 ? +(v.totalMultiplier / v.wins).toFixed(2) : 0,
  })).sort((a, b) => b.samples - a.samples);
}

// ── Alerts ─────────────────────────────────────────────────────────────────
export function getEnabledAlerts() {
  return store.alerts.filter(a => a.enabled);
}

export function addAlert(type: string, condition: string, chatId?: string) {
  const id = alertIdCounter++;
  store.alerts.push({ id, type, condition, enabled: 1, chat_id: chatId || "" });
}

// ── Graceful shutdown ──────────────────────────────────────────────────────
process.on("SIGINT", () => { save(); process.exit(0); });
process.on("SIGTERM", () => { save(); process.exit(0); });

import type { MintData, BlacklistInfo, VoiceState, AiAgentState } from "./types";
import { SMART_SET } from "./config";
import { today } from "./helpers";

// ─── Global state ─────────────────────────────────────────────────────────────
export const G: {
  ws: WebSocket | null;
  wsIdx: number;
  connected: boolean;
  reconnecting: boolean;
  smartWs: WebSocket | null;
  smartConnected: boolean;
  smartReconnecting: boolean;
  msgCount: number;
  txParsed: number;
  txFailed: number;
  lastMsg: number;
  seenSigs: Set<string>;
  events: any[];
  smartEvents: any[];
  mintData: Map<string, MintData>;
  tokens: any[];
  listeners: Set<() => void>;
  parseQueue: any[];
} = {
  ws: null,
  wsIdx: 0,
  connected: false,
  reconnecting: false,
  smartWs: null,
  smartConnected: false,
  smartReconnecting: false,
  msgCount: 0,
  txParsed: 0,
  txFailed: 0,
  lastMsg: 0,
  seenSigs: new Set(),
  events: [],
  smartEvents: [],
  mintData: new Map(),
  tokens: [],
  listeners: new Set(),
  parseQueue: [],
};

export let activeJobs = 0;

export function setActiveJobs(n: number) {
  activeJobs = n;
}

export function notify() {
  G.listeners.forEach(fn => fn());
}

export function getMintData(mint: string): MintData {
  if (!G.mintData.has(mint))
    G.mintData.set(mint, {
      buys: [],
      sells: [],
      creates: [],
      bundleSlots: {},
      swBuys: new Set(),
      swSells: new Set(),
      dev: null,
      devSol: 0,
    });
  return G.mintData.get(mint)!;
}

// ─── Dev blacklist ─────────────────────────────────────────────────────────────
export const devBlacklist = new Map<string, BlacklistInfo>();

export function markDevBad(dev: string, reason: string) {
  const ex = devBlacklist.get(dev) || { count: 0, lastSeen: 0, reason };
  devBlacklist.set(dev, { count: ex.count + 1, lastSeen: Date.now(), reason });
}

export function isDevBad(dev: string) {
  const d = devBlacklist.get(dev);
  return d && d.count >= 1;
}

// ─── Holder history ────────────────────────────────────────────────────────────
export const holderHistory = new Map<string, any>();
export const holderConc = new Map<string, any>();
export const holderCountHistory = new Map<string, any[]>();

export function recordHolderCount(mint: string, count: number) {
  if (!holderCountHistory.has(mint)) holderCountHistory.set(mint, []);
  const arr = holderCountHistory.get(mint);
  arr.push({ ts: Date.now(), count });
  if (arr.length > 20) arr.shift();
}

export function getHolderTrend(mint: string) {
  const arr = holderCountHistory.get(mint);
  if (!arr || arr.length < 2) return { delta: 0, pct: 0, dir: "flat" };
  const first = arr[0].count;
  const last = arr[arr.length - 1].count;
  const delta = last - first;
  const pct = first > 0 ? (delta / first) * 100 : 0;
  return { delta, pct: +pct.toFixed(1), dir: delta > 0 ? "up" : delta < 0 ? "down" : "flat" };
}

export const pendingHolderFetch = new Set<string>();

export function recordWalletActivity(mint: string, wallet: string, action: string, sol: number) {
  if (!holderHistory.has(mint)) holderHistory.set(mint, {});
  const h = holderHistory.get(mint);
  const d = today();
  if (!h[d]) h[d] = { wallets: new Set(), buys: 0, sells: 0, vol: 0 };
  h[d].wallets.add(wallet);
  if (action === "buy") {
    h[d].buys++;
    h[d].vol += sol;
  }
  if (action === "sell") h[d].sells++;
}

// ─── Pump history ──────────────────────────────────────────────────────────────
export const pumpHistory = new Map<string, any[]>();

// ─── Wallet portfolio ──────────────────────────────────────────────────────────
export const walletPortfolio = new Map<string, Map<string, any>>();

export function recordWalletBuy(wallet: string, mint: string, mcEntry: number, symbol: string) {
  if (!walletPortfolio.has(wallet)) walletPortfolio.set(wallet, new Map());
  const port = walletPortfolio.get(wallet);
  if (!port!.has(mint)) {
    port!.set(mint, {
      mcEntry: mcEntry || 0,
      ts: Date.now(),
      sold: false,
      soldTs: 0,
      symbol: symbol || mint.slice(0, 6),
    });
  }
}

export function recordWalletSell(wallet: string, mint: string) {
  const port = walletPortfolio.get(wallet);
  if (port && port.has(mint)) {
    const p = port.get(mint);
    p.sold = true;
    p.soldTs = Date.now();
  }
}

export function countOtherSmartBuyers(mint: string, excludeWallet: string) {
  let count = 0;
  for (const [w, port] of walletPortfolio.entries()) {
    if (w !== excludeWallet && port.has(mint)) count++;
  }
  return count;
}

// ─── Voice state ───────────────────────────────────────────────────────────────
export const voiceState: VoiceState = {
  enabled: false,
  queue: [],
  speaking: false,
  lastSpokenMc: new Map(),
  lastSpokenBonding: new Map(),
  pauseRecognition: null,
  resumeRecognition: null,
  pttActive: false,
};

// ─── AI agent state ────────────────────────────────────────────────────────────
export const aiAgentState: AiAgentState = {
  enabled: true,
  lastRunAt: 0,
  running: false,
  lastText: "",
  history: [],
};

// ─── Periodic memory cleanup ─────────────────────────────────────────────────
export function cleanupMemory() {
  const now = Date.now();
  const FIVE_MIN = 300000;
  const THIRTY_MIN = 1800000;

  // Token cleanup: remove tokens older than 30min
  G.tokens = G.tokens.filter((t: any) => now - t.ts < THIRTY_MIN);

  // Events cleanup: keep last 200
  if (G.events.length > 200) G.events.length = 200;
  if (G.smartEvents.length > 200) G.smartEvents.length = 200;

  // Seen sigs cleanup
  if (G.seenSigs.size > 5000) {
    const arr = [...G.seenSigs].slice(-3000);
    G.seenSigs.clear();
    arr.forEach(x => G.seenSigs.add(x));
  }

  // MintData cleanup: remove mints not in tokens
  const activeMints = new Set(G.tokens.map((t: any) => t.mint));
  for (const [mint] of G.mintData) {
    if (!activeMints.has(mint)) G.mintData.delete(mint);
  }
}

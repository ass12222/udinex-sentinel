import { API_BASE } from "./config";
const API = API_BASE + "/api";

async function post(path: string, body: any) {
  try {
    await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn("[API] fallito:", path, e);
  }
}

export function syncToken(tok: any) {
  post("/tokens", tok);
}

export function syncEvent(ev: any) {
  post("/events", ev);
}

export function syncSmartEvent(ev: any) {
  post("/smart-events", ev);
}

export function syncScoring(mint: string, score: number, verdict: string, bundlePct: number, swBuy: number, swSell: number, mcAtScore: number) {
  post(`/tokens/${mint}/scoring`, { score, verdict, bundlePct, swBuy, swSell, mcAtScore });
}

export function syncBlacklist(dev: string, reason: string) {
  post("/blacklist", { dev, reason });
}

export function syncPriceSnapshot(mint: string, mc: number, bonding: number) {
  post(`/tokens/${mint}/snapshot`, { mc, bonding });
}

export async function getHistory(mint: string) {
  try {
    const r = await fetch(`${API}/tokens/${mint}/history`);
    return await r.json();
  } catch { return []; }
}

export async function getScoringStats() {
  try {
    const r = await fetch(`${API}/stats/scoring`);
    return await r.json();
  } catch { return []; }
}

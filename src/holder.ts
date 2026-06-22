import { holderConc, pendingHolderFetch, G, notify, recordHolderCount } from "./state";
import { getHolders, getSupply } from "./rpc";

export async function fetchHolderConc(mint: string) {
  if (pendingHolderFetch.has(mint)) return;
  const ex = holderConc.get(mint);
  if (ex && Date.now() - ex.ts < 60000) return;
  pendingHolderFetch.add(mint);
  holderConc.set(mint, { loading: true, top1pct: 0, top10pct: 0, holders: [], ts: 0 });
  G.listeners.forEach(fn => fn());
  try {
    const [holders, supply] = await Promise.all([getHolders(mint), getSupply(mint)]);
    if (!supply || !holders.length) { pendingHolderFetch.delete(mint); return; }
    const parsed = holders
      .map((h: any) => ({
        addr: h.address,
        amount: h.uiAmount || 0,
        pct: supply > 0 ? +((h.uiAmount / supply) * 100).toFixed(2) : 0,
      }))
      .sort((a: any, b: any) => b.pct - a.pct);
    holderConc.set(mint, {
      loading: false,
      top1pct: parsed[0]?.pct || 0,
      top3pct: parsed.slice(0, 3).reduce((s: number, h: any) => s + h.pct, 0),
      top10pct: parsed.slice(0, 10).reduce((s: number, h: any) => s + h.pct, 0),
      holders: parsed.slice(0, 20),
      ts: Date.now(),
    });
    recordHolderCount(mint, parsed.filter((p: any) => p.amount > 0).length);
  } catch {
    holderConc.delete(mint);
  } finally {
    pendingHolderFetch.delete(mint);
  }
  G.listeners.forEach(fn => fn());
}

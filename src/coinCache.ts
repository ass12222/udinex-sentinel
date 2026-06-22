import { PUMP_V3 } from "./config";

const coinCache: Record<string, any> = {};
const pendingCoins: Record<string, Promise<any>> = {};

export async function getCoin(mint: string) {
  if (coinCache[mint]) return coinCache[mint];
  if (pendingCoins[mint]) return pendingCoins[mint];
  const p = fetch(`${PUMP_V3}/coins/${mint}`, { signal: AbortSignal.timeout(5000) })
    .then(r => (r.ok ? r.json() : {}))
    .catch(e => {
      console.warn(`[CoinCache] fallito per ${mint}:`, e);
      return {};
    })
    .then(d => {
      coinCache[mint] = d;
      delete pendingCoins[mint];
      return d;
    });
  pendingCoins[mint] = p;
  return p;
}

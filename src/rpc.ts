import { getRpcHttpList } from "./config";

export let rpcIdx = 0;

export function setRpcIdx(n: number) { rpcIdx = n; }

export async function rpcPost(method: string, params: any[], retries = 4) {
  for (let i = 0; i < retries; i++) {
    const list = getRpcHttpList();
    const url = list[rpcIdx % list.length];
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) {
        if (r.status === 429) {
          await new Promise(res => setTimeout(res, 1500 * (i + 1)));
        }
        throw new Error(String(r.status));
      }
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) {
      console.warn(`[RPC] ${method} fallito (tentativo ${i + 1}/${retries}):`, e);
      rpcIdx++;
    }
  }
  return null;
}

export const getTx = (sig: string) =>
  rpcPost("getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);

export const getHolders = (mint: string) =>
  rpcPost("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]).then(r => r?.value || []);

export const getSupply = (mint: string) =>
  rpcPost("getTokenSupply", [mint, { commitment: "confirmed" }]).then(r => r?.value?.uiAmount || 0);

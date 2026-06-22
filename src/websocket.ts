import { PUMP_PROGRAM, SMART_WALLETS, SMART_SET, RPC_WS_LIST } from "./config";
import { G, getMintData, notify, activeJobs, setActiveJobs, recordWalletActivity, recordWalletBuy, recordWalletSell, markDevBad } from "./state";
import { getTx } from "./rpc";
import { getCoin } from "./coinCache";
import { calcBundleScore, recordPumpSnapshot } from "./scoring";
import { speak } from "./voice";
import { short, bondingPct, fSol } from "./helpers";
import { fetchHolderConc } from "./holder";

// ─── WebSocket pump.fun ───────────────────────────────────────────────────────
export function startWs() {
  if (G.ws) return;
  let reconnectAttempts = 0;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  const MAX_RETRY = 60000;

  function wsClose() {
    G.connected = false;
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  }

  function connect() {
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    const url = RPC_WS_LIST[G.wsIdx % RPC_WS_LIST.length];
    G.reconnecting = false;
    try {
      const ws = new WebSocket(url);
      G.ws = ws;
      reconnectAttempts = 0;

      ws.onopen = () => {
        G.connected = true;
        G.reconnecting = false;
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "logsSubscribe",
            params: [{ mentions: [PUMP_PROGRAM] }, { commitment: "processed" }],
          })
        );
        notify();
      };

      ws.onmessage = (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          if (d.method !== "logsNotification") return;
          G.msgCount++;
          G.lastMsg = Date.now();
          const val = d.params.result.value;
          const sig = val.signature;
          const slot = d.params.result.context.slot;
          const logs = val.logs || [];
          if (G.seenSigs.has(sig)) return;
          G.seenSigs.add(sig);
          if (G.seenSigs.size > 8000) {
            const a = [...G.seenSigs].slice(-4000);
            G.seenSigs.clear();
            a.forEach(x => G.seenSigs.add(x));
          }
          let action: string | null = null;
          for (const l of logs) {
            if (l.includes("Instruction: Buy")) { action = "buy"; break; }
            if (l.includes("Instruction: Sell")) { action = "sell"; break; }
            if (l.includes("Instruction: Create")) { action = "create"; break; }
          }
          if (!action) return;
          enqueue({ sig, slot, action });
          notify();
        } catch (e) { console.warn("[WS] parse msg:", e); }
      };

      ws.onerror = () => {
        console.warn("[WS] Errore connessione");
        G.connected = false;
        notify();
      };

      ws.onclose = () => {
        wsClose();
        G.ws = null;
        G.wsIdx++;
        G.reconnecting = true;
        notify();
        const delay = Math.min(3000 * Math.pow(1.5, reconnectAttempts), MAX_RETRY);
        reconnectAttempts++;
        console.warn(`[WS] Disconnesso, riconnessione tra ${Math.round(delay / 1000)}s`);
        setTimeout(connect, delay);
      };

      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "getHealth" }));
        } else {
          if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
        }
      }, 25000);
    } catch (e) {
      console.warn("[WS] Errore avvio:", e);
      G.ws = null;
      G.wsIdx++;
      G.reconnecting = true;
      notify();
      const delay = Math.min(3000 * Math.pow(1.5, reconnectAttempts), MAX_RETRY);
      reconnectAttempts++;
      setTimeout(connect, delay);
    }
  }
  connect();
}



// ─── WebSocket Helius per smart wallet ───────────────────────────────────────
const smartWsSubIds: Record<string, string> = {};

export function startSmartWs(apiKey: string) {
  if (!apiKey || G.smartWs) return;
  let reconnectAttempts = 0;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  const MAX_RETRY = 60000;

  function smartWsClose() {
    G.smartConnected = false;
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  }

  function connect() {
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    G.smartReconnecting = false;
    const url = `wss://mainnet.helius-rpc.com/?api-key=${apiKey}`;
    try {
      const ws = new WebSocket(url);
      G.smartWs = ws;
      reconnectAttempts = 0;

      ws.onopen = () => {
        G.smartConnected = true;
        G.smartReconnecting = false;
        SMART_WALLETS.forEach((wallet, i) => {
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: 100 + i,
                  method: "logsSubscribe",
                  params: [{ mentions: [wallet] }, { commitment: "processed" }],
                })
              );
          }, i * 500);
        });
        notify();
      };

      ws.onmessage = (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          if (d.result !== undefined && d.id >= 100 && d.id < 100 + SMART_WALLETS.length) {
            smartWsSubIds[d.result] = SMART_WALLETS[d.id - 100];
            return;
          }
          if (d.method !== "logsNotification") return;
          G.lastMsg = Date.now();
          const val = d.params.result.value;
          const sig = val.signature;
          const slot = d.params.result.context.slot;
          const wallet = smartWsSubIds[d.params.subscription];
          if (!wallet) return;
          const key = sig + "_sw";
          if (G.seenSigs.has(key)) return;
          G.seenSigs.add(key);
          enqueue({ sig, slot, wallet, isSmartTx: true });
          notify();
        } catch (e) { console.warn("[SmartWS] parse msg:", e); }
      };

      ws.onerror = () => {
        console.warn("[SmartWS] Errore connessione");
        G.smartConnected = false;
        notify();
      };

      ws.onclose = () => {
        smartWsClose();
        G.smartWs = null;
        G.smartReconnecting = true;
        Object.keys(smartWsSubIds).forEach(k => delete smartWsSubIds[k]);
        notify();
        const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts), MAX_RETRY);
        reconnectAttempts++;
        console.warn(`[SmartWS] Disconnesso, riconnessione tra ${Math.round(delay / 1000)}s`);
        setTimeout(connect, delay);
      };

      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ jsonrpc: "2.0", id: 999, method: "getHealth" }));
        } else {
          if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
        }
      }, 30000);
    } catch (e) {
      console.warn("[SmartWS] Errore avvio:", e);
      G.smartWs = null;
      G.smartReconnecting = true;
      notify();
      const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts), MAX_RETRY);
      reconnectAttempts++;
      setTimeout(connect, delay);
    }
  }
  connect();
}

// ─── Parser jobs ──────────────────────────────────────────────────────────────
async function parseTxJob({ sig, slot, action }: { sig: string; slot: number; action: string }) {
  const tx = await getTx(sig);
  if (!tx) { G.txFailed++; return; }
  const meta = tx.meta || {};
  const accts = tx.transaction?.message?.accountKeys || [];
  if (!accts.length) return;
  const signer = accts[0]?.pubkey;
  const preB = meta.preBalances || [];
  const postB = meta.postBalances || [];
  const sol = preB[0] && postB[0] ? Math.abs(preB[0] - postB[0]) / 1e9 : 0;
  const tokAll = [...(meta.postTokenBalances || []), ...(meta.preTokenBalances || [])];
  let mint: string | null = null;
  for (const tb of tokAll) {
    const m = tb.mint || "";
    if (m && m !== "So11111111111111111111111111111111111111112") { mint = m; break; }
  }
  if (!mint || !signer) return;
  G.txParsed++;
  const ev = { sig, slot, action, wallet: signer, mint, sol: +sol.toFixed(5), ts: Date.now() };
  G.events.unshift(ev);
  if (G.events.length > 600) G.events.length = 600;
  if (action === "buy" || action === "sell") recordWalletActivity(mint, signer, action, sol);
  const md = getMintData(mint);
  if (action === "buy") {
    md.buys.unshift(ev);
    if (md.buys.length > 100) md.buys.length = 100;
    if (!md.bundleSlots[slot]) md.bundleSlots[slot] = new Set();
    md.bundleSlots[slot].add(signer);
    if (SMART_SET.has(signer)) {
      md.swBuys.add(signer);
      const existingTok = G.tokens.find((t: any) => t.mint === mint);
      recordWalletBuy(signer, mint, existingTok?.mc || 0, existingTok?.symbol);
      speak(`Smart wallet entra su ${existingTok?.symbol || mint.slice(0, 6)}`);
    }
  } else if (action === "sell") {
    md.sells.unshift(ev);
    if (md.sells.length > 100) md.sells.length = 100;
    if (SMART_SET.has(signer)) {
      md.swSells.add(signer);
      recordWalletSell(signer, mint);
      const existingTok = G.tokens.find((t: any) => t.mint === mint);
      speak(`Smart wallet esce da ${existingTok?.symbol || mint.slice(0, 6)}`);
    }
    const tok = G.tokens.find((t: any) => t.mint === mint);
    if (tok && signer === tok.dev && Date.now() - tok.ts < 300000) {
      markDevBad(signer, "dump entro 5min");
      speak(`Attenzione, il dev di ${tok.symbol} ha venduto`);
    }
    const bundledW = new Set(
      Object.values(md.bundleSlots)
        .filter((s: any) => s.size >= 2)
        .flatMap((s: any) => [...s])
    );
    const bundlerSellCount = md.sells.filter((s: any) => bundledW.has(s.wallet)).length;
    if (bundlerSellCount === 2 && tok) {
      speak(`Attenzione, i bundler stanno uscendo da ${tok.symbol}`);
    }
  } else if (action === "create") {
    md.creates.unshift(ev);
    md.dev = signer;
    md.devSol = sol;
  }

  if (SMART_SET.has(signer)) {
    const smEv: any = {
      ts: Date.now(),
      wallet: signer,
      action,
      mint,
      sol: ev.sol,
      symbol: "...",
      mc: 0,
      bonding: 0,
      loading: true,
      dex: "pump.fun",
    };
    G.smartEvents.unshift(smEv);
    if (G.smartEvents.length > 500) G.smartEvents.length = 500;
    notify();
    getCoin(mint).then(coin => {
      smEv.symbol = coin.symbol || mint.slice(0, 6);
      smEv.mc = coin.usd_market_cap || 0;
      smEv.bonding = bondingPct(coin);
      smEv.loading = false;
      notify();
    });
  }

  if (action === "create") {
    getCoin(mint).then(coin => {
      const { score, pctW, bSlots } = calcBundleScore(md);
      const swBuy = md.swBuys.size;
      const swSell = md.swSells.size;
      const devSold = md.sells.some((e: any) => e.wallet === signer);
      const mcUsd = coin.usd_market_cap || 0;
      const bd = bondingPct(coin);
      const tok = {
        ts: Date.now(),
        mint,
        symbol: coin.symbol || mint.slice(0, 6),
        name: coin.name || "?",
        dev: signer,
        solDev: sol,
        mc: mcUsd,
        score,
        pctW,
        bSlots,
        swBuy,
        swSell,
        bonding: bd,
        devSold,
        replyCount: coin.reply_count || 0,
        lastReply: coin.last_reply || 0,
        migrated: !!coin.complete,
        marketId: coin.market_id || null,
      };
      const idx = G.tokens.findIndex((t: any) => t.mint === mint);
      if (idx >= 0) G.tokens[idx] = tok;
      else G.tokens.unshift(tok);
      if (G.tokens.length > 200) G.tokens.length = 200;
      setTimeout(() => fetchHolderConc(mint), 8000);
      if (pctW >= 40) {
        speak(`Nuovo token ${tok.symbol}, bundle forte al ${Math.round(pctW)} percento`);
      }
      notify();
    });
  } else {
    const idx = G.tokens.findIndex((t: any) => t.mint === mint);
    if (idx >= 0) {
      const tok = G.tokens[idx];
      const { score, pctW, bSlots } = calcBundleScore(md);
      const swBuy = md.swBuys.size;
      const swSell = md.swSells.size;
      const devSold = md.dev && md.sells.some((e: any) => e.wallet === md.dev);
      G.tokens[idx] = { ...tok, score, pctW, bSlots, swBuy, swSell, devSold };
      recordPumpSnapshot(mint, tok.mc, tok.bonding, md, tok.symbol);
      getCoin(mint).then(coin => {
        const mcUsd = coin.usd_market_cap || tok.mc;
        const bd = bondingPct(coin) || tok.bonding;
        const i2 = G.tokens.findIndex((t: any) => t.mint === mint);
        if (i2 >= 0) {
          G.tokens[i2] = {
            ...G.tokens[i2],
            mc: mcUsd,
            bonding: bd,
            replyCount: coin.reply_count ?? G.tokens[i2].replyCount,
            lastReply: coin.last_reply || G.tokens[i2].lastReply,
            migrated: !!coin.complete,
            marketId: coin.market_id || G.tokens[i2].marketId,
          };
          recordPumpSnapshot(mint, mcUsd, bd, md, G.tokens[i2].symbol);
          notify();
        }
      });
    }
    notify();
  }
}

async function parseSmartTxJob({ sig, slot, wallet }: { sig: string; slot: number; wallet: string }) {
  const tx = await getTx(sig);
  if (!tx) { G.txFailed++; return; }
  const meta = tx.meta || {};
  const accts = tx.transaction?.message?.accountKeys || [];
  if (!accts.length) return;
  const signer = accts[0]?.pubkey;
  if (signer !== wallet) return;
  const preB = meta.preBalances || [];
  const postB = meta.postBalances || [];
  const solDelta = preB[0] !== undefined && postB[0] !== undefined ? (postB[0] - preB[0]) / 1e9 : 0;
  const tokAll = [...(meta.postTokenBalances || []), ...(meta.preTokenBalances || [])];
  let mint: string | null = null;
  for (const tb of tokAll) {
    const m = tb.mint || "";
    if (m && m !== "So11111111111111111111111111111111111111112") { mint = m; break; }
  }
  if (!mint) return;
  G.txParsed++;
  const action = solDelta < -0.001 ? "buy" : solDelta > 0.001 ? "sell" : null;
  if (!action) return;
  const sol = Math.abs(solDelta);
  const logs = (tx.meta?.logMessages || []).join(" ");
  let dex = "DEX";
  if (logs.includes("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")) dex = "pump.fun";
  else if (logs.includes("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8")) dex = "Raydium";
  else if (logs.includes("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4")) dex = "Jupiter";
  else if (logs.includes("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc")) dex = "Orca";
  else if (logs.includes("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C")) dex = "Raydium CPMM";

  const ev = {
    sig,
    slot,
    action,
    wallet: signer,
    mint,
    sol: +sol.toFixed(5),
    ts: Date.now(),
    fromSmartWs: true,
  };
  G.events.unshift(ev);
  if (G.events.length > 600) G.events.length = 600;
  recordWalletActivity(mint, signer, action, sol);
  const md = getMintData(mint);
  if (action === "buy") {
    md.buys.unshift(ev);
    if (md.buys.length > 100) md.buys.length = 100;
    if (!md.bundleSlots[slot]) md.bundleSlots[slot] = new Set();
    md.bundleSlots[slot].add(signer);
    md.swBuys.add(signer);
  } else {
    md.sells.unshift(ev);
    if (md.sells.length > 100) md.sells.length = 100;
    md.swSells.add(signer);
    recordWalletSell(signer, mint);
    const tok = G.tokens.find((t: any) => t.mint === mint);
    if (tok && signer === tok.dev && Date.now() - tok.ts < 300000) {
      markDevBad(signer, "dump entro 5min");
    }
  }
  const smEv: any = {
    ts: Date.now(),
    wallet: signer,
    action,
    mint,
    sol: +sol.toFixed(5),
    symbol: "...",
    mc: 0,
    bonding: 0,
    loading: true,
    dex,
  };
  G.smartEvents.unshift(smEv);
  if (G.smartEvents.length > 500) G.smartEvents.length = 500;
  notify();
  getCoin(mint).then(coin => {
    smEv.symbol = coin.symbol || mint.slice(0, 6);
    smEv.name = coin.name || "?";
    smEv.mc = coin.usd_market_cap || 0;
    smEv.bonding = bondingPct(coin);
    smEv.loading = false;
    if (action === "buy") recordWalletBuy(signer, mint, smEv.mc, smEv.symbol);
    const idx = G.tokens.findIndex((t: any) => t.mint === mint);
    if (idx >= 0) {
      const tok = G.tokens[idx];
      const { score, pctW, bSlots } = calcBundleScore(md);
      G.tokens[idx] = { ...tok, score, pctW, bSlots, swBuy: md.swBuys.size, swSell: md.swSells.size };
    }
    notify();
  });
}

// ─── Job queue ────────────────────────────────────────────────────────────────
export function enqueue(job: any) {
  G.parseQueue.push(job);
  drain();
}

function drain() {
  while (activeJobs < 2 && G.parseQueue.length > 0) {
    setActiveJobs(activeJobs + 1);
    const job = G.parseQueue.shift()!;
    const p = job.isSmartTx ? parseSmartTxJob(job) : parseTxJob(job);
    p.finally(() => {
      setActiveJobs(activeJobs - 1);
      drain();
    });
  }
}

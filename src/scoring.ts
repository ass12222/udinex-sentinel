import type { MintData, AdvancedMetrics, VelocityData, PumpTrend, Multiplier, SnipeResult } from "./types";
import { isDevBad, getHolderTrend, holderConc, pumpHistory } from "./state";
import { MAX_SNAPSHOTS, SMART_SET } from "./config";
import { fmc } from "./helpers";
import { checkMcMilestone, checkBondingMilestone } from "./voice";

// ─── Bundle score ──────────────────────────────────────────────────────────────
export function calcBundleScore(md: MintData) {
  const slots = md.bundleSlots;
  const keys = Object.keys(slots);
  if (!keys.length) return { score: 0, pctW: 0, bSlots: 0 };
  const bundled = keys.filter(s => (slots[s] as Set<string>).size >= 2);
  const allW = new Set(keys.flatMap(s => [...(slots[s] as Set<string>)]));
  const bW = new Set(bundled.flatMap(s => [...(slots[s] as Set<string>)]));
  const pctW = allW.size ? (bW.size / allW.size) * 100 : 0;
  const score = Math.min(
    100,
    Math.min(40, bundled.length * 10) +
      Math.min(30, Math.floor(pctW * 0.5)) +
      Math.min(30, keys.length * 3)
  );
  return { score, pctW: +pctW.toFixed(1), bSlots: bundled.length };
}

// ─── Advanced metrics ─────────────────────────────────────────────────────────
export function calcAdvancedMetrics(md: MintData, tokTs: number): AdvancedMetrics {
  const now = Date.now();
  const ageSec = (now - tokTs) / 1000;
  const bundledWallets = new Set(
    Object.values(md.bundleSlots)
      .filter(set => set.size >= 2)
      .flatMap(set => [...set])
  );
  const allBuyWallets = new Set(md.buys.map(e => e.wallet));
  const bundleSolIn = md.buys
    .filter(e => bundledWallets.has(e.wallet))
    .reduce((s, e) => s + e.sol, 0);
  const organicSolIn = md.buys
    .filter(e => !bundledWallets.has(e.wallet))
    .reduce((s, e) => s + e.sol, 0);
  const totalSolIn = bundleSolIn + organicSolIn;
  const totalSolOut = md.sells.reduce((s, e) => s + e.sol, 0);
  const bundleSolPct = totalSolIn > 0 ? (bundleSolIn / totalSolIn) * 100 : 0;
  const organicBuyers = new Set(
    md.buys.filter(e => !bundledWallets.has(e.wallet)).map(e => e.wallet)
  );
  const cutoff2m = tokTs + 120000;
  const earlyBuyers = new Set(
    md.buys.filter(e => e.ts <= cutoff2m).map(e => e.wallet)
  );
  const lateBuyers = new Set(
    md.buys.filter(e => e.ts > cutoff2m).map(e => e.wallet)
  );
  const holderRateEarly = ageSec > 0 ? (earlyBuyers.size / Math.min(ageSec, 120)) * 60 : 0;
  const holderRateLate = ageSec > 120 ? (lateBuyers.size / (ageSec - 120)) * 60 : 0;
  const holderAccel = holderRateLate - holderRateEarly;
  const sellPressure = totalSolIn > 0 ? totalSolOut / totalSolIn : 0;
  const bundlerSells = md.sells.filter(s => bundledWallets.has(s.wallet));
  const bundlerSolOut = bundlerSells.reduce((s, e) => s + e.sol, 0);
  const bundlerExitPct = bundleSolIn > 0 ? (bundlerSolOut / bundleSolIn) * 100 : 0;
  const t30 = md.buys.filter(e => e.ts <= tokTs + 30000).length;
  const t60 = md.buys.filter(e => e.ts <= tokTs + 60000).length;
  const l30s = md.buys.filter(e => now - e.ts < 30000).length;
  const l60s = md.buys.filter(e => now - e.ts < 60000).length;
  const rate = ageSec > 0 ? (l60s / Math.min(ageSec, 60)) * 60 : 0;

  return {
    bundleSolIn: +bundleSolIn.toFixed(3),
    organicSolIn: +organicSolIn.toFixed(3),
    totalSolIn: +totalSolIn.toFixed(3),
    totalSolOut: +totalSolOut.toFixed(3),
    bundleSolPct: +bundleSolPct.toFixed(1),
    organicBuyers: organicBuyers.size,
    bundledWallets: bundledWallets.size,
    allBuyWallets: allBuyWallets.size,
    holderRateEarly: +holderRateEarly.toFixed(1),
    holderRateLate: +holderRateLate.toFixed(1),
    holderAccel: +holderAccel.toFixed(1),
    sellPressure: +sellPressure.toFixed(3),
    bundlerSells,
    bundlerSolOut: +bundlerSolOut.toFixed(3),
    bundlerExitPct: +bundlerExitPct.toFixed(1),
    t30,
    t60,
    l30s,
    l60s,
    rate: +rate.toFixed(1),
  };
}

// ─── SNIPE SCORE ───────────────────────────────────────────────────────────────
export function calcSnipeScore(tok: any, md: MintData): SnipeResult {
  let score = 0;
  const flags: { t: string; s: string }[] = [];
  const ageSec = (Date.now() - tok.ts) / 1000;
  const m = calcAdvancedMetrics(md, tok.ts);

  // Bundle % score
  if (tok.pctW >= 60) {
    score += 25;
    flags.push({ t: "green", s: `Bundle MASSICCIO — ${tok.pctW}% wallet (${tok.bSlots} slot)` });
  } else if (tok.pctW >= 40) {
    score += 18;
    flags.push({ t: "green", s: `Bundle forte — ${tok.pctW}% (${tok.bSlots} slot)` });
  } else if (tok.pctW >= 25) {
    score += 10;
    flags.push({ t: "orange", s: `Bundle medio — ${tok.pctW}%` });
  } else if (tok.pctW >= 10) {
    score += 4;
    flags.push({ t: "orange", s: `Bundle leggero — ${tok.pctW}%` });
  } else {
    flags.push({ t: "red", s: "Nessun bundle reale" });
  }

  // Bundle SOL in
  if (m.bundleSolIn >= 20) {
    score += 20;
    flags.push({ t: "green", s: `Bundle pesante: ${m.bundleSolIn} SOL — bundler seri` });
  } else if (m.bundleSolIn >= 10) {
    score += 15;
    flags.push({ t: "green", s: `Bundle: ${m.bundleSolIn} SOL` });
  } else if (m.bundleSolIn >= 4) {
    score += 10;
    flags.push({ t: "green", s: `Bundle: ${m.bundleSolIn} SOL` });
  } else if (m.bundleSolIn >= 1) {
    score += 5;
    flags.push({ t: "orange", s: `Bundle leggero: ${m.bundleSolIn} SOL — possono uscire in fretta` });
  } else {
    flags.push({ t: "red", s: "Bundle quasi vuoto (<1 SOL) — segnale debole" });
  }

  // Organic buyers
  if (m.organicBuyers >= 15) {
    score += 15;
    flags.push({ t: "green", s: `${m.organicBuyers} organic buyer — domanda reale forte` });
  } else if (m.organicBuyers >= 8) {
    score += 10;
    flags.push({ t: "green", s: `${m.organicBuyers} organic buyer — buona trazione` });
  } else if (m.organicBuyers >= 3) {
    score += 6;
    flags.push({ t: "orange", s: `${m.organicBuyers} organic buyer — inizia` });
  } else if (m.organicBuyers >= 1) {
    score += 2;
    flags.push({ t: "orange", s: `${m.organicBuyers} organic buyer — ancora pochi` });
  } else {
    flags.push({ t: "red", s: "Zero organic buyer — solo bundle, nessuna domanda esterna" });
  }

  // Bundle volume dominance
  if (m.bundleSolPct > 95) {
    score -= 8;
    flags.push({ t: "red", s: "Volume 100% bundle — nessuno compra organicamente" });
  } else if (m.bundleSolPct > 80) {
    score -= 3;
    flags.push({ t: "orange", s: `Volume ${m.bundleSolPct}% bundle, poca domanda esterna` });
  }

  // Smart wallet buys
  if (tok.swBuy >= 3) {
    score += 15;
    flags.push({ t: "green", s: `${tok.swBuy} smart wallet dentro — CONVOY forte` });
  } else if (tok.swBuy === 2) {
    score += 10;
    flags.push({ t: "green", s: "2 smart wallet dentro" });
  } else if (tok.swBuy === 1) {
    score += 5;
    flags.push({ t: "green", s: "1 smart wallet dentro" });
  }

  // Smart wallet sells
  if (tok.swSell >= 2) {
    score -= 20;
    flags.push({ t: "red", s: `${tok.swSell} smart wallet USCITI — segnale di exit` });
  } else if (tok.swSell === 1) {
    score -= 8;
    flags.push({ t: "orange", s: "1 smart wallet uscito" });
  }

  // Bundler sells
  if (m.bundlerSells.length >= 3) {
    score -= 30;
    flags.push({ t: "red", s: `BUNDLER STANNO VENDENDO MASSICCIAMENTE (${m.bundlerSells.length})` });
  } else if (m.bundlerSells.length >= 2) {
    score -= 20;
    flags.push({ t: "red", s: "2+ bundler hanno venduto — PERICOLO" });
  } else if (m.bundlerSells.length === 1) {
    score -= 8;
    flags.push({ t: "orange", s: "1 bundler ha venduto — attenzione" });
  }

  // Dev sold
  if (tok.devSold) {
    score -= 25;
    flags.push({ t: "red", s: "DEV HA VENDUTO — segnale di rug fortissimo" });
  }

  // Dev blacklisted
  const devBad = isDevBad(tok.dev);
  if (devBad) {
    score -= 40;
    flags.push({ t: "red", s: "Dev bannato — storico di dump" });
  }

  // Age
  if (ageSec < 30) {
    score += 10;
    flags.push({ t: "green", s: `Freschissimo: ${Math.round(ageSec)}s — bundle ancora valido` });
  } else if (ageSec < 60) {
    score += 7;
    flags.push({ t: "green", s: `Fresco: ${Math.round(ageSec)}s` });
  } else if (ageSec < 120) {
    score += 4;
    flags.push({ t: "green", s: `Ancora fresco: ${Math.round(ageSec)}s` });
  } else if (ageSec < 300) {
    flags.push({ t: "orange", s: `${Math.round(ageSec)}s — finestra bundle si restringe` });
  } else {
    score -= 15;
    flags.push({ t: "red", s: `${Math.floor(ageSec / 60)}min — bundle probabilmente già eseguito` });
  }

  // Holder acceleration
  if (m.holderAccel > 5) {
    score += 8;
    flags.push({ t: "green", s: `Holder in forte accelerazione +${m.holderAccel}/min` });
  } else if (m.holderAccel > 2) {
    score += 4;
    flags.push({ t: "green", s: `Holder in accelerazione +${m.holderAccel}/min` });
  } else if (m.holderAccel < -5) {
    score -= 10;
    flags.push({ t: "red", s: `Holder in caduta ${m.holderAccel}/min` });
  }

  // Bonding
  if (tok.bonding >= 85) {
    score -= 20;
    flags.push({ t: "red", s: `Bonding al ${tok.bonding}% — migrazione imminente, rischio alto` });
  } else if (tok.bonding >= 70) {
    score -= 10;
    flags.push({ t: "orange", s: `Bonding al ${tok.bonding}% — poco spazio residuo` });
  } else if (tok.bonding >= 50) {
    flags.push({ t: "orange", s: `Bonding al ${tok.bonding}%` });
  } else {
    score += 5;
    flags.push({ t: "green", s: `Bonding basso ${tok.bonding}% — spazio di salita` });
  }

  // Market cap
  if (tok.mc > 0 && tok.mc < 10000) {
    score += 5;
    flags.push({ t: "green", s: `MC entry bassa: ${fmc(tok.mc)}` });
  } else if (tok.mc >= 10000 && tok.mc < 50000) {
    flags.push({ t: "green", s: `MC: ${fmc(tok.mc)}` });
  } else if (tok.mc >= 50000) {
    score -= 5;
    flags.push({ t: "orange", s: `MC alta per entry: ${fmc(tok.mc)}` });
  }

  // Holder trend
  const hTrend = getHolderTrend(tok.mint);
  if (hTrend.dir === "up" && hTrend.delta >= 2) {
    score += 8;
    flags.push({ t: "green", s: `Holder attivi in crescita (+${hTrend.delta}, +${hTrend.pct}%)` });
  } else if (hTrend.dir === "down" && hTrend.delta <= -2) {
    score -= 12;
    flags.push({ t: "red", s: `Holder attivi in calo (${hTrend.delta}, ${hTrend.pct}%) — distribuzione si concentra` });
  }

  // Reply count
  if (tok.replyCount !== undefined) {
    if (tok.replyCount >= 20) {
      score += 8;
      flags.push({ t: "green", s: `${tok.replyCount} reply in chat — community attiva` });
    } else if (tok.replyCount >= 5) {
      score += 3;
      flags.push({ t: "orange", s: `${tok.replyCount} reply in chat` });
    }
    if (tok.lastReply && Date.now() - tok.lastReply < 60000) {
      score += 3;
      flags.push({ t: "green", s: "Chat attiva proprio ora" });
    }
  }

  // Migrated
  if (tok.migrated) {
    score -= 30;
    flags.push({ t: "red", s: "Token GIA' MIGRATO su Raydium — fuori dalla finestra bundle" });
  }

  // Dead token detection
  const recentBuys60 = md.buys.filter((x: any) => Date.now() - x.ts < 60000).length;
  const recentSells60 = md.sells.filter((x: any) => Date.now() - x.ts < 60000).length;
  const totalRecent = recentBuys60 + recentSells60;
  if (ageSec > 90) {
    if (totalRecent === 0 && ageSec > 300) {
      score -= 30;
      flags.push({ t: "red", s: "TOKEN MORTO — zero attività da oltre 5 minuti" });
    } else if (totalRecent === 0 && ageSec > 180) {
      score -= 20;
      flags.push({ t: "red", s: "Nessuna attività recente — potrebbe essere morto" });
    } else if (totalRecent === 0) {
      score -= 10;
      flags.push({ t: "orange", s: "Nessuna attività negli ultimi 60s" });
    } else if (recentBuys60 === 0 && recentSells60 >= 2) {
      score -= 15;
      flags.push({ t: "red", s: "Solo vendite recenti — nessun nuovo buyer" });
    } else if (recentBuys60 >= 5) {
      score += 10;
      flags.push({ t: "green", s: `${recentBuys60} acquisti negli ultimi 60s — token VIVO` });
    } else if (recentBuys60 >= 2) {
      score += 5;
      flags.push({ t: "green", s: `${recentBuys60} acquisti recenti — ancora attivo` });
    }
  }

  // Velocity
  const rate60 = ageSec > 0 ? (md.buys.filter((x: any) => Date.now() - x.ts < 60000).length / Math.min(ageSec, 60)) * 60 : 0;
  if (ageSec > 120 && rate60 < 0.5 && md.buys.length > 0) {
    score -= 15;
    flags.push({ t: "red", s: `Velocità quasi zero: ${rate60.toFixed(1)} tx/min — mercato piatto` });
  } else if (ageSec > 60 && rate60 >= 10) {
    score += 8;
    flags.push({ t: "green", s: `Alta velocità: ${rate60.toFixed(0)} tx/min` });
  }

  // Elite signals
  const smartConv = md.swBuys.size;
  if (smartConv >= 4) score += 30;
  else if (smartConv >= 3) score += 25;
  else if (smartConv >= 2) score += 15;
  else if (smartConv >= 1) score += 5;

  const bundledW2 = new Set(
    Object.values(md.bundleSlots)
      .filter((x: any) => x.size >= 2)
      .flatMap((x: any) => [...x])
  );
  const bundlerStillHolding =
    bundledW2.size -
    new Set(md.sells.filter((x: any) => bundledW2.has(x.wallet)).map((x: any) => x.wallet)).size;
  const retention = bundledW2.size > 0 ? (bundlerStillHolding / bundledW2.size) * 100 : 0;
  if (retention >= 90) score += 25;
  else if (retention >= 75) score += 15;
  else if (retention >= 50) score += 5;
  else score -= 15;

  const last30e = md.buys.filter((x: any) => Date.now() - x.ts < 30000).length;
  const prev30e = md.buys.filter((x: any) => Date.now() - x.ts >= 30000 && Date.now() - x.ts < 60000).length;
  if (last30e > prev30e * 2) score += 15;
  else if (last30e > prev30e) score += 8;
  else if (last30e < prev30e * 0.5) score -= 10;

  const uniqueW = new Set(md.buys.map((x: any) => x.wallet)).size;
  const diversity = md.buys.length > 0 ? uniqueW / md.buys.length : 0;
  if (diversity > 0.8) score += 10;
  else if (diversity < 0.3) score -= 15;

  const earlySmartExit = md.sells.some(
    (s: any) => SMART_SET.has(s.wallet) && s.ts - tok.ts < 90000
  );
  if (earlySmartExit) {
    score -= 40;
    flags.push({ t: "red", s: "SMART WALLET EXIT PRECOCE" });
  }

  const firstSell = md.sells.length
    ? md.sells.reduce((a: any, b: any) => (a.ts < b.ts ? a : b))
    : null;
  if (firstSell) {
    const delay = (firstSell.ts - tok.ts) / 1000;
    if (delay < 15) score -= 20;
    else if (delay > 180) score += 10;
  }

  const hc = holderConc.get(tok.mint);
  if (hc) {
    if (hc.top1pct > 20) score -= 20;
    else if (hc.top1pct > 10) score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  const raw10 = score / 10;
  const rating = Math.round(raw10 * 2) / 2;
  let rLabel: string, rColor: string;
  if (rating >= 9) {
    rLabel = "S+";
    rColor = "#22c55e";
  } else if (rating >= 8) {
    rLabel = "S";
    rColor = "#4ade80";
  } else if (rating >= 7) {
    rLabel = "A";
    rColor = "#86efac";
  } else if (rating >= 6) {
    rLabel = "B";
    rColor = "#facc15";
  } else if (rating >= 5) {
    rLabel = "C";
    rColor = "#fb923c";
  } else if (rating >= 4) {
    rLabel = "D";
    rColor = "#f97316";
  } else if (rating >= 3) {
    rLabel = "E";
    rColor = "#ef4444";
  } else {
    rLabel = "F";
    rColor = "#7f1d1d";
  }

  let verdict: string, vcolor: string, vemoji: string;
  if (score >= 75) {
    verdict = "SNIPE IT";
    vcolor = "#22c55e";
    vemoji = "🎯";
  } else if (score >= 55) {
    verdict = "ENTRA";
    vcolor = "#4ade80";
    vemoji = "⚡";
  } else if (score >= 40) {
    verdict = "WATCH";
    vcolor = "#facc15";
    vemoji = "👀";
  } else if (score >= 20) {
    verdict = "RISCHIO";
    vcolor = "#f97316";
    vemoji = "⚠️";
  } else {
    verdict = "SKIP";
    vcolor = "#6b7280";
    vemoji = "❌";
  }

  return {
    score,
    flags,
    verdict,
    vcolor,
    vemoji,
    rating,
    rLabel,
    rColor,
    bundlerSells: m.bundlerSells,
    m,
  };
}

// ─── Velocity ──────────────────────────────────────────────────────────────────
export function calcVelocity(md: MintData, tokTs: number): VelocityData {
  const m = calcAdvancedMetrics(md, tokTs);
  return { t30: m.t30, t60: m.t60, l30s: m.l30s, l60s: m.l60s, rate: m.rate };
}

// ─── Pump trend ────────────────────────────────────────────────────────────────
export function calcPumpTrend(mint: string): PumpTrend {
  const snaps = pumpHistory.get(mint);
  if (!snaps || snaps.length < 2) {
    return { trend: 0, label: "DATI INSUFFICIENTI", color: "#475569", mcSlope: 0, volSlope: 0, bondSlope: 0, history: snaps || [] };
  }
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const dt = Math.max((last.ts - first.ts) / 1000, 1);
  const mcSlope = ((last.mc - first.mc) / Math.max(first.mc, 1)) * 100;
  const volSlope = ((last.cumVol - first.cumVol) / dt) * 60;
  const bondSlope = ((last.bonding - first.bonding) / dt) * 60;
  const recent = snaps.slice(-3);
  const recentMcDelta = recent.length >= 2 ? recent[recent.length - 1].mc - recent[0].mc : 0;
  const isRecentlyRising = recentMcDelta > 0;
  let trend = 50;
  trend += Math.max(-30, Math.min(30, mcSlope * 0.3));
  trend += Math.max(-25, Math.min(25, volSlope * 2));
  trend += Math.max(-15, Math.min(15, bondSlope * 3));
  if (!isRecentlyRising && mcSlope > 0) trend -= 15;
  trend = Math.max(0, Math.min(100, trend));
  let label: string, color: string;
  if (trend >= 75) { label = "STA PUMPANDO FORTE"; color = "#22c55e"; }
  else if (trend >= 60) { label = "STA SALENDO"; color = "#4ade80"; }
  else if (trend >= 45) { label = "STABILE"; color = "#facc15"; }
  else if (trend >= 25) { label = "STA RALLENTANDO"; color = "#f97316"; }
  else { label = "ABBANDONATO/CROLLO"; color = "#ef4444"; }
  return { trend: Math.round(trend), label, color, mcSlope: +mcSlope.toFixed(1), volSlope: +volSlope.toFixed(2), bondSlope: +bondSlope.toFixed(2), history: snaps };
}

// ─── Multiplier ────────────────────────────────────────────────────────────────
export function calcMultiplier(mint: string, mcNow: number): Multiplier {
  const snaps = pumpHistory.get(mint);
  const initialMc = snaps && snaps.length ? snaps[0].mc : mcNow;
  if (!initialMc || initialMc <= 0) return { mult: 1, initialMc: 0, label: null, color: "#475569" };
  const mult = mcNow / initialMc;
  let label: string | null = null, color = "#475569";
  if (mult >= 50) { label = "x50+"; color = "#fde047"; }
  else if (mult >= 20) { label = "x20+"; color = "#facc15"; }
  else if (mult >= 10) { label = "x10"; color = "#4ade80"; }
  else if (mult >= 5) { label = "x5"; color = "#22c55e"; }
  else if (mult >= 2) { label = "x2"; color = "#38bdf8"; }
  return { mult: +mult.toFixed(2), initialMc, label, color };
}

// ─── Record pump snapshot ──────────────────────────────────────────────────────
export function recordPumpSnapshot(mint: string, mc: number, bonding: number, md: MintData, symbol: string) {
  if (!pumpHistory.has(mint)) pumpHistory.set(mint, []);
  const arr = pumpHistory.get(mint);
  const cumVol = md.buys.reduce((s: number, e: any) => s + e.sol, 0) + md.sells.reduce((s: number, e: any) => s + e.sol, 0);
  const last = arr[arr.length - 1];
  if (last && Date.now() - last.ts < 2000 && Math.abs(mc - last.mc) < mc * 0.02) return;
  arr.push({ ts: Date.now(), mc, bonding, cumVol: +cumVol.toFixed(3), buys: md.buys.length, sells: md.sells.length });
  if (arr.length > MAX_SNAPSHOTS) arr.shift();
  const sym = symbol || mint.slice(0, 6);
  if (mc > 0) checkMcMilestone(mint, sym, mc);
  if (bonding > 0) checkBondingMilestone(mint, sym, bonding);
}

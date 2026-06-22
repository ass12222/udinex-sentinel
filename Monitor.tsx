import { useState, useEffect, useRef } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const PUMP_V3      = "https://frontend-api-v3.pump.fun";
let HELIUS_KEY = "";
function getRpcHttpList() {
  if (HELIUS_KEY) {
    return [
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
      "https://solana.publicnode.com",
      "https://api.mainnet-beta.solana.com",
    ];
  }
  return [
    "https://solana.publicnode.com",
    "https://api.mainnet-beta.solana.com",
    "https://rpc.ankr.com/solana",
  ];
}
const RPC_WS_LIST = [
  "wss://solana.publicnode.com",
  "wss://api.mainnet-beta.solana.com",
];
const SMART_WALLETS = [
  "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o",
  "Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt",
  "DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm",
  "5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg",
  "4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9",
  "5B52w1ZW9touwUduueP5J7HXz5AcGfruGoX6YoAudvyxG",
  "6HJetMbdHBuk3mLUainxAPpBpWzDgYbHGTS2TqDAUSX2",
  "215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP",
  "4Be9CvxqHW6BYiRAxW9Q3xu1ycTMWaL5z8NX4HR3ha7t",
];
const SMART_SET   = new Set(SMART_WALLETS);
const SMART_SHORT = Object.fromEntries(SMART_WALLETS.map(w=>[w, w.slice(0,5)+"..."+w.slice(-4)]));

// ─── Dev blacklist ─────────────────────────────────────────────────────────────
const devBlacklist = new Map();
function markDevBad(dev, reason) {
  const ex = devBlacklist.get(dev)||{count:0,lastSeen:0,reason};
  devBlacklist.set(dev,{count:ex.count+1,lastSeen:Date.now(),reason});
}
function isDevBad(dev) { const d=devBlacklist.get(dev); return d&&d.count>=1; }

// ─── RPC ──────────────────────────────────────────────────────────────────────
let rpcIdx=0;
async function rpcPost(method,params,retries=4){
  for(let i=0;i<retries;i++){
    const list=getRpcHttpList();
    const url=list[rpcIdx%list.length];
    try{
      const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(10000)});
      if(!r.ok){
        if(r.status===429){ await new Promise(res=>setTimeout(res,1500*(i+1))); }
        throw new Error(String(r.status));
      }
      const j=await r.json();
      if(j.error) throw new Error(j.error.message);
      return j.result;
    }catch{rpcIdx++;}
  }
  return null;
}
const getTx      = sig  => rpcPost("getTransaction",[sig,{encoding:"jsonParsed",maxSupportedTransactionVersion:0}]);
const getHolders = mint => rpcPost("getTokenLargestAccounts",[mint,{commitment:"confirmed"}]).then(r=>r?.value||[]);
const getSupply  = mint => rpcPost("getTokenSupply",[mint,{commitment:"confirmed"}]).then(r=>r?.value?.uiAmount||0);

// ─── Coin cache ────────────────────────────────────────────────────────────────
const coinCache={}, pendingCoins={};
async function getCoin(mint){
  if(coinCache[mint]) return coinCache[mint];
  if(pendingCoins[mint]) return pendingCoins[mint];
  const p=fetch(`${PUMP_V3}/coins/${mint}`,{signal:AbortSignal.timeout(5000)})
    .then(r=>r.ok?r.json():{}).catch(()=>({}))
    .then(d=>{coinCache[mint]=d;delete pendingCoins[mint];return d;});
  pendingCoins[mint]=p;
  return p;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmc  = v=>!v?"—":v>=1e6?`$${(v/1e6).toFixed(2)}M`:v>=1000?`$${(v/1000).toFixed(1)}K`:`$${v.toFixed(0)}`;
const fSol = v=>v?`◎${(+v).toFixed(3)}`:"—";
const short = a=>a?`${a.slice(0,5)}...${a.slice(-4)}`:"—";
const bondingPct = c=>{const vt=c?.virtual_token_reserves||0;return vt?+Math.max(0,Math.min(100,(1-(vt/1073000191000000))*100)).toFixed(1):0;};
const today   = ()=>new Date().toISOString().slice(0,10);
const fAgeSec = ms=>{const s=Math.floor((Date.now()-ms)/1000);return s<60?`${s}s`:`${Math.floor(s/60)}m${s%60}s`;};
const fAgeShort = ms=>{const s=Math.floor((Date.now()-ms)/1000);return s<60?`${s}s`:`${Math.floor(s/60)}m`;};

// ─── Holder history ────────────────────────────────────────────────────────────
const holderHistory=new Map();
const holderConc=new Map();
const holderCountHistory=new Map();
function recordHolderCount(mint, count) {
  if (!holderCountHistory.has(mint)) holderCountHistory.set(mint, []);
  const arr = holderCountHistory.get(mint);
  arr.push({ ts: Date.now(), count });
  if (arr.length > 20) arr.shift();
}
function getHolderTrend(mint) {
  const arr = holderCountHistory.get(mint);
  if (!arr || arr.length < 2) return { delta: 0, pct: 0, dir: "flat" };
  const first = arr[0].count, last = arr[arr.length-1].count;
  const delta = last - first;
  const pct = first > 0 ? (delta/first)*100 : 0;
  return { delta, pct: +pct.toFixed(1), dir: delta>0?"up":delta<0?"down":"flat" };
}
const pendingHolderFetch=new Set();

function recordWalletActivity(mint,wallet,action,sol){
  if(!holderHistory.has(mint)) holderHistory.set(mint,{});
  const h=holderHistory.get(mint);
  const d=today();
  if(!h[d]) h[d]={wallets:new Set(),buys:0,sells:0,vol:0};
  h[d].wallets.add(wallet);
  if(action==="buy"){h[d].buys++;h[d].vol+=sol;}
  if(action==="sell") h[d].sells++;
}

async function fetchHolderConc(mint){
  if(pendingHolderFetch.has(mint)) return;
  const ex=holderConc.get(mint);
  if(ex&&(Date.now()-ex.ts)<60000) return;
  pendingHolderFetch.add(mint);
  holderConc.set(mint,{loading:true,top1pct:0,top10pct:0,holders:[],ts:0});
  G.listeners.forEach(fn=>fn());
  try{
    const [holders,supply]=await Promise.all([getHolders(mint),getSupply(mint)]);
    if(!supply||!holders.length){pendingHolderFetch.delete(mint);return;}
    const parsed=holders.map(h=>({addr:h.address,amount:h.uiAmount||0,
      pct:supply>0?+((h.uiAmount/supply)*100).toFixed(2):0})).sort((a,b)=>b.pct-a.pct);
    holderConc.set(mint,{loading:false,
      top1pct:parsed[0]?.pct||0,
      top3pct:parsed.slice(0,3).reduce((s,h)=>s+h.pct,0),
      top10pct:parsed.slice(0,10).reduce((s,h)=>s+h.pct,0),
      holders:parsed.slice(0,20),ts:Date.now()});
    recordHolderCount(mint, parsed.filter(p=>p.amount>0).length);
  }catch{holderConc.delete(mint);}
  finally{pendingHolderFetch.delete(mint);}
  G.listeners.forEach(fn=>fn());
}

// ─── Bundle score ──────────────────────────────────────────────────────────────
function calcBundleScore(md){
  const slots=md.bundleSlots,keys=Object.keys(slots);
  if(!keys.length) return {score:0,pctW:0,bSlots:0};
  const bundled=keys.filter(s=>slots[s].size>=2);
  const allW=new Set(keys.flatMap(s=>[...slots[s]]));
  const bW=new Set(bundled.flatMap(s=>[...slots[s]]));
  const pctW=allW.size?bW.size/allW.size*100:0;
  const score=Math.min(100,Math.min(40,bundled.length*10)+Math.min(30,Math.floor(pctW*.5))+Math.min(30,keys.length*3));
  return {score,pctW:+pctW.toFixed(1),bSlots:bundled.length};
}

// ─── PUMP TRACKER ──────────────────────────────────────────────────────────────
const pumpHistory = new Map();

// ─── VOICE / TTS ──────────────────────────────────────────────────────────────
const voiceState = {
  enabled: false, queue: [], speaking: false,
  lastSpokenMc: new Map(), lastSpokenBonding: new Map(),
  pauseRecognition: null as (()=>void)|null,
  resumeRecognition: null as (()=>void)|null,
  pttActive: false, // true mentre l'utente sta registrando una domanda push-to-talk
};

function speak(text) {
  if (!voiceState.enabled) return;
  voiceState.queue.push(text);
  drainVoiceQueue();
}
function drainVoiceQueue() {
  if (voiceState.speaking || !voiceState.queue.length) return;
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const text = voiceState.queue.shift();
  voiceState.speaking = true;
  // Pausa il microfono mentre parla — evita il feedback loop
  if (voiceState.pauseRecognition) voiceState.pauseRecognition();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "it-IT";
  utter.rate = 1.05;
  utter.pitch = 0.9;
  utter.onend = () => {
    voiceState.speaking = false;
    // Riprende ascolto dopo 1.2s per far svanire l'eco
    setTimeout(() => { if (voiceState.resumeRecognition) voiceState.resumeRecognition(); }, 1200);
    drainVoiceQueue();
  };
  utter.onerror = () => {
    voiceState.speaking = false;
    setTimeout(() => { if (voiceState.resumeRecognition) voiceState.resumeRecognition(); }, 600);
    drainVoiceQueue();
  };
  try { window.speechSynthesis.speak(utter); } catch { voiceState.speaking = false; }
}

const MC_STEP = 3000;
function checkMcMilestone(mint, symbol, mc) {
  const lastStep = voiceState.lastSpokenMc.get(mint) || 0;
  const currentStep = Math.floor(mc / MC_STEP);
  if (currentStep > lastStep) {
    voiceState.lastSpokenMc.set(mint, currentStep);
    if (lastStep > 0) {
      speak(`${symbol} ha superato ${fmc(currentStep * MC_STEP)} di market cap`);
    } else {
      voiceState.lastSpokenMc.set(mint, currentStep);
    }
  }
}
const BOND_STEP = 20;
function checkBondingMilestone(mint, symbol, bonding) {
  const lastStep = voiceState.lastSpokenBonding.get(mint) || 0;
  const currentStep = Math.floor(bonding / BOND_STEP);
  if (currentStep > lastStep && currentStep > 0) {
    voiceState.lastSpokenBonding.set(mint, currentStep);
    if (bonding >= 90) speak(`${symbol} bonding quasi completata, ${Math.round(bonding)} percento`);
    else speak(`${symbol} bonding al ${Math.round(bonding)} percento`);
  }
}

// ─── AGENTE AI (ZERO) — Pollinations AI, gratuito, zero API key ───────────────
const aiAgentState = { enabled: true, lastRunAt: 0, running: false, lastText: "", history: [] };

async function runAiRecap(scoredSnapshot, userQuestion) {
  if (aiAgentState.running) return;
  aiAgentState.running = true;
  try {
    const top = scoredSnapshot.slice(0, 8).map(({tok,ss,pump,multi}) => ({
      symbol: tok.symbol,
      score: ss.score,
      verdict: ss.verdict,
      bundlePct: tok.pctW,
      bSlots: tok.bSlots,
      mcUsd: Math.round(tok.mc),
      bonding: tok.bonding,
      swBuy: tok.swBuy,
      swSell: tok.swSell,
      bundlerSellCount: ss.bundlerSells ? ss.bundlerSells.length : 0,
      devSold: tok.devSold,
      pumpTrend: pump.label,
      multiplier: multi.mult,
      ageSec: Math.round((Date.now()-tok.ts)/1000),
    }));

    const sysPrompt = userQuestion
      ? `Sei Udini, assistente vocale AI per trading di token Solana su pump.fun, specializzato in bundle-snipe. L'utente ti ha fatto una domanda diretta a voce. Ti arriva anche uno snapshot JSON dei token piu' rilevanti come contesto. Rispondi alla domanda dell'utente in modo diretto e breve (massimo 2-4 frasi), in italiano colloquiale, tono da trader esperto che parla con un amico. REGOLE: 1. Usa SEMPRE il campo "symbol" (es: "BONK") — NON pronunciare mai indirizzi o stringhe lunghe. 2. Se la domanda riguarda un token specifico che non e' nello snapshot, dillo onestamente: "non ho dati su quel token ora". 3. Se chiede "dove entro" o simile, suggerisci il token con verdict migliore tra quelli con bundlerSellCount basso e devSold false. 4. Se chiede "devo uscire" su qualcosa, controlla bundlerSellCount e devSold. Rispondi SOLO con testo da pronunciare, zero markdown, zero emoji, zero elenchi.`
      : `Sei Udini, assistente vocale AI per trading di token Solana su pump.fun, specializzato in bundle-snipe. Ti arriva uno snapshot JSON dei token piu' rilevanti. Devi fare un recap PARLATO molto breve (massimo 2-3 frasi), in italiano colloquiale, tono diretto come un trader esperto. REGOLE ASSOLUTE: 1. Usa SEMPRE il campo "symbol" del JSON (es: "BONK", "PEPE") — NON pronunciare mai indirizzi, codici esadecimali o stringhe lunghe. Se non c'e' symbol, dici solo "un token". 2. Ignora i token con score sotto 30 o con flag "TOKEN MORTO". 3. Se c'e' un token con verdict SNIPE IT o ENTRA, bundlerSellCount basso e devSold false: dillo subito con nome e mcap. 4. Se un bundler o dev sta vendendo su un token caldo: avvisa di uscire SUBITO con il nome del token. 5. Se tutto e' fermo: dillo in una frase. Rispondi SOLO con testo da pronunciare, zero markdown, zero emoji, zero elenchi.`;

    const userMsg = userQuestion
      ? `Domanda dell'utente: "${userQuestion}"\n\nSnapshot token ora (${new Date().toLocaleTimeString()}):\n${JSON.stringify(top, null, 0)}`
      : `Snapshot token ora (${new Date().toLocaleTimeString()}):\n${JSON.stringify(top, null, 0)}`;

    // Pollinations AI — gratuito, nessuna API key richiesta
    const response = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userMsg },
        ],
        model: "openai-fast",
        seed: Math.floor(Math.random() * 99999),
        private: true,
      }),
      signal: AbortSignal.timeout(25000),
    });

    const text = (await response.text()).trim();
    if (text) {
      aiAgentState.lastText = text;
      aiAgentState.history.unshift({ ts: Date.now(), text, isReply: !!userQuestion, question: userQuestion||null });
      if (aiAgentState.history.length > 30) aiAgentState.history.length = 30;
      speak(text);
      G.listeners.forEach(fn => fn());
    }
  } catch {
    // silenzioso: non bloccare il loop
  } finally {
    aiAgentState.running = false;
    aiAgentState.lastRunAt = Date.now();
  }
}

const MAX_SNAPSHOTS = 40;

function recordPumpSnapshot(mint, mc, bonding, md, symbol) {
  if (!pumpHistory.has(mint)) pumpHistory.set(mint, []);
  const arr = pumpHistory.get(mint);
  const cumVol = md.buys.reduce((s,e)=>s+e.sol,0) + md.sells.reduce((s,e)=>s+e.sol,0);
  const last = arr[arr.length-1];
  if (last && Date.now()-last.ts < 2000 && Math.abs(mc-last.mc) < mc*0.02) return;
  arr.push({ ts: Date.now(), mc, bonding, cumVol: +cumVol.toFixed(3), buys: md.buys.length, sells: md.sells.length });
  if (arr.length > MAX_SNAPSHOTS) arr.shift();
  const sym = symbol || mint.slice(0,6);
  if (mc > 0) checkMcMilestone(mint, sym, mc);
  if (bonding > 0) checkBondingMilestone(mint, sym, bonding);
}

function calcPumpTrend(mint) {
  const snaps = pumpHistory.get(mint);
  if (!snaps || snaps.length < 2) {
    return { trend:0, label:"DATI INSUFFICIENTI", color:"#475569", mcSlope:0, volSlope:0, bondSlope:0, history:snaps||[] };
  }
  const first = snaps[0];
  const last  = snaps[snaps.length-1];
  const dt = Math.max((last.ts-first.ts)/1000, 1);
  const mcSlope   = ((last.mc - first.mc) / Math.max(first.mc,1)) * 100;
  const volSlope  = ((last.cumVol - first.cumVol) / dt) * 60;
  const bondSlope = ((last.bonding - first.bonding) / dt) * 60;
  const recent = snaps.slice(-3);
  const recentMcDelta = recent.length>=2 ? recent[recent.length-1].mc - recent[0].mc : 0;
  const isRecentlyRising = recentMcDelta > 0;
  let trend = 50;
  trend += Math.max(-30, Math.min(30, mcSlope * 0.3));
  trend += Math.max(-25, Math.min(25, volSlope * 2));
  trend += Math.max(-15, Math.min(15, bondSlope * 3));
  if (!isRecentlyRising && mcSlope > 0) trend -= 15;
  trend = Math.max(0, Math.min(100, trend));
  let label, color;
  if      (trend >= 75) { label="STA PUMPANDO FORTE"; color="#22c55e"; }
  else if (trend >= 60) { label="STA SALENDO";         color="#4ade80"; }
  else if (trend >= 45) { label="STABILE";             color="#facc15"; }
  else if (trend >= 25) { label="STA RALLENTANDO";     color="#f97316"; }
  else                  { label="ABBANDONATO/CROLLO";  color="#ef4444"; }
  return { trend: Math.round(trend), label, color, mcSlope: +mcSlope.toFixed(1), volSlope: +volSlope.toFixed(2), bondSlope: +bondSlope.toFixed(2), history: snaps };
}

function calcMultiplier(mint, mcNow) {
  const snaps = pumpHistory.get(mint);
  const initialMc = snaps && snaps.length ? snaps[0].mc : mcNow;
  if (!initialMc || initialMc <= 0) return { mult: 1, initialMc: 0, label: null, color: "#475569" };
  const mult = mcNow / initialMc;
  let label = null, color = "#475569";
  if      (mult >= 50) { label = "x50+"; color = "#fde047"; }
  else if (mult >= 20) { label = "x20+"; color = "#facc15"; }
  else if (mult >= 10) { label = "x10";  color = "#4ade80"; }
  else if (mult >= 5)  { label = "x5";   color = "#22c55e"; }
  else if (mult >= 2)  { label = "x2";   color = "#38bdf8"; }
  return { mult: +mult.toFixed(2), initialMc, label, color };
}

// ─── WALLET PORTFOLIO TRACKER ─────────────────────────────────────────────────
const walletPortfolio = new Map();
function recordWalletBuy(wallet, mint, mcEntry, symbol) {
  if (!walletPortfolio.has(wallet)) walletPortfolio.set(wallet, new Map());
  const port = walletPortfolio.get(wallet);
  if (!port.has(mint)) {
    port.set(mint, { mcEntry: mcEntry||0, ts: Date.now(), sold: false, soldTs: 0, symbol: symbol||mint.slice(0,6) });
  }
}
function recordWalletSell(wallet, mint) {
  const port = walletPortfolio.get(wallet);
  if (port && port.has(mint)) { const p = port.get(mint); p.sold = true; p.soldTs = Date.now(); }
}
function countOtherSmartBuyers(mint, excludeWallet) {
  let count = 0;
  for (const [w, port] of walletPortfolio.entries()) {
    if (w !== excludeWallet && port.has(mint)) count++;
  }
  return count;
}

// ─── Advanced metrics ─────────────────────────────────────────────────────────
function calcAdvancedMetrics(md: MintData,tokTs){
  const now=Date.now();
  const ageSec=(now-tokTs)/1000;
  const bundledWallets=new Set(
    Object.values(md.bundleSlots).filter(set=>set.size>=2).flatMap(set=>[...set])
  );
  const allBuyWallets=new Set(md.buys.map(e=>e.wallet));
  const bundleSolIn =md.buys.filter(e=>bundledWallets.has(e.wallet)).reduce((s,e)=>s+e.sol,0);
  const organicSolIn=md.buys.filter(e=>!bundledWallets.has(e.wallet)).reduce((s,e)=>s+e.sol,0);
  const totalSolIn  =bundleSolIn+organicSolIn;
  const totalSolOut =md.sells.reduce((s,e)=>s+e.sol,0);
  const bundleSolPct=totalSolIn>0?(bundleSolIn/totalSolIn)*100:0;
  const organicBuyers=new Set(md.buys.filter(e=>!bundledWallets.has(e.wallet)).map(e=>e.wallet));
  const cutoff2m=tokTs+120000;
  const earlyBuyers=new Set(md.buys.filter(e=>e.ts<=cutoff2m).map(e=>e.wallet));
  const lateBuyers =new Set(md.buys.filter(e=>e.ts>cutoff2m).map(e=>e.wallet));
  const holderRateEarly=ageSec>0?(earlyBuyers.size/Math.min(ageSec,120))*60:0;
  const holderRateLate =ageSec>120?(lateBuyers.size/(ageSec-120))*60:0;
  const holderAccel    =holderRateLate-holderRateEarly;
  const sellPressure   =totalSolIn>0?totalSolOut/totalSolIn:0;
  const bundlerSells   =md.sells.filter(s=>bundledWallets.has(s.wallet));
  const bundlerSolOut  =bundlerSells.reduce((s,e)=>s+e.sol,0);
  const bundlerExitPct =bundleSolIn>0?(bundlerSolOut/bundleSolIn)*100:0;
  const t30 =md.buys.filter(e=>e.ts<=tokTs+30000).length;
  const t60 =md.buys.filter(e=>e.ts<=tokTs+60000).length;
  const l30s=md.buys.filter(e=>now-e.ts<30000).length;
  const l60s=md.buys.filter(e=>now-e.ts<60000).length;
  const rate=ageSec>0?(l60s/Math.min(ageSec,60))*60:0;
  return {
    bundleSolIn:+bundleSolIn.toFixed(3),organicSolIn:+organicSolIn.toFixed(3),
    totalSolIn:+totalSolIn.toFixed(3),totalSolOut:+totalSolOut.toFixed(3),
    bundleSolPct:+bundleSolPct.toFixed(1),organicBuyers:organicBuyers.size,
    bundledWallets:bundledWallets.size,allBuyWallets:allBuyWallets.size,
    holderRateEarly:+holderRateEarly.toFixed(1),holderRateLate:+holderRateLate.toFixed(1),
    holderAccel:+holderAccel.toFixed(1),sellPressure:+sellPressure.toFixed(3),
    bundlerSells,bundlerSolOut:+bundlerSolOut.toFixed(3),bundlerExitPct:+bundlerExitPct.toFixed(1),
    t30,t60,l30s,l60s,rate:+rate.toFixed(1),
  };
}

// ─── SNIPE SCORE ───────────────────────────────────────────────────────────────
function calcSnipeScore(tok,md: MintData){
  let score=0;
  const flags=[];
  const ageSec=(Date.now()-tok.ts)/1000;
  const m=calcAdvancedMetrics(md,tok.ts);

  if(tok.pctW>=60)     {score+=25;flags.push({t:"green", s:"Bundle MASSICCIO — "+tok.pctW+"% wallet ("+tok.bSlots+" slot)"});}
  else if(tok.pctW>=40){score+=18;flags.push({t:"green", s:"Bundle forte — "+tok.pctW+"% ("+tok.bSlots+" slot)"});}
  else if(tok.pctW>=25){score+=10;flags.push({t:"orange",s:"Bundle medio — "+tok.pctW+"%"});}
  else if(tok.pctW>=10){score+=4; flags.push({t:"orange",s:"Bundle leggero — "+tok.pctW+"%"});}
  else                  {          flags.push({t:"red",   s:"Nessun bundle reale"});}

  if(m.bundleSolIn>=20)     {score+=20;flags.push({t:"green", s:"Bundle pesante: "+m.bundleSolIn+" SOL — bundler seri"});}
  else if(m.bundleSolIn>=10){score+=15;flags.push({t:"green", s:"Bundle: "+m.bundleSolIn+" SOL"});}
  else if(m.bundleSolIn>=4) {score+=10;flags.push({t:"green", s:"Bundle: "+m.bundleSolIn+" SOL"});}
  else if(m.bundleSolIn>=1) {score+=5; flags.push({t:"orange",s:"Bundle leggero: "+m.bundleSolIn+" SOL — possono uscire in fretta"});}
  else                       {          flags.push({t:"red",   s:"Bundle quasi vuoto (<1 SOL) — segnale debole"});}

  if(m.organicBuyers>=15)    {score+=15;flags.push({t:"green", s:m.organicBuyers+" organic buyer — domanda reale forte"});}
  else if(m.organicBuyers>=8){score+=10;flags.push({t:"green", s:m.organicBuyers+" organic buyer — buona trazione"});}
  else if(m.organicBuyers>=3){score+=6; flags.push({t:"orange",s:m.organicBuyers+" organic buyer — inizia"});}
  else if(m.organicBuyers>=1){score+=2; flags.push({t:"orange",s:m.organicBuyers+" organic buyer — ancora pochi"});}
  else                        {          flags.push({t:"red",   s:"Zero organic buyer — solo bundle, nessuna domanda esterna"});}

  if(m.bundleSolPct>95)     {score-=8; flags.push({t:"red",   s:"Volume 100% bundle — nessuno compra organicamente"});}
  else if(m.bundleSolPct>80){score-=3; flags.push({t:"orange",s:"Volume "+m.bundleSolPct+"% bundle, poca domanda esterna"});}

  if(tok.swBuy>=3)     {score+=15;flags.push({t:"green", s:tok.swBuy+" smart wallet dentro — CONVOY forte"});}
  else if(tok.swBuy===2){score+=10;flags.push({t:"green", s:"2 smart wallet dentro"});}
  else if(tok.swBuy===1){score+=5; flags.push({t:"green", s:"1 smart wallet dentro"});}

  if(tok.swSell>=2)    {score-=20;flags.push({t:"red",   s:tok.swSell+" smart wallet USCITI — segnale di exit"});}
  else if(tok.swSell===1){score-=8;flags.push({t:"orange",s:"1 smart wallet uscito"});}

  if(m.bundlerSells.length>=3){score-=30;flags.push({t:"red",   s:"BUNDLER STANNO VENDENDO MASSICCIAMENTE ("+m.bundlerSells.length+")"});}
  else if(m.bundlerSells.length>=2){score-=20;flags.push({t:"red",   s:"2+ bundler hanno venduto — PERICOLO"});}
  else if(m.bundlerSells.length===1){score-=8; flags.push({t:"orange",s:"1 bundler ha venduto — attenzione"});}

  if(tok.devSold){ score-=25; flags.push({t:"red",   s:"DEV HA VENDUTO — segnale di rug fortissimo"}); }

  const devBad=isDevBad(tok.dev);
  if(devBad){ score-=40; flags.push({t:"red", s:"Dev bannato — storico di dump"}); }

  if(ageSec<30)      {score+=10;flags.push({t:"green", s:"Freschissimo: "+Math.round(ageSec)+"s — bundle ancora valido"});}
  else if(ageSec<60) {score+=7; flags.push({t:"green", s:"Fresco: "+Math.round(ageSec)+"s"});}
  else if(ageSec<120){score+=4; flags.push({t:"green", s:"Ancora fresco: "+Math.round(ageSec)+"s"});}
  else if(ageSec<300){          flags.push({t:"orange",s:""+Math.round(ageSec)+"s — finestra bundle si restringe"});}
  else               {score-=15;flags.push({t:"red",   s:Math.floor(ageSec/60)+"min — bundle probabilmente già eseguito"});}

  if(m.holderAccel>5)      {score+=8; flags.push({t:"green", s:"Holder in forte accelerazione +"+m.holderAccel+"/min"});}
  else if(m.holderAccel>2) {score+=4; flags.push({t:"green", s:"Holder in accelerazione +"+m.holderAccel+"/min"});}
  else if(m.holderAccel<-5){score-=10;flags.push({t:"red",   s:"Holder in caduta "+m.holderAccel+"/min"});}

  if(tok.bonding>=85)      {score-=20;flags.push({t:"red",   s:"Bonding al "+tok.bonding+"% — migrazione imminente, rischio alto"});}
  else if(tok.bonding>=70) {score-=10;flags.push({t:"orange",s:"Bonding al "+tok.bonding+"% — poco spazio residuo"});}
  else if(tok.bonding>=50) {          flags.push({t:"orange",s:"Bonding al "+tok.bonding+"%"});}
  else                     {score+=5; flags.push({t:"green", s:"Bonding basso "+tok.bonding+"% — spazio di salita"});}

  if(tok.mc>0&&tok.mc<10000)          {score+=5; flags.push({t:"green", s:"MC entry bassa: "+fmc(tok.mc)});}
  else if(tok.mc>=10000&&tok.mc<50000){           flags.push({t:"green", s:"MC: "+fmc(tok.mc)});}
  else if(tok.mc>=50000)              {score-=5;  flags.push({t:"orange",s:"MC alta per entry: "+fmc(tok.mc)});}

  const hTrend=getHolderTrend(tok.mint);
  if(hTrend.dir==="up"&&hTrend.delta>=2)      {score+=8; flags.push({t:"green", s:"Holder attivi in crescita (+"+hTrend.delta+", +"+hTrend.pct+"%)"});}
  else if(hTrend.dir==="down"&&hTrend.delta<=-2){score-=12;flags.push({t:"red",   s:"Holder attivi in calo ("+hTrend.delta+", "+hTrend.pct+"%) — distribuzione si concentra"});}

  if(tok.replyCount!==undefined){
    if(tok.replyCount>=20)      {score+=8; flags.push({t:"green", s:tok.replyCount+" reply in chat — community attiva"});}
    else if(tok.replyCount>=5)  {score+=3; flags.push({t:"orange",s:tok.replyCount+" reply in chat"});}
    if(tok.lastReply&&(Date.now()-tok.lastReply)<60000){score+=3;flags.push({t:"green",s:"Chat attiva proprio ora"});}
  }

  if(tok.migrated){ score-=30; flags.push({t:"red", s:"Token GIA' MIGRATO su Raydium — fuori dalla finestra bundle"}); }

  // ── DEAD TOKEN / INATTIVITA' ────────────────────────────────────────
  const recentBuys60=md.buys.filter(x=>Date.now()-x.ts<60000).length;
  const recentSells60=md.sells.filter(x=>Date.now()-x.ts<60000).length;
  const totalRecent=recentBuys60+recentSells60;
  if(ageSec>90){
    if(totalRecent===0&&ageSec>300){score-=30;flags.push({t:"red",s:"TOKEN MORTO — zero attività da oltre 5 minuti"});}
    else if(totalRecent===0&&ageSec>180){score-=20;flags.push({t:"red",s:"Nessuna attività recente — potrebbe essere morto"});}
    else if(totalRecent===0){score-=10;flags.push({t:"orange",s:"Nessuna attività negli ultimi 60s"});}
    else if(recentBuys60===0&&recentSells60>=2){score-=15;flags.push({t:"red",s:"Solo vendite recenti — nessun nuovo buyer"});}
    else if(recentBuys60>=5){score+=10;flags.push({t:"green",s:`${recentBuys60} acquisti negli ultimi 60s — token VIVO`});}
    else if(recentBuys60>=2){score+=5;flags.push({t:"green",s:`${recentBuys60} acquisti recenti — ancora attivo`});}
  }
  // ── VELOCITY MINIMA (esclude token piatti) ─────────────────────────
  const rate60=ageSec>0?(md.buys.filter(x=>Date.now()-x.ts<60000).length/Math.min(ageSec,60))*60:0;
  if(ageSec>120&&rate60<0.5&&md.buys.length>0){score-=15;flags.push({t:"red",s:`Velocità quasi zero: ${rate60.toFixed(1)} tx/min — mercato piatto`});}
  else if(ageSec>60&&rate60>=10){score+=8;flags.push({t:"green",s:`Alta velocità: ${rate60.toFixed(0)} tx/min`});}
  // ────────────────────────────────────────────────────────────────────

  // ── ELITE SIGNALS ──────────────────────────────────────────────────
  const smartConv=md.swBuys.size;
  if(smartConv>=4)score+=30;else if(smartConv>=3)score+=25;else if(smartConv>=2)score+=15;else if(smartConv>=1)score+=5;

  const bundledW2=new Set(Object.values(md.bundleSlots).filter(x=>x.size>=2).flatMap(x=>[...x]));
  const bundlerStillHolding=bundledW2.size-new Set(md.sells.filter(x=>bundledW2.has(x.wallet)).map(x=>x.wallet)).size;
  const retention=bundledW2.size>0?(bundlerStillHolding/bundledW2.size)*100:0;
  if(retention>=90)score+=25;else if(retention>=75)score+=15;else if(retention>=50)score+=5;else score-=15;

  const last30e=md.buys.filter(x=>Date.now()-x.ts<30000).length;
  const prev30e=md.buys.filter(x=>Date.now()-x.ts>=30000&&Date.now()-x.ts<60000).length;
  if(last30e>prev30e*2)score+=15;else if(last30e>prev30e)score+=8;else if(last30e<prev30e*0.5)score-=10;

  const uniqueW=new Set(md.buys.map(x=>x.wallet)).size;
  const diversity=md.buys.length>0?uniqueW/md.buys.length:0;
  if(diversity>0.8)score+=10;else if(diversity<0.3)score-=15;

  const earlySmartExit=md.sells.some(s=>SMART_SET.has(s.wallet)&&(s.ts-tok.ts)<90000);
  if(earlySmartExit){score-=40;flags.push({t:"red",s:"SMART WALLET EXIT PRECOCE"});}

  const firstSell=md.sells.length?md.sells.reduce((a,b)=>a.ts<b.ts?a:b):null;
  if(firstSell){const delay=(firstSell.ts-tok.ts)/1000;if(delay<15)score-=20;else if(delay>180)score+=10;}

  const hc=holderConc.get(tok.mint);
  if(hc){if(hc.top1pct>20)score-=20;else if(hc.top1pct>10)score-=10;}
  // ────────────────────────────────────────────────────────────────────

  score=Math.max(0,Math.min(100,score));

  const raw10=score/10;
  const rating=Math.round(raw10*2)/2;
  let rLabel,rColor;
  if(rating>=9)    {rLabel="S+"; rColor="#22c55e";}
  else if(rating>=8){rLabel="S";  rColor="#4ade80";}
  else if(rating>=7){rLabel="A";  rColor="#86efac";}
  else if(rating>=6){rLabel="B";  rColor="#facc15";}
  else if(rating>=5){rLabel="C";  rColor="#fb923c";}
  else if(rating>=4){rLabel="D";  rColor="#f97316";}
  else if(rating>=3){rLabel="E";  rColor="#ef4444";}
  else              {rLabel="F";  rColor="#7f1d1d";}

  let verdict,vcolor,vemoji;
  if(score>=75)      {verdict="SNIPE IT";    vcolor="#22c55e";vemoji="🎯";}
  else if(score>=55) {verdict="ENTRA";       vcolor="#4ade80";vemoji="⚡";}
  else if(score>=40) {verdict="WATCH";       vcolor="#facc15";vemoji="👀";}
  else if(score>=20) {verdict="RISCHIO";     vcolor="#f97316";vemoji="⚠️";}
  else               {verdict="SKIP";        vcolor="#6b7280";vemoji="❌";}

  return {score,flags,verdict,vcolor,vemoji,rating,rLabel,rColor,bundlerSells:m.bundlerSells,m};
}

function calcVelocity(md,tokTs){
  const m=calcAdvancedMetrics(md,tokTs);
  return {t30:m.t30,t60:m.t60,l30s:m.l30s,l60s:m.l60s,rate:m.rate};
}

// ─── Global state ─────────────────────────────────────────────────────────────
const G={
  ws:null,wsIdx:0,connected:false,reconnecting:false,
  smartWs:null,smartConnected:false,smartReconnecting:false,
  msgCount:0,txParsed:0,txFailed:0,lastMsg:0,
  seenSigs:new Set(),events:[],smartEvents:[],
  mintData:new Map(),tokens:[],
  listeners:new Set<()=>void>(),parseQueue:[],
};
let activeJobs=0;
const MAX_PAR=2;
function notify(){G.listeners.forEach(fn=>fn());}
interface MintData {
  buys: any[];
  sells: any[];
  creates: any[];
  bundleSlots: Record<string,Set<string>>;
  swBuys: Set<string>;
  swSells: Set<string>;
  dev: string | null;
  devSol: number;
}
function getMintData(mint){
  if(!G.mintData.has(mint)) G.mintData.set(mint,{
    buys:[],sells:[],creates:[],bundleSlots:{} as Record<string,Set<string>>,
    swBuys:new Set(),swSells:new Set(),dev:null,devSol:0
  } as MintData);
  return G.mintData.get(mint) as MintData;
}

// ─── Parse pump.fun tx ────────────────────────────────────────────────────────
async function parseTxJob({sig,slot,action}){
  const tx=await getTx(sig);
  if(!tx){G.txFailed++;return;}
  const meta=tx.meta||{};
  const accts=tx.transaction?.message?.accountKeys||[];
  if(!accts.length) return;
  const signer=accts[0]?.pubkey;
  const preB=meta.preBalances||[],postB=meta.postBalances||[];
  const sol=(preB[0]&&postB[0])?Math.abs(preB[0]-postB[0])/1e9:0;
  const tokAll=[...(meta.postTokenBalances||[]),...(meta.preTokenBalances||[])];
  let mint=null;
  for(const tb of tokAll){const m=tb.mint||"";if(m&&m!=="So11111111111111111111111111111111111111112"){mint=m;break;}}
  if(!mint||!signer) return;
  G.txParsed++;
  const ev={sig,slot,action,wallet:signer,mint,sol:+sol.toFixed(5),ts:Date.now()};
  G.events.unshift(ev);if(G.events.length>600) G.events.length=600;
  if(action==="buy"||action==="sell") recordWalletActivity(mint,signer,action,sol);
  const md=getMintData(mint);
  if(action==="buy"){
    md.buys.unshift(ev);if(md.buys.length>100) md.buys.length=100;
    if(!md.bundleSlots[slot]) md.bundleSlots[slot]=new Set();
    md.bundleSlots[slot].add(signer);
    if(SMART_SET.has(signer)){
      md.swBuys.add(signer);
      const existingTok=G.tokens.find(t=>t.mint===mint);
      recordWalletBuy(signer, mint, existingTok?.mc||0, existingTok?.symbol);
      speak(`Smart wallet entra su ${existingTok?.symbol||mint.slice(0,6)}`);
    }
  }else if(action==="sell"){
    md.sells.unshift(ev);if(md.sells.length>100) md.sells.length=100;
    if(SMART_SET.has(signer)){
      md.swSells.add(signer); recordWalletSell(signer, mint);
      const existingTok=G.tokens.find(t=>t.mint===mint);
      speak(`Smart wallet esce da ${existingTok?.symbol||mint.slice(0,6)}`);
    }
    const tok=G.tokens.find(t=>t.mint===mint);
    if(tok&&signer===tok.dev&&(Date.now()-tok.ts)<300000){
      markDevBad(signer,"dump entro 5min");
      speak(`Attenzione, il dev di ${tok.symbol} ha venduto`);
    }
    const bundledW=new Set(Object.values(md.bundleSlots).filter(s=>s.size>=2).flatMap(s=>[...s]));
    const bundlerSellCount=md.sells.filter(s=>bundledW.has(s.wallet)).length;
    if(bundlerSellCount===2 && tok){ speak(`Attenzione, i bundler stanno uscendo da ${tok.symbol}`); }
  }else if(action==="create"){
    md.creates.unshift(ev);md.dev=signer;md.devSol=sol;
  }
  if(SMART_SET.has(signer)){
    const smEv={ts:Date.now(),wallet:signer,action,mint,sol:ev.sol,symbol:"...",mc:0,bonding:0,loading:true,dex:"pump.fun"};
    G.smartEvents.unshift(smEv);if(G.smartEvents.length>500) G.smartEvents.length=500;
    notify();
    getCoin(mint).then(coin=>{smEv.symbol=coin.symbol||mint.slice(0,6);smEv.mc=coin.usd_market_cap||0;smEv.bonding=bondingPct(coin);smEv.loading=false;notify();});
  }
  if(action==="create"){
    getCoin(mint).then(coin=>{
      const {score,pctW,bSlots}=calcBundleScore(md);
      const swBuy=md.swBuys.size,swSell=md.swSells.size;
      const devSold=md.sells.some(e=>e.wallet===signer);
      const mcUsd=coin.usd_market_cap||0,bd=bondingPct(coin);
      const tok={ts:Date.now(),mint,symbol:coin.symbol||mint.slice(0,6),name:coin.name||"?",
        dev:signer,solDev:sol,mc:mcUsd,score,pctW,bSlots,swBuy,swSell,bonding:bd,devSold,
        replyCount:coin.reply_count||0,lastReply:coin.last_reply||0,
        migrated:!!coin.complete,marketId:coin.market_id||null};
      const idx=G.tokens.findIndex(t=>t.mint===mint);
      if(idx>=0) G.tokens[idx]=tok; else G.tokens.unshift(tok);
      if(G.tokens.length>200) G.tokens.length=200;
      setTimeout(()=>fetchHolderConc(mint),8000);
      if(pctW>=40){ speak(`Nuovo token ${tok.symbol}, bundle forte al ${Math.round(pctW)} percento`); }
      notify();
    });
  }else{
    const idx=G.tokens.findIndex(t=>t.mint===mint);
    if(idx>=0){
      const tok=G.tokens[idx];
      const {score,pctW,bSlots}=calcBundleScore(md);
      const swBuy=md.swBuys.size,swSell=md.swSells.size;
      const devSold=md.dev&&md.sells.some(e=>e.wallet===md.dev);
      G.tokens[idx]={...tok,score,pctW,bSlots,swBuy,swSell,devSold};
      recordPumpSnapshot(mint, tok.mc, tok.bonding, md, tok.symbol);
      getCoin(mint).then(coin=>{
        const mcUsd=coin.usd_market_cap||tok.mc, bd=bondingPct(coin)||tok.bonding;
        const i2=G.tokens.findIndex(t=>t.mint===mint);
        if(i2>=0){
          G.tokens[i2]={...G.tokens[i2], mc:mcUsd, bonding:bd,
            replyCount:coin.reply_count??G.tokens[i2].replyCount,
            lastReply:coin.last_reply||G.tokens[i2].lastReply,
            migrated:!!coin.complete, marketId:coin.market_id||G.tokens[i2].marketId};
          recordPumpSnapshot(mint, mcUsd, bd, md, G.tokens[i2].symbol);
          notify();
        }
      });
    }
    notify();
  }
}

// ─── Parse smart wallet tx ────────────────────────────────────────────────────
async function parseSmartTxJob({sig,slot,wallet}){
  const tx=await getTx(sig);
  if(!tx){G.txFailed++;return;}
  const meta=tx.meta||{};
  const accts=tx.transaction?.message?.accountKeys||[];
  if(!accts.length) return;
  const signer=accts[0]?.pubkey;
  if(signer!==wallet) return;
  const preB=meta.preBalances||[],postB=meta.postBalances||[];
  const solDelta=(preB[0]!==undefined&&postB[0]!==undefined)?(postB[0]-preB[0])/1e9:0;
  const tokAll=[...(meta.postTokenBalances||[]),...(meta.preTokenBalances||[])];
  let mint=null;
  for(const tb of tokAll){const m=tb.mint||"";if(m&&m!=="So11111111111111111111111111111111111111112"){mint=m;break;}}
  if(!mint) return;
  G.txParsed++;
  const action=solDelta<-0.001?"buy":solDelta>0.001?"sell":null;
  if(!action) return;
  const sol=Math.abs(solDelta);
  const logs=(tx.meta?.logMessages||[]).join(" ");
  let dex="DEX";
  if(logs.includes("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")) dex="pump.fun";
  else if(logs.includes("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8")) dex="Raydium";
  else if(logs.includes("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4")) dex="Jupiter";
  else if(logs.includes("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc")) dex="Orca";
  else if(logs.includes("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C")) dex="Raydium CPMM";
  const ev={sig,slot,action,wallet:signer,mint,sol:+sol.toFixed(5),ts:Date.now(),fromSmartWs:true};
  G.events.unshift(ev);if(G.events.length>600) G.events.length=600;
  recordWalletActivity(mint,signer,action,sol);
  const md=getMintData(mint);
  if(action==="buy"){
    md.buys.unshift(ev);if(md.buys.length>100) md.buys.length=100;
    if(!md.bundleSlots[slot]) md.bundleSlots[slot]=new Set();
    md.bundleSlots[slot].add(signer);
    md.swBuys.add(signer);
  }else{
    md.sells.unshift(ev);if(md.sells.length>100) md.sells.length=100;
    md.swSells.add(signer);
    recordWalletSell(signer, mint);
    const tok=G.tokens.find(t=>t.mint===mint);
    if(tok&&signer===tok.dev&&(Date.now()-tok.ts)<300000) markDevBad(signer,"dump entro 5min");
  }
  const smEv={ts:Date.now(),wallet:signer,action,mint,sol:+sol.toFixed(5),symbol:"...",mc:0,bonding:0,loading:true,dex};
  G.smartEvents.unshift(smEv);if(G.smartEvents.length>500) G.smartEvents.length=500;
  notify();
  getCoin(mint).then(coin=>{
      smEv.symbol=coin.symbol||mint.slice(0,6);(smEv as any).name=coin.name||"?";
    smEv.mc=coin.usd_market_cap||0;smEv.bonding=bondingPct(coin);smEv.loading=false;
    if(action==="buy") recordWalletBuy(signer, mint, smEv.mc, smEv.symbol);
    const idx=G.tokens.findIndex(t=>t.mint===mint);
    if(idx>=0){
      const tok=G.tokens[idx];
      const {score,pctW,bSlots}=calcBundleScore(md);
      G.tokens[idx]={...tok,score,pctW,bSlots,swBuy:md.swBuys.size,swSell:md.swSells.size};
    }
    notify();
  });
}

function enqueue(job){G.parseQueue.push(job);drain();}
function drain(){
  while(activeJobs<MAX_PAR&&G.parseQueue.length>0){
    activeJobs++;
    const job=G.parseQueue.shift()!;
    const p=job.isSmartTx?parseSmartTxJob(job):parseTxJob(job);
    p.finally(()=>{activeJobs--;drain();});
  }
}

// ─── WebSocket pump.fun ───────────────────────────────────────────────────────
function startWs(){
  if(G.ws) return;
  function connect(){
    const url=RPC_WS_LIST[G.wsIdx%RPC_WS_LIST.length];
    G.reconnecting=false;
    try{
      const ws=new WebSocket(url);G.ws=ws;
      ws.onopen=()=>{
        G.connected=true;G.reconnecting=false;
        ws.send(JSON.stringify({jsonrpc:"2.0",id:1,method:"logsSubscribe",
          params:[{mentions:[PUMP_PROGRAM]},{commitment:"processed"}]}));
        notify();
      };
      ws.onmessage=e=>{
        try{
          const d=JSON.parse(e.data);
          if(d.method!=="logsNotification") return;
          G.msgCount++;G.lastMsg=Date.now();
          const val=d.params.result.value,sig=val.signature;
          const slot=d.params.result.context.slot,logs=val.logs||[];
          if(G.seenSigs.has(sig)) return;
          G.seenSigs.add(sig);
          if(G.seenSigs.size>8000){const a=[...G.seenSigs].slice(-4000);G.seenSigs.clear();a.forEach(x=>G.seenSigs.add(x));}
          let action=null;
          for(const l of logs){
            if(l.includes("Instruction: Buy")){action="buy";break;}
            if(l.includes("Instruction: Sell")){action="sell";break;}
            if(l.includes("Instruction: Create")){action="create";break;}
          }
          if(!action) return;
          enqueue({sig,slot,action});notify();
        }catch{}
      };
      ws.onerror=()=>{G.connected=false;notify();};
      ws.onclose=()=>{G.connected=false;G.ws=null;G.wsIdx++;G.reconnecting=true;notify();setTimeout(connect,3000);};
      const ping=setInterval(()=>{ws.readyState===WebSocket.OPEN?ws.send(JSON.stringify({jsonrpc:"2.0",id:2,method:"getHealth"})):clearInterval(ping);},25000);
    }catch{G.ws=null;G.wsIdx++;G.reconnecting=true;notify();setTimeout(connect,3000);}
  }
  connect();
}

// ─── WebSocket Helius per smart wallet ───────────────────────────────────────
const smartWsSubIds: Record<string,string> = {};
function startSmartWs(apiKey){
  if(!apiKey||G.smartWs) return;
  function connect(){
    G.smartReconnecting=false;
    const url=`wss://mainnet.helius-rpc.com/?api-key=${apiKey}`;
    try{
      const ws=new WebSocket(url);G.smartWs=ws;
      ws.onopen=()=>{
        G.smartConnected=true;G.smartReconnecting=false;
        SMART_WALLETS.forEach((wallet,i)=>{
          setTimeout(()=>{
            if(ws.readyState===WebSocket.OPEN)
              ws.send(JSON.stringify({jsonrpc:"2.0",id:100+i,method:"logsSubscribe",
                params:[{mentions:[wallet]},{commitment:"processed"}]}));
          }, i*500);
        });
        notify();
      };
      ws.onmessage=e=>{
        try{
          const d=JSON.parse(e.data);
          if(d.result!==undefined&&d.id>=100&&d.id<100+SMART_WALLETS.length){
            smartWsSubIds[d.result]=SMART_WALLETS[d.id-100];return;
          }
          if(d.method!=="logsNotification") return;
          G.lastMsg=Date.now();
          const val=d.params.result.value,sig=val.signature;
          const slot=d.params.result.context.slot;
          const wallet=smartWsSubIds[d.params.subscription];
          if(!wallet) return;
          const key=sig+"_sw";
          if(G.seenSigs.has(key)) return;
          G.seenSigs.add(key);
          enqueue({sig,slot,wallet,isSmartTx:true});notify();
        }catch{}
      };
      ws.onerror=()=>{G.smartConnected=false;notify();};
      ws.onclose=()=>{
        G.smartConnected=false;G.smartWs=null;G.smartReconnecting=true;
        Object.keys(smartWsSubIds).forEach(k=>delete smartWsSubIds[k]);
        notify();setTimeout(()=>connect(),20000);
      };
      const ping=setInterval(()=>{ws.readyState===WebSocket.OPEN?ws.send(JSON.stringify({jsonrpc:"2.0",id:999,method:"getHealth"})):clearInterval(ping);},30000);
    }catch{G.smartWs=null;G.smartReconnecting=true;notify();setTimeout(()=>connect(),20000);}
  }
  connect();
}

// ─── Components ───────────────────────────────────────────────────────────────
function Spark({values,w=64,h=20}){
  if(!values||values.length<2) return null;
  const max=Math.max(...values,1);
  const pts=values.map((v,i)=>`${(i/(values.length-1))*w},${h-(v/max)*h}`).join(" ");
  const last=values[values.length-1],prev=values[values.length-2];
  const c=last>prev?"#22c55e":last<prev?"#ef4444":"#64748b";
  return(
    <svg width={w} height={h} style={{display:"block",flexShrink:0}}>
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx={w} cy={h-(last/max)*h} r="2.5" fill={c}/>
    </svg>
  );
}

function RatingBadge({rating,rLabel,rColor,score}){
  const r=32,circ=2*Math.PI*r;
  const dash=circ*(score/100);
  return(
    <div style={{position:"relative",width:80,height:80,flexShrink:0}}>
      <svg width={80} height={80} style={{transform:"rotate(-90deg)"}}>
        <circle cx={40} cy={40} r={r} fill="none" stroke="#151d30" strokeWidth={5}/>
        <circle cx={40} cy={40} r={r} fill="none" stroke={rColor} strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{transition:"stroke-dasharray .5s"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:22,fontWeight:800,color:rColor,lineHeight:1}}>{rating.toFixed(1)}</div>
        <div style={{fontSize:9,fontWeight:700,color:rColor,opacity:.8,letterSpacing:".3px"}}>{rLabel}</div>
      </div>
    </div>
  );
}

// Copy button component
function CopyBtn({text}){
  const [copied,setCopied]=useState(false);
  const handleCopy=()=>{
    navigator.clipboard.writeText(text).then(()=>{
      setCopied(true);
      setTimeout(()=>setCopied(false),1500);
    }).catch(()=>{});
  };
  return(
    <button className={`copy-btn${copied?" copied":""}`} onClick={e=>{e.stopPropagation();handleCopy();}}>
      {copied?"✓ OK":"⧉ CA"}
    </button>
  );
}

// ─── NEURAL VIEW ──────────────────────────────────────────────────────────────
function NeuralView({ scored, onSelect }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef(new Map());
  const starsRef = useRef([]);
  const particlesRef = useRef([]);
  const animRef = useRef(null);
  const frameRef = useRef(0);
  const [dims, setDims] = useState({ w: 360, h: 500 });
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setDims({ w: e.contentRect.width, h: Math.max(460, e.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    canvas.style.width = dims.w + "px";
    canvas.style.height = dims.h + "px";
    ctx.scale(dpr, dpr);

    // Init starfield once
    if (starsRef.current.length === 0) {
      starsRef.current = Array.from({length:120},()=>({
        x: Math.random()*dims.w, y: Math.random()*dims.h,
        r: Math.random()*1.2+0.2,
        a: Math.random()*0.6+0.1,
        twinkle: Math.random()*Math.PI*2,
      }));
    }

    function tick() {
      frameRef.current++;
      const W = dims.w, H = dims.h, cx = W/2, cy = H/2;
      ctx.clearRect(0, 0, W, H);

      // Deep space background
      const bgGrad = ctx.createRadialGradient(cx*0.6, cy*0.4, 0, cx, cy, Math.max(W,H)*0.8);
      bgGrad.addColorStop(0, "rgba(0,20,40,0.6)");
      bgGrad.addColorStop(0.5, "rgba(0,6,18,0.4)");
      bgGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Nebula ambient glow top-right
      const nb1 = ctx.createRadialGradient(W*0.8, H*0.15, 0, W*0.8, H*0.15, W*0.4);
      nb1.addColorStop(0, "rgba(139,92,246,0.04)");
      nb1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = nb1; ctx.fillRect(0,0,W,H);

      // Stars
      starsRef.current.forEach(st => {
        st.twinkle += 0.025;
        const alpha = st.a * (0.6 + 0.4 * Math.sin(st.twinkle));
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(180,220,255,${alpha})`;
        ctx.fill();
      });

      // Scanning line (every 5s sweeps top→bottom)
      const scanY = ((frameRef.current * 0.5) % (H + 40)) - 20;
      const scanGrad = ctx.createLinearGradient(0, scanY-12, 0, scanY+12);
      scanGrad.addColorStop(0, "rgba(0,245,255,0)");
      scanGrad.addColorStop(0.5, "rgba(0,245,255,0.04)");
      scanGrad.addColorStop(1, "rgba(0,245,255,0)");
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY-12, W, 24);

      const live = scored.slice(0, 42);
      const liveMints = new Set(live.map(s => s.tok.mint));
      for (const mint of [...nodesRef.current.keys()]) {
        if (!liveMints.has(mint)) nodesRef.current.delete(mint);
      }
      live.forEach((s) => {
        if (!nodesRef.current.has(s.tok.mint)) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 50 + Math.random() * Math.min(W,H) * 0.36;
          nodesRef.current.set(s.tok.mint, {
            x: cx + Math.cos(angle)*dist, y: cy + Math.sin(angle)*dist,
            vx: (Math.random()-0.5)*0.12, vy: (Math.random()-0.5)*0.12,
            phase: Math.random()*Math.PI*2, ringPhase: Math.random()*Math.PI*2,
          });
        }
      });
      const nodeArr = live.map(s => ({ s, n: nodesRef.current.get(s.tok.mint) })).filter(x=>x.n);

      // Gravity toward center
      nodeArr.forEach(({n}) => {
        const dx = cx - n.x, dy = cy - n.y;
        n.vx += dx * 0.00025; n.vy += dy * 0.00025;
      });
      // Repulsion between nodes
      for (let a=0; a<nodeArr.length; a++) {
        for (let b=a+1; b<nodeArr.length; b++) {
          const na=nodeArr[a].n, nb=nodeArr[b].n;
          const dx=nb.x-na.x, dy=nb.y-na.y;
          const d2=dx*dx+dy*dy, minD=50;
          if (d2 < minD*minD && d2>0.01) {
            const d=Math.sqrt(d2), f=(minD-d)/d*0.018;
            na.vx -= dx*f; na.vy -= dy*f;
            nb.vx += dx*f; nb.vy += dy*f;
          }
        }
      }
      nodeArr.forEach(({n}) => {
        n.vx *= 0.94; n.vy *= 0.94;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(22, Math.min(W-22, n.x));
        n.y = Math.max(22, Math.min(H-22, n.y));
        n.phase += 0.035;
        n.ringPhase += 0.02;
      });

      // Central nexus — pulsing core
      const coreR = 8 + Math.sin(frameRef.current * 0.04) * 2;
      const coreGrad = ctx.createRadialGradient(cx,cy,0,cx,cy,coreR*6);
      coreGrad.addColorStop(0, "rgba(0,245,255,0.4)");
      coreGrad.addColorStop(0.3, "rgba(56,189,248,0.15)");
      coreGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = coreGrad;
      ctx.beginPath(); ctx.arc(cx,cy,coreR*6,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = "rgba(0,245,255,0.9)";
      ctx.beginPath(); ctx.arc(cx,cy,coreR,0,Math.PI*2); ctx.fill();
      // Rotating ring around core
      ctx.save();
      ctx.translate(cx,cy); ctx.rotate(frameRef.current*0.012);
      ctx.strokeStyle = "rgba(0,245,255,0.2)";
      ctx.lineWidth = 1; ctx.setLineDash([4,8]);
      ctx.beginPath(); ctx.arc(0,0,coreR*2.5,0,Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Connections: lines between close nodes and smart wallet pairs
      for (let a=0; a<nodeArr.length; a++) {
        for (let b=a+1; b<nodeArr.length; b++) {
          const na=nodeArr[a].n, nb=nodeArr[b].n;
          const dx=nb.x-na.x, dy=nb.y-na.y;
          const dist=Math.sqrt(dx*dx+dy*dy);
          if (dist < 200) {
            const sa=nodeArr[a].s, sb=nodeArr[b].s;
            const isSmart = sa.tok.swBuy>0 && sb.tok.swBuy>0;
            const alpha = (1 - dist/200) * (isSmart ? 0.22 : 0.06);
            if (isSmart) {
              const lGrad = ctx.createLinearGradient(na.x,na.y,nb.x,nb.y);
              lGrad.addColorStop(0, `rgba(0,245,255,${alpha})`);
              lGrad.addColorStop(0.5, `rgba(167,139,250,${alpha*1.3})`);
              lGrad.addColorStop(1, `rgba(0,245,255,${alpha})`);
              ctx.strokeStyle = lGrad;
              ctx.lineWidth = 1.2;
            } else {
              ctx.strokeStyle = `rgba(0,245,255,${alpha})`;
              ctx.lineWidth = 0.5;
            }
            ctx.beginPath(); ctx.moveTo(na.x,na.y); ctx.lineTo(nb.x,nb.y); ctx.stroke();
          }
        }
      }

      // Spoke lines from center to each node (very faint)
      nodeArr.forEach(({n}) => {
        ctx.strokeStyle = "rgba(0,245,255,0.04)";
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(n.x,n.y); ctx.stroke();
      });

      // Draw nodes as plasma orbs
      nodeArr.forEach(({s,n}) => {
        const score = s.ss.score;
        const pump = s.pump || { color: "#475569", trend: 50 };
        const isHot = score >= 55;
        const isSW = s.tok.swBuy > 0;

        // Node color: cyan for high score, violet for smart wallet, muted for others
        let nodeColor = score >= 75 ? "#00f5ff" :
                        score >= 55 ? "#38bdf8" :
                        isSW       ? "#a78bfa"  :
                        score >= 35 ? "#facc15" : "#1e4a6b";

        const radius = 5 + Math.min(12, score/100*12);
        const pulse = 1 + Math.sin(n.phase) * (isHot ? 0.2 : 0.08);
        const r2 = radius * pulse;

        // Outer nebula glow
        const glowGrad = ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,r2*4);
        glowGrad.addColorStop(0, nodeColor + "40");
        glowGrad.addColorStop(0.4, nodeColor + "18");
        glowGrad.addColorStop(1, nodeColor + "00");
        ctx.fillStyle = glowGrad;
        ctx.beginPath(); ctx.arc(n.x,n.y,r2*4,0,Math.PI*2); ctx.fill();

        // Core orb with plasma gradient
        const orbGrad = ctx.createRadialGradient(n.x-r2*0.3,n.y-r2*0.3,0,n.x,n.y,r2);
        orbGrad.addColorStop(0, nodeColor + "ff");
        orbGrad.addColorStop(0.6, nodeColor + "cc");
        orbGrad.addColorStop(1, nodeColor + "44");
        ctx.fillStyle = orbGrad;
        ctx.beginPath(); ctx.arc(n.x,n.y,r2,0,Math.PI*2); ctx.fill();

        // Ring for smart wallets or high score
        if (isHot || isSW) {
          const ringAlpha = 0.4 + 0.3*Math.sin(n.ringPhase);
          ctx.strokeStyle = nodeColor + Math.round(ringAlpha*255).toString(16).padStart(2,'0');
          ctx.lineWidth = 1;
          ctx.setLineDash([3,4]);
          ctx.beginPath(); ctx.arc(n.x,n.y,r2+5,0,Math.PI*2); ctx.stroke();
          ctx.setLineDash([]);
        }

        // Multiplier ring
        if (s.multi && s.multi.mult >= 2) {
          ctx.strokeStyle = s.multi.color + "aa";
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(n.x,n.y,r2+9,0,Math.PI*2); ctx.stroke();
        }

        // Label: symbol above node
        ctx.textAlign = "center";
        ctx.font = `bold 9px 'JetBrains Mono', monospace`;
        ctx.fillStyle = isHot ? "rgba(255,255,255,0.95)" : "rgba(196,212,240,0.7)";
        ctx.fillText(s.tok.symbol, n.x, n.y - r2 - 6);

        // MCap below symbol
        if (s.tok.mc > 0) {
          ctx.font = "7px 'JetBrains Mono', monospace";
          ctx.fillStyle = isHot ? "rgba(0,245,255,0.85)" : "rgba(30,74,107,0.9)";
          ctx.fillText(fmc(s.tok.mc), n.x, n.y - r2 - 16);
        }
      });

      animRef.current = requestAnimationFrame(tick);
    }
    tick();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [dims, scored]);

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    for (const [mint, n] of nodesRef.current.entries()) {
      const dx = x-n.x, dy = y-n.y;
      if (Math.sqrt(dx*dx+dy*dy) < 18) { onSelect && onSelect(mint); return; }
    }
  };

  return (
    <div ref={containerRef} style={{position:"relative",width:"100%",minHeight:380}}>
      <canvas ref={canvasRef} onClick={handleClick} style={{display:"block",borderRadius:10,cursor:"pointer"}}/>
    </div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css=`
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#010308;color:#c4d4f0;font-family:'JetBrains Mono',monospace;font-size:13px}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#010308}::-webkit-scrollbar-thumb{background:#0d1f2d;border-radius:2px}
.app{display:flex;flex-direction:column;height:100vh;overflow:hidden;position:relative;background:radial-gradient(ellipse 80% 50% at 10% 0%,rgba(0,245,255,0.03) 0%,transparent 60%),radial-gradient(ellipse 60% 40% at 90% 100%,rgba(139,92,246,0.04) 0%,transparent 60%),#010308}
.hdr{background:rgba(1,3,8,0.97);border-bottom:1px solid rgba(0,245,255,0.1);padding:7px 13px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;position:relative}
.hdr::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent 0%,rgba(0,245,255,0.3) 30%,rgba(139,92,246,0.3) 70%,transparent 100%)}
.logo{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;letter-spacing:2px;white-space:nowrap;color:#38bdf8;text-transform:uppercase;text-shadow:0 0 16px rgba(56,189,248,0.4)}
.logo em{color:#a78bfa;font-style:normal;text-shadow:0 0 16px rgba(167,139,250,0.5)}
@keyframes glitch{0%,90%,100%{text-shadow:0 0 16px rgba(56,189,248,0.4)}92%{text-shadow:-2px 0 rgba(236,72,153,0.7),2px 0 rgba(0,245,255,0.7)}95%{text-shadow:2px 0 rgba(139,92,246,0.7),-2px 0 rgba(56,189,248,0.4)}98%{text-shadow:0 0 24px rgba(56,189,248,0.9)}}
.logo{animation:glitch 7s ease-in-out infinite}
.hstats{display:flex;gap:10px;align-items:center;flex:1;flex-wrap:wrap}
.hs{text-align:center}
.hs-v{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#00f5ff;text-shadow:0 0 8px rgba(0,245,255,0.5)}
.hs-l{font-size:7px;color:#475569;text-transform:uppercase;letter-spacing:.5px;font-family:'JetBrains Mono',monospace}
.dot{width:7px;height:7px;border-radius:50%;background:#00f5ff;box-shadow:0 0 10px #00f5ff,0 0 20px rgba(0,245,255,0.4);animation:pulse-c 2s ease-in-out infinite;flex-shrink:0}
.dot.off{background:#ef4444;box-shadow:0 0 8px #ef4444;animation:none}
.dot.y{background:#facc15;box-shadow:0 0 8px #facc15;animation:pulse-y 1s infinite}
@keyframes pulse-c{0%,100%{box-shadow:0 0 8px #00f5ff,0 0 16px rgba(0,245,255,0.3)}50%{box-shadow:0 0 18px #00f5ff,0 0 36px rgba(0,245,255,0.6)}}
@keyframes pulse-y{0%,100%{opacity:1}50%{opacity:.3}}
.mono{font-family:'JetBrains Mono',monospace;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
.tabs{display:flex;gap:2px;padding:5px 10px 0;background:rgba(1,3,8,0.97);border-bottom:1px solid rgba(0,245,255,0.08);overflow-x:auto}
.tab{padding:5px 12px;border-radius:5px 5px 0 0;cursor:pointer;font-size:10px;font-weight:700;color:#64748b;border:1px solid transparent;border-bottom:none;white-space:nowrap;transition:all .2s;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.5px}
.tab:hover{color:#38bdf8;border-color:rgba(56,189,248,0.15)}
.tab.on{background:rgba(0,245,255,0.04);color:#00f5ff;border-color:rgba(0,245,255,0.18);border-bottom-color:rgba(1,3,8,0.97);margin-bottom:-1px;text-shadow:0 0 10px rgba(0,245,255,0.5)}
.tbadge{background:rgba(0,245,255,0.04);color:#64748b;font-size:8px;padding:1px 5px;border-radius:6px;margin-left:4px;font-family:'JetBrains Mono',monospace}
.tab.on .tbadge{background:rgba(0,245,255,0.12);color:#38bdf8}
.tbadge.hot{background:rgba(0,245,255,0.18)!important;color:#00f5ff!important;box-shadow:0 0 8px rgba(0,245,255,0.3);animation:pulse-y 1s infinite}
.tbadge.danger{background:rgba(239,68,68,0.15)!important;color:#f87171!important}
.body{flex:1;overflow-y:auto;padding:8px 10px;position:relative;z-index:2}
.srow{display:flex;gap:5px;margin-bottom:9px;flex-wrap:wrap}
.sc{flex:1;min-width:62px;background:rgba(0,245,255,0.02);border:1px solid rgba(0,245,255,0.1);border-radius:8px;padding:6px 8px;backdrop-filter:blur(4px)}
.sc-v{font-size:19px;font-weight:700;font-family:'JetBrains Mono',monospace}
.sc-l{font-size:7px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-top:1px;font-family:'JetBrains Mono',monospace}
.sc.g .sc-v{color:#00f5ff;text-shadow:0 0 10px rgba(0,245,255,0.5)}.sc.b .sc-v{color:#a78bfa;text-shadow:0 0 10px rgba(167,139,250,0.4)}.sc.y .sc-v{color:#facc15}.sc.r .sc-v{color:#ef4444}.sc.w .sc-v{color:#38bdf8}
.fbar{display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;align-items:center}
.fbtn{padding:3px 9px;border-radius:4px;cursor:pointer;font-size:9px;font-weight:700;border:1px solid rgba(100,116,139,0.3);background:rgba(100,116,139,0.08);color:#94a3b8;transition:all .15s;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.4px}
.fbtn:hover{border-color:rgba(0,245,255,0.25);color:#38bdf8}
.fbtn.on{background:rgba(0,245,255,0.07);color:#00f5ff;border-color:rgba(0,245,255,0.28);text-shadow:0 0 8px rgba(0,245,255,0.4)}
.sep{width:1px;height:16px;background:rgba(0,245,255,0.08);margin:0 2px}
.tcards{display:flex;flex-direction:column;gap:5px}
.tcard{background:rgba(2,4,10,0.85);border:1px solid rgba(0,245,255,0.07);border-radius:10px;overflow:hidden;transition:border-color .2s,box-shadow .2s;backdrop-filter:blur(6px)}
.tcard:hover{border-color:rgba(0,245,255,0.18);box-shadow:0 0 24px rgba(0,245,255,0.05)}
.tcard.sS{border-left:2px solid #00f5ff;box-shadow:-3px 0 20px rgba(0,245,255,0.2)}
.tcard.sE{border-left:2px solid #a78bfa;box-shadow:-2px 0 12px rgba(167,139,250,0.15)}
.tcard.sW{border-left:2px solid #facc15}
.tcard.sR{border-left:2px solid #f97316}
.tcard.sX{border-left:2px solid #ef4444;opacity:.5}
.tcard.sK{border-left:2px solid #0d1f2d;opacity:.22}
.tcard.bl{filter:grayscale(1);opacity:.15}
.th{padding:8px 11px;cursor:pointer;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.sbadge{display:flex;align-items:center;gap:4px;padding:2px 8px;border-radius:5px;font-weight:800;font-size:10px;white-space:nowrap;flex-shrink:0;font-family:'JetBrains Mono',monospace;letter-spacing:.3px}
.tsym{font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;color:#c4d4f0;letter-spacing:.5px}
.tname{font-size:8px;color:#475569}
.tmeta{margin-left:auto;display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.tmc{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:800;color:#00f5ff;text-shadow:0 0 10px rgba(0,245,255,0.5)}
.tinfo{font-size:8px;color:#475569}
.chev{color:#475569;font-size:9px}
.tbody{padding:0 11px 11px;border-top:1px solid rgba(0,245,255,0.05)}
.age-f{color:#00f5ff;font-weight:700;font-family:'JetBrains Mono',monospace;font-size:11px;text-shadow:0 0 8px rgba(0,245,255,0.5)}
.age-o{color:#facc15;font-weight:700;font-family:'JetBrains Mono',monospace;font-size:11px}
.age-s{color:#ef4444;font-family:'JetBrains Mono',monospace;font-size:10px;opacity:.5}
.snpanel{background:rgba(0,0,0,0.6);border:1px solid rgba(0,245,255,0.07);border-radius:8px;padding:9px 11px;margin-top:9px;backdrop-filter:blur(8px)}
.snhead{display:flex;align-items:center;gap:12px;margin-bottom:8px;flex-wrap:wrap}
.snverdict{padding:4px 13px;border-radius:5px;font-weight:800;font-size:13px;border:2px solid;flex-shrink:0;font-family:'JetBrains Mono',monospace;letter-spacing:.5px}
.snflags{display:flex;flex-direction:column;gap:3px;margin-top:6px}
.sf{font-size:10px;padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace}
.sf.green{background:rgba(0,245,255,0.06);color:#4ade80;border-left:1px solid rgba(0,245,255,0.2)}
.sf.orange{background:rgba(249,115,22,0.07);color:#fb923c}
.sf.red{background:rgba(239,68,68,0.08);color:#f87171;border-left:1px solid rgba(239,68,68,0.3)}
.bsell-warn{background:rgba(127,29,29,0.6);border:1px solid rgba(248,113,113,0.3);border-radius:6px;padding:5px 9px;margin-top:5px;font-size:11px;color:#f87171;font-weight:700;font-family:'JetBrains Mono',monospace;display:flex;align-items:center;gap:5px}
.bl-badge{background:rgba(26,10,10,0.9);border:1px solid rgba(127,29,29,0.6);border-radius:4px;padding:1px 6px;font-size:8px;color:#ef4444;font-weight:700;text-transform:uppercase;letter-spacing:.3px;font-family:'JetBrains Mono',monospace}
.dev-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:6px;padding-top:6px;border-top:1px solid rgba(0,245,255,0.05);font-size:10px}
.mrow{display:flex;gap:4px;flex-wrap:wrap;margin-top:7px}
.met{background:rgba(0,0,0,0.5);border:1px solid rgba(0,245,255,0.07);border-radius:6px;padding:5px 9px;min-width:68px}
.met-v{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#00f5ff}
.met-l{font-size:7px;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-top:1px;font-family:'JetBrains Mono',monospace}
.ttbl{width:100%;border-collapse:collapse;margin-top:5px;font-size:10px}
.ttbl th{color:#475569;text-transform:uppercase;font-size:7px;letter-spacing:.5px;padding:3px 4px;text-align:left;border-bottom:1px solid rgba(0,245,255,0.05);font-family:'JetBrains Mono',monospace}
.ttbl td{padding:3px 4px;border-bottom:1px solid rgba(0,0,0,0.4);font-family:'JetBrains Mono',monospace}
.ttbl tr:last-child td{border-bottom:none}
.ttbl tr:hover td{background:rgba(0,245,255,0.03)}
.ttbl .br td{background:rgba(0,245,255,0.04)}
.buy{color:#00f5ff}.sell{color:#ef4444}.create{color:#a78bfa}.star{color:#fbbf24}
.addrl{font-family:'JetBrains Mono',monospace;font-size:9px;color:#475569}
.plink{display:inline-flex;align-items:center;gap:3px;background:rgba(0,245,255,0.07);color:#00f5ff;padding:3px 9px;border-radius:4px;font-size:10px;font-weight:700;text-decoration:none;margin-top:5px;border:1px solid rgba(0,245,255,0.2);font-family:'JetBrains Mono',monospace;transition:all .15s}
.plink:hover{background:rgba(0,245,255,0.14);box-shadow:0 0 12px rgba(0,245,255,0.15)}
.devdump{color:#ef4444;font-size:9px;font-weight:700;background:rgba(239,68,68,0.1);padding:2px 5px;border-radius:4px;animation:pulse-y .8s infinite;font-family:'JetBrains Mono',monospace}
.newbadge{background:rgba(0,245,255,0.12);color:#00f5ff;font-size:7px;padding:1px 4px;border-radius:3px;font-weight:700;margin-left:3px;vertical-align:middle;font-family:'JetBrains Mono',monospace}
.pill{padding:2px 6px;border-radius:4px;font-size:8px;font-weight:700;font-family:'JetBrains Mono',monospace}
.pill.g{background:rgba(0,245,255,0.1);color:#00f5ff;border:1px solid rgba(0,245,255,0.2)}.pill.r{background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2)}
.pill.b{background:rgba(167,139,250,0.1);color:#a78bfa;border:1px solid rgba(167,139,250,0.2)}.pill.o{background:rgba(249,115,22,0.1);color:#fb923c}
.vel-row{display:flex;align-items:center;gap:6px;margin-top:6px;padding:5px 8px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,245,255,0.06);border-radius:6px;flex-wrap:wrap}
.vel-bar-bg{height:3px;background:rgba(0,245,255,0.07);border-radius:2px;overflow:hidden;width:80px}
.vel-bar-fill{height:100%;border-radius:2px;transition:width .3s}
.adv-panel{margin-top:8px;background:rgba(0,0,0,0.45);border:1px solid rgba(0,245,255,0.06);border-radius:8px;padding:9px 11px}
.adv-title{font-size:7px;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px;color:#475569;font-family:'JetBrains Mono',monospace}
.sol-bar-row{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.sol-bar-bg{flex:1;height:4px;background:rgba(0,245,255,0.05);border-radius:2px;overflow:hidden;max-width:110px}
.sol-bar-fill{height:100%;border-radius:2px;transition:width .4s}
.hbox{background:rgba(0,0,0,0.5);border:1px solid rgba(0,245,255,0.07);border-radius:5px;padding:4px 7px;text-align:center;min-width:58px}
.hbox-v{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#00f5ff}
.hbox-l{font-size:7px;color:#475569;text-transform:uppercase;letter-spacing:.4px;margin-top:1px;font-family:'JetBrains Mono',monospace}
.sgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:6px}
.scard{background:rgba(2,4,10,0.85);border:1px solid rgba(0,245,255,0.07);border-radius:10px;padding:10px 12px;backdrop-filter:blur(4px)}
.scard.strong{border-left:2px solid #00f5ff;box-shadow:-2px 0 14px rgba(0,245,255,0.15)}.scard.medium{border-left:2px solid #a78bfa;box-shadow:-2px 0 10px rgba(167,139,250,0.12)}
.scard.selling{border-left:2px solid #ef4444}.scard.watch{border-left:2px solid #facc15}
.sfeed-row{display:flex;align-items:center;gap:7px;padding:5px 9px;border-bottom:1px solid rgba(0,245,255,0.04)}
.sfeed-row:last-child{border-bottom:none}.sfeed-row:hover{background:rgba(0,245,255,0.02)}
.dex-tag{font-size:7px;padding:1px 5px;border-radius:3px;font-weight:700;background:rgba(167,139,250,0.1);color:#a78bfa;font-family:'JetBrains Mono',monospace;border:1px solid rgba(167,139,250,0.2)}
.loading-dots::after{content:'...';animation:ldots 1s infinite}
@keyframes ldots{0%{content:'.'}33%{content:'..'}66%{content:'...'}}
.ffilters{display:flex;gap:4px;margin-bottom:7px;flex-wrap:wrap}
.alerts{position:fixed;top:60px;right:10px;z-index:300;display:flex;flex-direction:column;gap:5px;pointer-events:none}
.alert-pop{background:rgba(2,4,14,0.96);border:1px solid;border-radius:8px;padding:8px 12px;min-width:220px;max-width:290px;pointer-events:all;animation:popIn .2s ease;box-shadow:0 8px 32px rgba(0,0,0,0.9),0 0 24px rgba(0,245,255,0.08);backdrop-filter:blur(14px)}
@keyframes popIn{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}
.alert-title{font-weight:700;font-size:10px;margin-bottom:2px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.4px}
.alert-body{font-size:10px;color:#94a3b8}
.alert-x{float:right;cursor:pointer;color:#475569;font-size:12px;margin-left:5px}
.helius-input{background:rgba(0,0,0,0.7);border:1px solid rgba(0,245,255,0.18);border-radius:5px;padding:4px 10px;font-size:11px;color:#c4d4f0;font-family:'JetBrains Mono',monospace;width:260px;outline:none;transition:all .2s}
.helius-input:focus{border-color:rgba(0,245,255,0.45);box-shadow:0 0 12px rgba(0,245,255,0.1)}
.helius-btn{background:rgba(0,245,255,0.08);color:#00f5ff;border:1px solid rgba(0,245,255,0.3);border-radius:5px;padding:4px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.5px;transition:all .15s}
.helius-btn:hover{background:rgba(0,245,255,0.16);box-shadow:0 0 12px rgba(0,245,255,0.2)}
.empty{text-align:center;padding:32px 16px;color:#475569;border:1px dashed rgba(0,245,255,0.07);border-radius:10px;margin-top:7px}
.empty-icon{font-size:26px;margin-bottom:5px}.empty-t{font-size:11px;font-family:'JetBrains Mono',monospace}
.ftr{padding:4px 12px;border-top:1px solid rgba(0,245,255,0.06);background:rgba(1,3,8,0.95);display:flex;align-items:center;gap:7px;font-size:9px;color:#475569;flex-wrap:wrap;font-family:'JetBrains Mono',monospace}
.div{height:1px;background:rgba(0,245,255,0.06);margin:7px 0}
.bl-table{width:100%;border-collapse:collapse;font-size:11px}
.bl-table th{color:#475569;font-size:7px;text-transform:uppercase;letter-spacing:.5px;padding:3px 5px;text-align:left;border-bottom:1px solid rgba(0,245,255,0.06);font-family:'JetBrains Mono',monospace}
.bl-table td{padding:4px 5px;border-bottom:1px solid rgba(0,0,0,0.35);font-family:'JetBrains Mono',monospace}
.bl-table tr:hover td{background:rgba(239,68,68,0.04)}
.copy-btn{background:transparent;border:1px solid rgba(0,245,255,0.18);border-radius:4px;padding:2px 7px;cursor:pointer;color:#38bdf8;font-size:8px;font-weight:700;font-family:'JetBrains Mono',monospace;transition:all .15s;flex-shrink:0}
.copy-btn:hover{background:rgba(0,245,255,0.08);box-shadow:0 0 8px rgba(0,245,255,0.2)}
.copy-btn.copied{background:rgba(0,245,255,0.12);border-color:rgba(0,245,255,0.4);color:#00f5ff}
@media(max-width:480px){.hdr{padding:6px 8px}.body{padding:7px 7px}.sgrid{grid-template-columns:1fr}}
/* ── Neural Dashboard ── */
.neural-db{display:flex;flex-direction:column;gap:8px;height:calc(100vh - 115px);min-height:560px}
.neural-canvas-wrap{background:rgba(0,0,0,0.92);border:1px solid rgba(0,245,255,0.15);border-radius:12px;overflow:hidden;flex:0 0 auto;box-shadow:0 0 40px rgba(0,245,255,0.04),inset 0 0 80px rgba(0,0,0,0.5)}
.neural-ch{display:flex;align-items:center;gap:10px;padding:6px 14px;background:rgba(0,0,0,0.8);border-bottom:1px solid rgba(0,245,255,0.1)}
.neural-ch-title{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:#00f5ff;letter-spacing:2px;text-transform:uppercase;text-shadow:0 0 12px rgba(0,245,255,0.5)}
.neural-panels{display:grid;grid-template-columns:2fr 2fr 1.4fr;gap:8px;flex:1;min-height:0;overflow:hidden}
.neural-zero-panel,.neural-live-panel,.neural-sw-panel{background:rgba(1,3,8,0.94);border:1px solid rgba(0,245,255,0.09);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;backdrop-filter:blur(8px)}
.neural-zero-panel{border-color:rgba(139,92,246,0.2);box-shadow:0 0 24px rgba(139,92,246,0.05)}
.nzero-hdr{padding:6px 12px;border-bottom:1px solid rgba(139,92,246,0.15);display:flex;align-items:center;gap:8px;font-size:10px;font-weight:700;color:#a78bfa;flex-shrink:0;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.5px}
.nzero-wave{display:flex;align-items:flex-end;gap:1.5px;height:38px;padding:4px 12px 4px;background:rgba(0,0,0,0.5);flex-shrink:0;border-bottom:1px solid rgba(139,92,246,0.08)}
.nzero-bar{width:3px;background:linear-gradient(180deg,#c4b5fd,#7c3aed);border-radius:2px;animation:nwave 0.7s ease-in-out infinite;min-height:2px;box-shadow:0 0 5px rgba(139,92,246,0.6)}
@keyframes nwave{0%,100%{height:2px;opacity:.15}50%{height:26px;opacity:1}}
.nzero-text{padding:10px 12px;font-size:11px;color:#c4d4f0;font-style:italic;line-height:1.75;flex:1;overflow-y:auto;border-left:2px solid rgba(139,92,246,0.3)}
.nzero-hist-list{flex-shrink:0;max-height:80px;overflow-y:auto;border-top:1px solid rgba(139,92,246,0.1)}
.nzero-hist{padding:3px 12px;font-size:8px;color:#475569;border-bottom:1px solid rgba(0,0,0,0.4);line-height:1.5;font-family:'JetBrains Mono',monospace}
.nlive-hdr{padding:6px 12px;border-bottom:1px solid rgba(0,245,255,0.08);font-size:9px;font-weight:700;color:#38bdf8;display:flex;align-items:center;gap:6px;flex-shrink:0;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.5px}
.nlive-events{overflow-y:auto;flex:1}
.nlive-row{display:flex;align-items:center;gap:5px;padding:3px 10px;border-bottom:1px solid rgba(0,0,0,0.4);font-size:9px;font-family:'JetBrains Mono',monospace;transition:background .1s}
.nlive-row:hover{background:rgba(0,245,255,0.03)}
.nlive-sym{font-weight:700;color:#c4d4f0;min-width:46px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nlive-mc{margin-left:auto;color:#38bdf8;white-space:nowrap;font-weight:600}
.wake-dot{width:6px;height:6px;border-radius:50%;background:#f97316;box-shadow:0 0 8px #f97316;animation:pulse-y .6s infinite;flex-shrink:0}
`;


// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Monitor(){
  const [,bump]=useState(0);
  const [tab,setTab]=useState("snipe");
  const [open,setOpen]=useState({});
  const [alerts,setAlerts]=useState([]);
  const [feedFilter,setFeedFilter]=useState([]);
  const [smartOnly,setSmartOnly]=useState(false);
  const [minScore,setMinScore]=useState(0);
  const [hideOld,setHideOld]=useState(true);
  const [showBL,setShowBL]=useState(false);
  const [heliusKey,setHeliusKey]=useState(import.meta.env.VITE_HELIUS_KEY||"");
  const [heliusActive,setHeliusActive]=useState(false);
  const [voiceOn,setVoiceOn]=useState(true);
  const [aiAgentOn,setAiAgentOn]=useState(true);
  const [showAiLog,setShowAiLog]=useState(false);
  const [neuralSelected,setNeuralSelected]=useState(null);
  const [ptt,setPtt]=useState({active:false,status:"idle",transcript:""}); // push-to-talk state
  const pttRecRef=useRef(null);
  const [showTextInput,setShowTextInput]=useState(false);
  const [textQuestion,setTextQuestion]=useState("");
  const prevTokLen=useRef(0);
  const prevSmartLen=useRef(0);

  useEffect(()=>{
    const fn=()=>bump(n=>n+1);
    G.listeners.add(fn);
    startWs();
    // Auto-attiva Helius se la chiave è già presente nell'env
    const envKey = import.meta.env.VITE_HELIUS_KEY;
    if(envKey && !heliusActive){
      HELIUS_KEY = envKey;
      rpcIdx = 0;
      startSmartWs(envKey);
      setHeliusActive(true);
    }
    // Voce e agente sempre attivi all'avvio
    voiceState.enabled = true;
    aiAgentState.enabled = true;
    G.listeners.delete(fn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{const id=setInterval(()=>bump(n=>n+1),5000);return()=>clearInterval(id);},[]);

  useEffect(()=>{
    const n=G.tokens.length;
    if(n>prevTokLen.current){
      const tok=G.tokens[0];
      if(tok&&!isDevBad(tok.dev)){
        const md=getMintData(tok.mint);
        const ss=calcSnipeScore(tok,md);
        if(ss.score>=55){
          const id=Date.now();
          setAlerts(a=>[{id,tok,ss},...a].slice(0,5));
          setTimeout(()=>setAlerts(a=>a.filter(x=>x.id!==id)),12000);
          // Voce proattiva sul nuovo token hot
          const nome=tok.symbol||tok.name||"token sconosciuto";
          if(ss.score>=70){
            speak(`SNIPE! ${nome}. Score ${Math.round(ss.score)}, MCap ${fmc(tok.mc)}, bonding ${tok.bonding} percento.`);
          } else {
            speak(`Nuovo token interessante: ${nome}. Score ${Math.round(ss.score)}, MCap ${fmc(tok.mc)}.`);
          }
        }
      }
    }
    prevTokLen.current=n;
  });

  useEffect(()=>{
    const n=G.smartEvents.length;
    if(n>prevSmartLen.current){
      const ev=G.smartEvents[0];
      if(ev&&ev.action==="buy"){
        const id=Date.now()+1;
        setAlerts(a=>[{id,smart:ev},...a].slice(0,5));
        setTimeout(()=>setAlerts(a=>a.filter(x=>x.id!==id)),8000);
        // Voce proattiva smart wallet
        const nome=(ev as any).symbol||(ev.mint?ev.mint.slice(0,6):"token");
        const wallet=SMART_SHORT[ev.wallet]||"Smart wallet";
        speak(`${wallet} compra ${nome}, ${fSol(ev.sol)} sol.`);
      }
    }
    prevSmartLen.current=n;
  });

  const toggle=id=>setOpen(o=>({...o,[id]:!o[id]}));

  const toggleVoice=()=>{
    const next=!voiceOn;
    setVoiceOn(next);
    voiceState.enabled=next;
    if(next){
      voiceState.queue=[];
      speak("Voce attivata. Ti avviso quando succede qualcosa di importante.");
    }else{
      voiceState.queue=[];
      if(typeof window!=="undefined"&&window.speechSynthesis) window.speechSynthesis.cancel();
    }
  };

  const toggleAiAgent=()=>{
    const next=!aiAgentOn;
    setAiAgentOn(next);
    aiAgentState.enabled=next;
    if(next&&!voiceOn){
      setVoiceOn(true);
      voiceState.enabled=true;
    }
    if(next){ speak("Udini attivato. Ti aggiorno ogni trenta secondi sul mercato."); }
  };

  // Loop AI agent: ogni 30s chiama Pollinations per il recap parlato
  useEffect(()=>{
    if(!aiAgentOn) return;
    const id=setInterval(()=>{
      if(voiceState.pttActive) return; // non parlare mentre l'utente sta registrando una domanda
      const snap=G.tokens.map(tok=>{
        const md=getMintData(tok.mint);
        const ss=calcSnipeScore(tok,md);
        const pump=calcPumpTrend(tok.mint);
        const multi=calcMultiplier(tok.mint,tok.mc);
        return {tok,ss,pump,multi};
      }).sort((a,b)=>b.ss.score-a.ss.score);
      runAiRecap(snap, undefined);
    },30000);
    const first=setTimeout(()=>{
      if(voiceState.pttActive) return;
      const snap=G.tokens.map(tok=>{
        const md=getMintData(tok.mint);
        const ss=calcSnipeScore(tok,md);
        const pump=calcPumpTrend(tok.mint);
        const multi=calcMultiplier(tok.mint,tok.mc);
        return {tok,ss,pump,multi};
      }).sort((a,b)=>b.ss.score-a.ss.score);
      runAiRecap(snap, undefined);
    },3000);
    return ()=>{ clearInterval(id); clearTimeout(first); };
  },[aiAgentOn]);

  // ── PUSH-TO-TALK "UDINI" ─────────────────────────────────────────────────
  // L'ascolto continuo in background (wake word) e' inaffidabile o assente su
  // iOS/Safari dentro webview, perche' richiede un'interazione touch diretta
  // per concedere il microfono. Push-to-talk risolve: il tasto stesso E'
  // l'interazione che sblocca il microfono, quindi funziona anche su iPhone.
  function buildSnapshot(){
    return G.tokens.map(tok=>{
      const md=getMintData(tok.mint);
      const ss=calcSnipeScore(tok,md);
      const pump=calcPumpTrend(tok.mint);
      const multi=calcMultiplier(tok.mint,tok.mc);
      return {tok,ss,pump,multi};
    }).sort((a,b)=>b.ss.score-a.ss.score);
  }

  function startPushToTalk(){
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!SR){
      // Niente riconoscimento vocale disponibile su questo device/browser:
      // passa subito alla modalita' testuale invece di restare bloccato in silenzio.
      setShowTextInput(true);
      setPtt({active:false,status:"unsupported",transcript:""});
      return;
    }
    try{
      if(window.speechSynthesis) window.speechSynthesis.cancel(); // interrompe subito UDINI se stava parlando
      voiceState.speaking=false;
      voiceState.pttActive=true; // blocca il loop automatico finché non rilasci il tasto
      const rec=new SR();
      pttRecRef.current=rec;
      rec.lang="it-IT"; rec.continuous=false; rec.interimResults=true;
      let finalTranscript="";
      setPtt({active:true,status:"listening",transcript:""});
      rec.onresult=(ev:any)=>{
        let interim="";
        for(let i=ev.resultIndex;i<ev.results.length;i++){
          const t=ev.results[i][0].transcript;
          if(ev.results[i].isFinal) finalTranscript+=t; else interim+=t;
        }
        setPtt(p=>({...p,transcript:finalTranscript||interim}));
      };
      rec.onerror=(e:any)=>{
        voiceState.pttActive=false;
        setPtt({active:false,status:"error",transcript:""});
        if(e?.error==="not-allowed"||e?.error==="service-not-allowed"){
          // Permesso negato o non disponibile: offri input testuale come alternativa
          setShowTextInput(true);
        }
      };
      rec.onend=()=>{
        voiceState.pttActive=false; // libera il loop automatico, la registrazione e' finita
        const q=(finalTranscript||"").trim();
        if(q){
          setPtt({active:false,status:"thinking",transcript:q});
          runAiRecap(buildSnapshot(), q).finally(()=>{
            setPtt({active:false,status:"idle",transcript:""});
          });
        }else{
          setPtt({active:false,status:"idle",transcript:""});
        }
        pttRecRef.current=null;
      };
      rec.start();
    }catch{
      voiceState.pttActive=false;
      setShowTextInput(true);
      setPtt({active:false,status:"error",transcript:""});
    }
  }

  function stopPushToTalk(){
    try{ if(pttRecRef.current) pttRecRef.current.stop(); }catch{}
  }

  function askUdiniText(){
    const q=textQuestion.trim();
    if(!q) return;
    setTextQuestion("");
    setPtt({active:false,status:"thinking",transcript:q});
    runAiRecap(buildSnapshot(), q).finally(()=>{
      setPtt({active:false,status:"idle",transcript:""});
    });
  }

  const activateHelius=()=>{
    if(!heliusKey.trim()) return;
    HELIUS_KEY = heliusKey.trim();
    rpcIdx = 0;
    startSmartWs(heliusKey.trim());
    setHeliusActive(true);
  };

  const scored=G.tokens.map(tok=>{
    const md=getMintData(tok.mint);
    const ss=calcSnipeScore(tok,md);
    const vel=calcVelocity(md,tok.ts);
    const ageSec=(Date.now()-tok.ts)/1000;
    const devBad=isDevBad(tok.dev);
    const pump=calcPumpTrend(tok.mint);
    const multi=calcMultiplier(tok.mint, tok.mc);
    return {tok,md,ss,vel,ageSec,devBad,pump,multi};
  }).sort((a,b)=>{
    if(a.devBad!==b.devBad) return a.devBad?1:-1;
    return b.ss.score-a.ss.score||a.ageSec-b.ageSec;
  });

  const filtered=scored.filter(({ss,ageSec,devBad})=>{
    if(!showBL&&devBad) return false;
    if(hideOld&&ageSec>300) return false;
    if(minScore>0&&ss.score<minScore) return false;
    return true;
  });

  const snipeCount=scored.filter(x=>x.ss.score>=55&&!x.devBad).length;
  const blCount=[...devBlacklist.keys()].length;
  const hotCount=scored.filter(x=>x.ss.score>=75&&!x.devBad&&x.ageSec<60).length;
  const winners=scored.filter(x=>x.multi.mult>=5).sort((a,b)=>b.multi.mult-a.multi.mult);
  const winnersCount=winners.length;
  const x10Count=scored.filter(x=>x.multi.mult>=10).length;

  const walletSummaries=SMART_WALLETS.map(wallet=>{
    const port=walletPortfolio.get(wallet);
    const holdings=port?[...port.entries()].map(([mint,p])=>{
      const liveTok=G.tokens.find(t=>t.mint===mint);
      const mcNow=liveTok?liveTok.mc:p.mcEntry;
      const mult=p.mcEntry>0?mcNow/p.mcEntry:1;
      const othersIn=countOtherSmartBuyers(mint,wallet);
      return {mint,symbol:p.symbol,mcEntry:p.mcEntry,mcNow,mult:+mult.toFixed(2),
        sold:p.sold,ts:p.ts,soldTs:p.soldTs,othersIn,
        holdTimeSec:p.sold?(p.soldTs-p.ts)/1000:(Date.now()-p.ts)/1000};
    }).sort((a,b)=>b.ts-a.ts):[];
    const totalBuys=holdings.length;
    const totalSold=holdings.filter(h=>h.sold).length;
    const totalHeld=totalBuys-totalSold;
    const bestMult=holdings.length?Math.max(...holdings.map(h=>h.mult)):0;
    return {wallet,short:SMART_SHORT[wallet],holdings,totalBuys,totalSold,totalHeld,bestMult};
  }).sort((a,b)=>b.totalBuys-a.totalBuys);

  const swByMint: Record<string,any> = {};
  for(const ev of G.smartEvents){
    if(!swByMint[ev.mint]) swByMint[ev.mint]={buys:[],sells:[],symbol:ev.symbol,mc:ev.mc};
    if(ev.action==="buy") swByMint[ev.mint].buys.push(ev);
    else swByMint[ev.mint].sells.push(ev);
    if(!ev.loading){swByMint[ev.mint].symbol=ev.symbol;swByMint[ev.mint].mc=ev.mc;}
  }
  const swConvs=Object.entries(swByMint).map(([mint,d])=>{
    const nBuy=new Set(d.buys.map(e=>e.wallet)).size,nSell=new Set(d.sells.map(e=>e.wallet)).size;
    let cls="watch",sig="1 WALLET",emoji="👀";
    if(nSell>=2){cls="selling";sig="SMART SELLING";emoji="🔴";}
    else if(nBuy>=3){cls="strong";sig="CONVOY 3+";emoji="🔥";}
    else if(nBuy>=2){cls="medium";sig="2 SMART IN";emoji="⚡";}
    const allEvs=[...d.buys,...d.sells].sort((a,b)=>b.ts-a.ts);
    return {mint,symbol:d.symbol,nBuy,nSell,cls,sig,emoji,
      solIn:d.buys.reduce((s,e)=>s+(e.sol||0),0),mc:d.mc,last:allEvs[0]?.ts||0,events:allEvs.slice(0,8)};
  }).sort((a,b)=>(b.nBuy*3-b.nSell*5)-(a.nBuy*3-a.nSell*5));

  let feed=G.events;
  if(feedFilter.length) feed=feed.filter(e=>feedFilter.includes(e.action));
  if(smartOnly) feed=feed.filter(e=>SMART_SET.has(e.wallet));
  feed=feed.slice(0,200);

  const vcls=v=>v==="SNIPE IT"?"sS":v==="ENTRA"?"sE":v==="WATCH"?"sW":v==="RISCHIO"?"sR":v==="SKIP"?"sK":"sX";
  const acls=s=>s<60?"age-f":s<180?"age-o":"age-s";

  return(
    <>
      <style>{css}</style>
      <div className="app">

        {/* Alerts */}
        <div className="alerts">
          {alerts.map(a=>a.smart?(
            <div key={a.id} className="alert-pop" style={{borderColor:"#4ade80"}}>
              <span className="alert-x" onClick={()=>setAlerts(x=>x.filter(y=>y.id!==a.id))}>x</span>
              <div className="alert-title" style={{color:"#4ade80"}}>SMART {a.smart.action.toUpperCase()} — {a.smart.dex||"DEX"}</div>
              <div className="alert-body">
                <b>{SMART_SHORT[a.smart.wallet]||short(a.smart.wallet)}</b>
                {" > "}{a.smart.loading?<span className="loading-dots"/>:<b>{a.smart.symbol}</b>}
                {" "}{fSol(a.smart.sol)}{" "}{fmc(a.smart.mc)}
              </div>
            </div>
          ):a.tok?(
            <div key={a.id} className="alert-pop" style={{borderColor:a.ss.rColor}}>
              <span className="alert-x" onClick={()=>setAlerts(x=>x.filter(y=>y.id!==a.id))}>x</span>
              <div className="alert-title" style={{color:a.ss.rColor}}>
                {a.ss.vemoji} {a.ss.verdict} — {a.tok.symbol}
                <span style={{fontFamily:"'JetBrains Mono',monospace",marginLeft:8}}>{a.ss.rating.toFixed(1)}/10 {a.ss.rLabel}</span>
              </div>
              <div className="alert-body">
                Bundle {a.tok.pctW}% · {a.tok.bSlots}sl · {fmc(a.tok.mc)} · {fAgeShort(a.tok.ts)} fa
              </div>
            </div>
          ):null)}
        </div>

        {/* Header */}
        <div className="hdr">
          <div className="logo">UDINIX <em>SENTINEL</em></div>
          <div className="hstats">
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div className={`dot${G.connected?"":G.reconnecting?" y":" off"}`}/>
              <span className="mono">{G.connected?"PUMP LIVE":"OFF"}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <div className={`dot${G.smartConnected?"":G.smartReconnecting?" y":" off"}`}/>
              <span className="mono">{G.smartConnected?"SMART LIVE":heliusActive?"RETRY...":"NO HELIUS"}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5,padding:"3px 9px",background:"rgba(139,92,246,0.08)",border:"1px solid rgba(139,92,246,0.25)",borderRadius:4}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:aiAgentOn?"#a78bfa":"#475569",boxShadow:aiAgentOn?"0 0 8px #a78bfa":"none",animation:aiAgentOn?"pulse-c 1.5s infinite":"none"}}/>
              <span style={{fontSize:9,fontWeight:700,color:aiAgentOn?"#a78bfa":"#475569",fontFamily:"'JetBrains Mono',monospace",letterSpacing:.5}}>UDINI AI</span>
            </div>
            <button onClick={toggleVoice} style={{display:"flex",alignItems:"center",gap:4,background:voiceOn?"rgba(0,245,255,0.12)":"rgba(100,116,139,0.1)",border:`1px solid ${voiceOn?"rgba(0,245,255,0.5)":"rgba(100,116,139,0.4)"}`,borderRadius:4,padding:"3px 9px",cursor:"pointer",color:voiceOn?"#00f5ff":"#94a3b8",fontSize:9,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",letterSpacing:.5,textTransform:"uppercase"}}>
              {voiceOn?"🔊 VOX":"🔇 MUTE"}
            </button>
            {[
              {v:G.msgCount.toLocaleString(),l:"Logs"},
              {v:G.txParsed,l:"Parsed"},
              {v:G.txFailed,l:"Fail",r:G.txFailed>5},
              {v:G.parseQueue.length+activeJobs,l:"Queue"},
              {v:snipeCount,l:"Hot",g:true},
              {v:blCount,l:"Ban",r:blCount>0},
            ].map(s=>(
              <div key={s.l} className="hs">
                <div className="hs-v" style={s.r?{color:"#ef4444"}:s.g?{color:"#22c55e"}:{}}>{s.v}</div>
                <div className="hs-l">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {[
            {id:"neural", label:"NEURAL",    badge:scored.length},
            {id:"snipe",  label:"SNIPE",     badge:filtered.length,      hot:hotCount>0},
            {id:"winners",label:"WINNERS",   badge:winnersCount,         hot:winnersCount>0},
            {id:"wallets",label:"WALLETS",   badge:SMART_WALLETS.length},
            {id:"smart",  label:"SMART",     badge:G.smartEvents.length, hot:swConvs.some(x=>x.nBuy>=2)},
            {id:"feed",   label:"FEED",      badge:G.events.length},
            {id:"bl",     label:"BLACKLIST", badge:blCount,              danger:blCount>0},
            {id:"setup",  label:"SETUP",     badge:null},
          ].map(t=>(
            <div key={t.id} className={`tab${tab===t.id?" on":""}`} onClick={()=>setTab(t.id)}>
              {t.label}{t.badge!==null&&<span className={`tbadge${t.hot?" hot":""}${t.danger?" danger":""}`}>{t.badge}</span>}
            </div>
          ))}
        </div>

        <div className="body">

          {/* NEURAL TAB — dashboard completa */}
          {tab==="neural"&&(
            <div className="neural-db">

              {/* Neural canvas full width */}
              <div className="neural-canvas-wrap">
                <div className="neural-ch">
                  <span className="neural-ch-title">🧠 NEURAL MAP</span>
                  <span style={{fontSize:9,color:"#475569"}}>nodi = token · dimensione = score · colore = trend · click per dettagli</span>
                  <span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
                    {!voiceOn&&<span style={{fontSize:9,color:"#f97316"}}>⚠ Attiva voce per Zero</span>}
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"#38bdf8",fontWeight:700}}>{scored.length} LIVE</span>
                  </span>
                </div>
                <NeuralView scored={scored} onSelect={setNeuralSelected}/>
              </div>

              {/* Token detail panel when selected */}
              {neuralSelected&&(()=>{
                const found=scored.find(s=>s.tok.mint===neuralSelected);
                if(!found) return null;
                const {tok,ss,pump,multi}=found;
                return(
                  <div style={{background:"#070916",border:`2px solid ${ss.vcolor}44`,borderRadius:10,padding:"10px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                      <span className="tsym" style={{fontSize:18}}>{tok.symbol}</span>
                      <span style={{fontSize:11,color:"#64748b"}}>{tok.name}</span>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:16,fontWeight:800,color:"#38bdf8"}}>{fmc(tok.mc)}</span>
                      <span style={{background:ss.vcolor+"18",border:`1px solid ${ss.vcolor}55`,color:ss.vcolor,borderRadius:5,padding:"2px 8px",fontWeight:700,fontSize:11}}>{ss.vemoji} {ss.verdict}</span>
                      {multi.label&&<span style={{background:multi.color+"22",border:`1px solid ${multi.color}`,color:multi.color,borderRadius:5,padding:"2px 8px",fontWeight:800,fontSize:12}}>{multi.label}</span>}
                      <span style={{fontSize:9,fontWeight:700,color:pump.color,background:pump.color+"18",padding:"2px 6px",borderRadius:4}}>{pump.label}</span>
                      <CopyBtn text={tok.mint}/>
                      <button onClick={()=>setNeuralSelected(null)} style={{marginLeft:"auto",background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16}}>✕</button>
                    </div>
                    <div style={{display:"flex",gap:14,fontSize:11,flexWrap:"wrap",marginTop:7}}>
                      <span style={{color:"#64748b"}}>Bundle: <b style={{color:"#38bdf8",fontFamily:"'JetBrains Mono',monospace"}}>{tok.pctW}%</b></span>
                      <span style={{color:"#64748b"}}>Bonding: <b style={{color:"#38bdf8",fontFamily:"'JetBrains Mono',monospace"}}>{tok.bonding}%</b></span>
                      <span style={{color:"#64748b"}}>Score: <b style={{color:ss.rColor,fontFamily:"'JetBrains Mono',monospace"}}>{ss.rating.toFixed(1)}/10</b></span>
                      <span style={{color:"#64748b"}}>Smart IN: <b style={{color:"#4ade80",fontFamily:"'JetBrains Mono',monospace"}}>{tok.swBuy}</b></span>
                    </div>
                  </div>
                );
              })()}

              {/* Bottom panels — Zero AI + Live Stream + Smart Signals */}
              <div className="neural-panels">

                {/* UDINI AI panel */}
                <div className="neural-zero-panel">
                  <div className="nzero-hdr">
                    <span>🤖 UDINI</span>
                    <span style={{width:6,height:6,borderRadius:"50%",background:"#a78bfa",boxShadow:"0 0 8px #a78bfa",display:"inline-block",animation:"pulse-c 1.5s infinite",flexShrink:0}}/>
                    {(aiAgentOn&&aiAgentState.running)||ptt.status==="thinking"?<span style={{fontSize:8,color:"#facc15"}}>{ptt.status==="thinking"?"penso":"analizzando"}<span className="loading-dots"/></span>:null}
                    <span style={{marginLeft:"auto",fontSize:8,color:"#a78bfa",fontFamily:"'JetBrains Mono',monospace"}}>{voiceOn?"🔊 voce attiva":"VOX OFF"}</span>
                  </div>

                  {/* Push-to-talk button */}
                  <div style={{display:"flex",gap:6,alignItems:"center",margin:"8px 0"}}>
                    <button
                      onMouseDown={startPushToTalk} onMouseUp={stopPushToTalk} onMouseLeave={stopPushToTalk}
                      onTouchStart={(e)=>{e.preventDefault();startPushToTalk();}} onTouchEnd={(e)=>{e.preventDefault();stopPushToTalk();}}
                      style={{
                        flex:1, padding:"10px 14px", borderRadius:9, border:`1px solid ${ptt.active?"#a78bfa":"#2a2a45"}`,
                        background:ptt.active?"#a78bfa22":"#0d0d1a", color:ptt.active?"#c4b5fd":"#94a3b8",
                        fontSize:11, fontWeight:700, cursor:"pointer", userSelect:"none", WebkitUserSelect:"none",
                        transition:"all .15s", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                      }}>
                      {ptt.active?"🎙 ASCOLTO... rilascia per inviare":ptt.status==="thinking"?"🤔 Udini sta pensando...":"🎙 TIENI PREMUTO E PARLA"}
                    </button>
                    <button onClick={()=>setShowTextInput(v=>!v)} style={{padding:"10px 12px",borderRadius:9,border:"1px solid #2a2a45",background:"#0d0d1a",color:"#64748b",fontSize:11,cursor:"pointer"}}>⌨️</button>
                  </div>
                  {ptt.transcript&&ptt.active&&(
                    <div style={{fontSize:10,color:"#a78bfa",fontStyle:"italic",margin:"0 0 6px",padding:"4px 8px",background:"#a78bfa11",borderRadius:6}}>
                      "{ptt.transcript}"
                    </div>
                  )}
                  {ptt.status==="unsupported"&&(
                    <div style={{fontSize:10,color:"#fb923c",margin:"0 0 6px"}}>
                      Microfono non disponibile su questo browser — usa la chat scritta qui sotto.
                    </div>
                  )}
                  {showTextInput&&(
                    <div style={{display:"flex",gap:6,margin:"0 0 8px"}}>
                      <input
                        value={textQuestion} onChange={e=>setTextQuestion(e.target.value)}
                        onKeyDown={e=>{if(e.key==="Enter") askUdiniText();}}
                        placeholder="Scrivi a Udini: dove entro? devo uscire da X?"
                        style={{flex:1,padding:"8px 10px",borderRadius:7,border:"1px solid #2a2a45",background:"#0a0a14",color:"#e2e8f0",fontSize:11,outline:"none"}}
                      />
                      <button onClick={askUdiniText} style={{padding:"8px 14px",borderRadius:7,border:"1px solid #a78bfa55",background:"#a78bfa22",color:"#c4b5fd",fontSize:11,fontWeight:700,cursor:"pointer"}}>Invia</button>
                    </div>
                  )}

                  <div className="nzero-wave">
                    {[...Array(20)].map((_,i)=>(
                      <div key={i} className="nzero-bar" style={{animationDelay:`${i*0.06}s`,animationPlayState:aiAgentOn?"running":"paused",height:aiAgentOn?undefined:"2px",opacity:aiAgentOn?undefined:0.15}}/>
                    ))}
                  </div>
                  <div className="nzero-text">
                    {aiAgentState.lastText
                      ? <span>"{aiAgentState.lastText}"</span>
                      : <span style={{color:"#1e3a5f",fontStyle:"normal",fontSize:11}}>
                          Tieni premuto il tasto sopra e fai una domanda a voce · oppure usa la chat scritta · analisi automatica ogni 30s
                        </span>
                    }
                  </div>
                  {aiAgentState.history.length>0&&(
                    <div className="nzero-hist-list">
                      {aiAgentState.history.slice(0,4).map((h,i)=>(
                        <div key={i} className="nzero-hist">
                          <span style={{color:"#334155"}}>{new Date(h.ts).toLocaleTimeString()} </span>
                          {h.question&&<span style={{color:"#a78bfa"}}>[{h.question.slice(0,30)}] </span>}
                          {h.text.slice(0,110)}{h.text.length>110?"…":""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Live events stream */}
                <div className="neural-live-panel">
                  <div className="nlive-hdr">
                    ⚡ LIVE STREAM
                    <span style={{fontFamily:"'JetBrains Mono',monospace",color:"#38bdf8",fontSize:11}}>{G.msgCount.toLocaleString()}</span>
                    <span style={{marginLeft:"auto",fontSize:8,color:"#475569"}}>eventi pump.fun</span>
                  </div>
                  <div className="nlive-events">
                    {G.events.slice(0,60).map((ev,i)=>(
                      <div key={i} className="nlive-row">
                        <span className={ev.action} style={{width:12,textAlign:"center",flexShrink:0}}>{ev.action==="buy"?"▲":ev.action==="sell"?"▼":"✦"}</span>
                        <span className="nlive-sym">{(ev as any).symbol||short(ev.mint)}</span>
                        <span style={{color:"#64748b"}}>{fSol(ev.sol)}</span>
                        {SMART_SET.has(ev.wallet)&&<span className="pill g" style={{fontSize:7,padding:"1px 3px",flexShrink:0}}>SW</span>}
                        <span className="nlive-mc">{(ev as any).mc>0?fmc((ev as any).mc):""}</span>
                      </div>
                    ))}
                    {G.events.length===0&&<div style={{padding:"20px",fontSize:10,color:"#334155",textAlign:"center"}}>In attesa eventi pump.fun...</div>}
                  </div>
                </div>

                {/* Smart wallet signals */}
                <div className="neural-sw-panel">
                  <div className="nlive-hdr">
                    🎯 SMART SIGNALS
                    <span style={{marginLeft:"auto",fontFamily:"'JetBrains Mono',monospace",color:G.smartConnected?"#4ade80":"#ef4444",fontSize:9}}>{G.smartConnected?"LIVE":"OFF"}</span>
                  </div>
                  <div className="nlive-events">
                    {G.smartEvents.slice(0,40).map((ev,i)=>(
                      <div key={i} className="nlive-row">
                        <span className={ev.action} style={{width:12,textAlign:"center",flexShrink:0}}>{ev.action==="buy"?"▲":"▼"}</span>
                        <span style={{fontSize:8,color:"#64748b",flexShrink:0,minWidth:40}}>{SMART_SHORT[ev.wallet]||short(ev.wallet)}</span>
                        <span className="nlive-sym">{ev.loading?<span className="loading-dots"/>:ev.symbol}</span>
                        <span className="nlive-mc">{ev.mc>0?fmc(ev.mc):""}</span>
                      </div>
                    ))}
                    {G.smartEvents.length===0&&(
                      <div style={{padding:"20px",fontSize:10,color:"#334155",textAlign:"center"}}>
                        {G.smartConnected?"Nessun segnale ancora...":"Connetti Helius in SETUP →"}
                      </div>
                    )}
                  </div>
                </div>

              </div>{/* /neural-panels */}
            </div>
          )}

          {/* SNIPE TAB */}
          {tab==="snipe"&&(<>
            <div className="srow">
              <div className="sc g"><div className="sc-v">{scored.filter(x=>x.ss.score>=75&&!x.devBad).length}</div><div className="sc-l">SNIPE IT</div></div>
              <div className="sc b"><div className="sc-v">{scored.filter(x=>x.ss.score>=55&&x.ss.score<75&&!x.devBad).length}</div><div className="sc-l">ENTRA</div></div>
              <div className="sc y"><div className="sc-v">{scored.filter(x=>x.ss.score>=40&&x.ss.score<55).length}</div><div className="sc-l">WATCH</div></div>
              <div className="sc r"><div className="sc-v">{scored.filter(x=>x.devBad).length}</div><div className="sc-l">DEV BAN</div></div>
              <div className="sc w"><div className="sc-v">{G.tokens.length}</div><div className="sc-l">TOTALE</div></div>
            </div>

            <div className="fbar">
              <span style={{fontSize:8,color:"#475569",textTransform:"uppercase",letterSpacing:".4px"}}>Min score:</span>
              {([[0,"Tutti"],[40,"40+"],[55,"55+"],[75,"75+"]] as const).map(([v,l])=>(
                <button key={v} className={`fbtn${minScore===v?" on":""}`} onClick={()=>setMinScore(v as number)}>{l}</button>
              ))}
              <div className="sep"/>
              <button className={`fbtn${hideOld?" on":""}`} onClick={()=>setHideOld(v=>!v)}>Solo &lt;5min</button>
              <button className={`fbtn${showBL?" on":""}`} onClick={()=>setShowBL(v=>!v)}>Mostra bannati</button>
            </div>

            {filtered.length===0?(
              <div className="empty">
                <div className="empty-icon">🎯</div>
                <div className="empty-t">{G.connected?"In attesa di bundle freschi...":"Connessione in corso..."}</div>
              </div>
            ):(
              <div className="tcards">
                {filtered.slice(0,60).map(({tok,md,ss,vel,ageSec,devBad,pump,multi},i)=>{
                  const isOpen=open[tok.mint];
                  const mintEvs=G.events.filter(e=>e.mint===tok.mint).slice(0,15);
                  const bkInfo=devBad?devBlacklist.get(tok.dev):null;
                  const rateColor=vel.rate>=10?"#22c55e":vel.rate>=4?"#facc15":"#ef4444";
                  const mx=ss.m;

                  return(
                    <div key={tok.mint} className={`tcard ${vcls(ss.verdict)}${devBad?" bl":""}`}>
                      <div className="th" onClick={()=>toggle(tok.mint)}>
                        <div className="sbadge" style={{background:ss.vcolor+"15",border:`1px solid ${ss.vcolor}44`,color:ss.vcolor}}>
                          {ss.vemoji} {ss.verdict}
                        </div>
                        <div style={{background:ss.rColor+"18",border:`1px solid ${ss.rColor}55`,borderRadius:6,padding:"2px 8px",textAlign:"center",flexShrink:0}}>
                          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:16,fontWeight:800,color:ss.rColor,lineHeight:1}}>{ss.rating.toFixed(1)}</div>
                          <div style={{fontSize:8,color:ss.rColor,opacity:.8,fontWeight:700}}>{ss.rLabel}</div>
                        </div>
                        {multi.label&&(
                          <div style={{background:multi.color+"22",border:`1px solid ${multi.color}`,borderRadius:6,padding:"3px 9px",fontWeight:800,fontSize:13,color:multi.color,flexShrink:0}}>
                            {multi.label}
                          </div>
                        )}
                        <div>
                          <span className="tsym">{tok.symbol}</span>
                          {i===0&&<span className="newbadge">NEW</span>}
                          {devBad&&<span className="bl-badge" style={{marginLeft:4}}>BAN</span>}
                          <div className="tname">{tok.name}</div>
                        </div>
                        {pump.trend>0&&(
                          <span style={{fontSize:9,fontWeight:700,color:pump.color,background:pump.color+"18",padding:"2px 6px",borderRadius:4}}>{pump.label}</span>
                        )}
                        <span className="pill b">{tok.pctW}%</span>
                        {tok.bSlots>0&&<span className="pill b">{tok.bSlots}sl</span>}
                        {mx.organicBuyers>0&&<span className="pill g">{mx.organicBuyers}org</span>}
                        {tok.swBuy>0&&<span className="pill g">SW{tok.swBuy}</span>}
                        {tok.swSell>0&&<span className="pill r">SW-{tok.swSell}</span>}
                        {ss.bundlerSells&&ss.bundlerSells.length>0&&<span className="pill r">OUT{ss.bundlerSells.length}</span>}
                        {tok.replyCount>0&&<span className="pill o">💬{tok.replyCount}</span>}
                        {tok.migrated&&<span className="pill r">MIGRATO</span>}
                        <span className={acls(ageSec)}>{fAgeSec(tok.ts)}</span>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:rateColor}}>{vel.rate.toFixed(0)}tx/m</span>
                        <div className="tmeta">
                          <div style={{minWidth:72}}>
                            <div className="tmc">{fmc(tok.mc)}</div>
                            <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                              <div style={{flex:1,height:3,background:"rgba(0,245,255,0.08)",borderRadius:2,overflow:"hidden",width:52}}>
                                <div style={{height:"100%",width:`${Math.min(100,tok.bonding)}%`,background:tok.bonding>=85?"#ef4444":tok.bonding>=60?"#facc15":"#00f5ff",borderRadius:2,transition:"width .4s",boxShadow:tok.bonding>=85?"0 0 6px #ef4444":"0 0 4px rgba(0,245,255,0.4)"}}/>
                              </div>
                              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:tok.bonding>=85?"#ef4444":tok.bonding>=60?"#facc15":"#38bdf8",fontWeight:700,flexShrink:0}}>{tok.bonding}%</span>
                            </div>
                          </div>
                          <span className="chev">{isOpen?"^":"v"}</span>
                        </div>
                      </div>

                      {isOpen&&(
                        <div className="tbody">
                          {ss.bundlerSells&&ss.bundlerSells.length>=2&&(
                            <div className="bsell-warn">
                              BUNDLER STANNO USCENDO ({ss.bundlerSells.length}) — PERICOLO IMMINENTE
                            </div>
                          )}

                          <div style={{display:"flex",gap:7,marginTop:9,flexWrap:"wrap"}}>
                            <div style={{flex:1,minWidth:160,background:pump.color+"10",border:`1px solid ${pump.color}55`,borderRadius:8,padding:"9px 11px"}}>
                              <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:".4px",marginBottom:4}}>Pump Trend</div>
                              <div style={{fontSize:13,fontWeight:800,color:pump.color}}>{pump.label}</div>
                              <div style={{display:"flex",gap:10,marginTop:5,fontSize:9,flexWrap:"wrap"}}>
                                <span style={{color:"#64748b"}}>MC: <b style={{fontFamily:"'JetBrains Mono',monospace",color:pump.mcSlope>=0?"#22c55e":"#ef4444"}}>{pump.mcSlope>=0?"+":""}{pump.mcSlope}%</b></span>
                                <span style={{color:"#64748b"}}>Vol: <b style={{fontFamily:"'JetBrains Mono',monospace",color:pump.volSlope>=0?"#22c55e":"#ef4444"}}>{pump.volSlope>=0?"+":""}{pump.volSlope}/min</b></span>
                                <span style={{color:"#64748b"}}>Bond: <b style={{fontFamily:"'JetBrains Mono',monospace",color:pump.bondSlope>=0?"#22c55e":"#ef4444"}}>{pump.bondSlope>=0?"+":""}{pump.bondSlope}%/min</b></span>
                              </div>
                              {pump.history.length>=2&&(
                                <div style={{marginTop:6}}><Spark values={pump.history.map(h=>h.mc)} w={140} h={26}/></div>
                              )}
                            </div>
                            <div style={{minWidth:110,background:multi.color+"10",border:`1px solid ${multi.color}55`,borderRadius:8,padding:"9px 11px",textAlign:"center"}}>
                              <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:".4px",marginBottom:4}}>Multiplo</div>
                              <div style={{fontSize:22,fontWeight:800,color:multi.color,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{multi.mult}x</div>
                              <div style={{fontSize:9,color:"#64748b",marginTop:4}}>da {fmc(multi.initialMc)}</div>
                            </div>
                          </div>

                          <div className="snpanel">
                            <div className="snhead">
                              <RatingBadge rating={ss.rating} rLabel={ss.rLabel} rColor={ss.rColor} score={ss.score}/>
                              <div>
                                <div style={{fontSize:9,color:"#64748b",marginBottom:2}}>VERDICT</div>
                                <div className="snverdict" style={{borderColor:ss.vcolor,color:ss.vcolor,background:ss.vcolor+"10"}}>
                                  {ss.vemoji} {ss.verdict}
                                </div>
                              </div>
                              <div style={{flex:1}}>
                                <div style={{fontSize:9,color:"#64748b",marginBottom:4}}>SNIPE SCORE</div>
                                <div style={{height:6,background:"#151d30",borderRadius:3,overflow:"hidden",maxWidth:200}}>
                                  <div style={{height:"100%",width:`${ss.score}%`,background:`linear-gradient(90deg,${ss.vcolor}55,${ss.vcolor})`,borderRadius:3,transition:"width .5s"}}/>
                                </div>
                                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"#64748b",marginTop:2}}>{ss.score}/100</div>
                              </div>
                              {devBad&&bkInfo&&(
                                <div style={{marginLeft:"auto",background:"#1a0a0a",border:"1px solid #7f1d1d",borderRadius:5,padding:"3px 7px",fontSize:10,color:"#ef4444"}}>
                                  DEV BANNATO<br/><span style={{opacity:.6,fontSize:9}}>{bkInfo.count}x dump</span>
                                </div>
                              )}
                            </div>
                            <div className="snflags">
                              {ss.flags.map((f,fi)=>(
                                <div key={fi} className={`sf ${f.t}`}>{f.s}</div>
                              ))}
                            </div>
                          </div>

                          <div className="vel-row">
                            <span style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:".3px"}}>VELOCITY</span>
                            <span style={{fontFamily:"'JetBrains Mono',monospace",color:rateColor,fontWeight:700,fontSize:11}}>{vel.rate.toFixed(0)} tx/min</span>
                            <div className="vel-bar-bg">
                              <div className="vel-bar-fill" style={{width:`${Math.min(100,vel.rate*5)}%`,background:rateColor}}/>
                            </div>
                            <span style={{color:"#334155",fontSize:9}}>{vel.l30s} in 30s</span>
                            <span style={{color:"#334155",fontSize:9}}>{vel.l60s} in 60s</span>
                            <span style={{color:"#334155",fontSize:9}}>@30s: {vel.t30}tx · @60s: {vel.t60}tx</span>
                          </div>

                          <div className="adv-panel">
                            <div className="adv-title">ANALISI AVANZATA</div>
                            <div style={{marginBottom:7}}>
                              <div style={{fontSize:9,color:"#475569",marginBottom:4,textTransform:"uppercase",letterSpacing:".3px"}}>Flusso SOL</div>
                              {[
                                {label:"Bundle SOL in", val:mx.bundleSolIn,  c:"#38bdf8", max:Math.max(mx.bundleSolIn,mx.organicSolIn,0.01)},
                                {label:"Organic SOL in",val:mx.organicSolIn, c:"#22c55e", max:Math.max(mx.bundleSolIn,mx.organicSolIn,0.01)},
                                {label:"SOL out (sell)",val:mx.totalSolOut,  c:"#ef4444", max:Math.max(mx.totalSolIn,0.01)},
                              ].map(b=>(
                                <div key={b.label} className="sol-bar-row">
                                  <span style={{fontSize:9,color:"#475569",minWidth:92,textAlign:"right"}}>{b.label}</span>
                                  <div className="sol-bar-bg"><div className="sol-bar-fill" style={{width:`${Math.min(100,(b.val/b.max)*100)}%`,background:b.c}}/></div>
                                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:b.c,minWidth:55,fontWeight:600}}>{b.val.toFixed(3)} SOL</span>
                                </div>
                              ))}
                              <div style={{marginTop:4,display:"flex",gap:12,fontSize:9,flexWrap:"wrap"}}>
                                <span style={{color:"#475569"}}>Sell pressure: <b style={{fontFamily:"'JetBrains Mono',monospace",color:mx.sellPressure>0.5?"#ef4444":mx.sellPressure>0.25?"#f97316":"#22c55e"}}>{(mx.sellPressure*100).toFixed(0)}%</b></span>
                                <span style={{color:"#475569"}}>Bundle exit: <b style={{fontFamily:"'JetBrains Mono',monospace",color:mx.bundlerExitPct>50?"#ef4444":mx.bundlerExitPct>20?"#f97316":"#22c55e"}}>{mx.bundlerExitPct}%</b></span>
                                <span style={{color:"#475569"}}>Bundle vol: <b style={{fontFamily:"'JetBrains Mono',monospace",color:mx.bundleSolPct>90?"#ef4444":"#22c55e"}}>{mx.bundleSolPct}%</b></span>
                              </div>
                            </div>
                            <div style={{height:1,background:"#151d30",margin:"6px 0"}}/>
                            <div>
                              <div style={{fontSize:9,color:"#475569",marginBottom:5,textTransform:"uppercase",letterSpacing:".3px"}}>Holder breakdown</div>
                              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:5}}>
                                {[
                                  {l:"Bundled",    v:mx.bundledWallets,  c:"#38bdf8"},
                                  {l:"Organic",    v:mx.organicBuyers,   c:"#22c55e"},
                                  {l:"Tot buyers", v:mx.allBuyWallets,   c:"#94a3b8"},
                                  {l:"Watch oggi", v:(()=>{const h=holderHistory.get(tok.mint);return h?.[today()]?.wallets.size||0;})(), c:"#38bdf8"},
                                  {l:"Organic %",  v:(mx.allBuyWallets>0?Math.round((mx.organicBuyers/mx.allBuyWallets)*100):0)+"%", c:mx.allBuyWallets>0&&(mx.organicBuyers/mx.allBuyWallets)>0.4?"#22c55e":"#facc15"},
                                  {l:"Rate /min",  v:mx.holderRateEarly, c:mx.holderRateEarly>=5?"#22c55e":"#facc15"},
                                ].map(x=>(
                                  <div key={x.l} className="hbox">
                                    <div className="hbox-v" style={{color:x.c}}>{x.v}</div>
                                    <div className="hbox-l">{x.l}</div>
                                  </div>
                                ))}
                              </div>
                              {ageSec>120&&(
                                <div style={{display:"flex",alignItems:"center",gap:5,fontSize:9,flexWrap:"wrap"}}>
                                  <span style={{color:"#475569"}}>Holder accel:</span>
                                  <span style={{fontFamily:"'JetBrains Mono',monospace",color:"#64748b"}}>{mx.holderRateEarly}/min → {mx.holderRateLate}/min</span>
                                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,
                                    color:mx.holderAccel>2?"#22c55e":mx.holderAccel<-3?"#ef4444":"#64748b"}}>
                                    {mx.holderAccel>0?"+":""}{mx.holderAccel}/min {mx.holderAccel>2?"ACCELERA":mx.holderAccel<-3?"rallenta":"stabile"}
                                  </span>
                                </div>
                              )}
                              {(()=>{const h=holderHistory.get(tok.mint);const days=h?Object.keys(h).sort():[];
                                return days.length>=2?(<div style={{marginTop:5,display:"flex",alignItems:"center",gap:7}}>
                                  <span style={{fontSize:9,color:"#475569"}}>Trend watcher:</span>
                                  <Spark values={days.map(d=>h[d].wallets.size)}/>
                                </div>):null;})()}
                            </div>
                          </div>

                          <div className="mrow">
                            {[
                              {v:`${tok.pctW}%`,    l:"Bundled",   c:tok.pctW>=40?"#22c55e":"#facc15"},
                              {v:tok.bSlots,        l:"Slot",      c:"#38bdf8"},
                              {v:tok.swBuy,         l:"SW buy",    c:"#22c55e"},
                              {v:tok.swSell,        l:"SW sell",   c:tok.swSell>0?"#ef4444":"#334155"},
                              {v:`${tok.bonding}%`, l:"Bonding",   c:tok.bonding>=70?"#ef4444":"#38bdf8"},
                              {v:vel.t30,           l:"Tx @30s",   c:vel.t30>=5?"#22c55e":"#64748b"},
                              {v:vel.t60,           l:"Tx @60s",   c:vel.t60>=10?"#22c55e":"#64748b"},
                              {v:fmc(tok.mc),       l:"Mkt cap",   c:"#94a3b8"},
                            ].map(m=>(
                              <div key={m.l} className="met">
                                <div className="met-v" style={{color:m.c}}>{m.v}</div>
                                <div className="met-l">{m.l}</div>
                              </div>
                            ))}
                          </div>

                          {/* Dev row con copia CA */}
                          <div className="dev-row">
                            <span className="addrl">Mint: {short(tok.mint)}</span>
                            <CopyBtn text={tok.mint}/>
                            <span className="addrl">Dev: {short(tok.dev)}</span>
                            <span className="addrl">{fSol(tok.solDev)}</span>
                            {tok.devSold&&<span className="devdump">DEV SOLD</span>}
                            {devBad&&<span className="bl-badge">BAN ({devBlacklist.get(tok.dev)?.count}x)</span>}
                            <a className="plink" href={`https://pump.fun/${tok.mint}`} target="_blank" rel="noreferrer">pump.fun</a>
                          </div>

                          {mintEvs.length>0&&(
                            <table className="ttbl">
                              <thead><tr><th>Ora</th><th>Az</th><th>Wallet</th><th>SOL</th><th>Slot</th><th>Tag</th></tr></thead>
                              <tbody>
                                {mintEvs.map(ev=>{
                                  const inBundle=Object.values(md.bundleSlots).some(set=>set.size>=2&&set.has(ev.wallet));
                                  const isBundlerSell=ev.action==="sell"&&inBundle;
                                  return(
                                    <tr key={ev.sig} className={isBundlerSell?"br":""}>
                                      <td>{new Date(ev.ts).toLocaleTimeString()}</td>
                                      <td className={ev.action}>{ev.action==="buy"?"BUY":ev.action==="sell"?"SELL":"NEW"}</td>
                                      <td>{SMART_SET.has(ev.wallet)&&<span className="star">* </span>}<span className="addrl">{short(ev.wallet)}</span></td>
                                      <td style={{color:"#94a3b8"}}>{ev.sol.toFixed(4)}</td>
                                      <td style={{color:"#334155"}}>{ev.slot}</td>
                                      <td style={{fontSize:9}}>
                                        {isBundlerSell&&<span style={{color:"#ef4444",fontWeight:700}}>BUNDLER OUT</span>}
                                        {inBundle&&ev.action==="buy"&&<span style={{color:"#38bdf8"}}>bundled</span>}
                                        {SMART_SET.has(ev.wallet)&&<span style={{color:"#fbbf24"}}>smart</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>)}

          {/* WINNERS TAB */}
          {tab==="winners"&&(<>
            <div style={{marginBottom:9,padding:9,background:"#070916",borderRadius:8,border:"1px solid #1e3a5f",fontSize:11,color:"#94a3b8"}}>
              Multiplo calcolato dal MC al momento del bundle/creazione fino a ORA, in tempo reale. Solo token con almeno <b style={{color:"#22c55e"}}>x5</b>.
            </div>
            <div className="srow">
              <div className="sc g"><div className="sc-v">{x10Count}</div><div className="sc-l">x10+</div></div>
              <div className="sc b"><div className="sc-v">{winnersCount}</div><div className="sc-l">x5+ totali</div></div>
              <div className="sc y"><div className="sc-v">{winners.filter(w=>w.pump.trend>=60).length}</div><div className="sc-l">Ancora salendo</div></div>
              <div className="sc r"><div className="sc-v">{winners.filter(w=>w.pump.trend<30).length}</div><div className="sc-l">Crollati</div></div>
            </div>
            {winners.length===0?(
              <div className="empty">
                <div className="empty-icon">🏆</div>
                <div className="empty-t">Nessun token ha ancora fatto x5</div>
              </div>
            ):(
              <div className="tcards">
                {winners.map(({tok,ss,pump,multi})=>{
                  const isOpen=open["w_"+tok.mint];
                  return(
                    <div key={tok.mint} className="tcard" style={{borderLeft:`3px solid ${multi.color}`}}>
                      <div className="th" onClick={()=>toggle("w_"+tok.mint)}>
                        <div style={{background:multi.color+"22",border:`1px solid ${multi.color}`,borderRadius:6,padding:"4px 10px",fontWeight:800,fontSize:16,color:multi.color,fontFamily:"'JetBrains Mono',monospace"}}>
                          {multi.mult}x
                        </div>
                        <div>
                          <span className="tsym">{tok.symbol}</span>
                          <div className="tname">{tok.name}</div>
                        </div>
                        <span style={{fontSize:9,fontWeight:700,color:pump.color,background:pump.color+"18",padding:"2px 6px",borderRadius:4}}>{pump.label}</span>
                        <span className="pill b">{tok.pctW}% bundle</span>
                        {tok.swBuy>0&&<span className="pill g">SW{tok.swBuy}</span>}
                        <div className="tmeta">
                          <div>
                            <div className="tmc">{fmc(tok.mc)}</div>
                            <div className="tinfo">da {fmc(multi.initialMc)} — {fAgeShort(tok.ts)} fa</div>
                          </div>
                          <span className="chev">{isOpen?"^":"v"}</span>
                        </div>
                      </div>
                      {isOpen&&(
                        <div className="tbody">
                          <div style={{marginTop:9,background:"#04060e",border:"1px solid #151d30",borderRadius:8,padding:"10px 12px"}}>
                            <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:".4px",marginBottom:6}}>Crescita MC nel tempo</div>
                            {pump.history.length>=2&&<Spark values={pump.history.map(h=>h.mc)} w={260} h={50}/>}
                            <div style={{display:"flex",gap:14,marginTop:8,fontSize:10,flexWrap:"wrap"}}>
                              <span style={{color:"#64748b"}}>MC iniziale: <b style={{color:"#e2e8f0",fontFamily:"'JetBrains Mono',monospace"}}>{fmc(multi.initialMc)}</b></span>
                              <span style={{color:"#64748b"}}>MC ora: <b style={{color:"#e2e8f0",fontFamily:"'JetBrains Mono',monospace"}}>{fmc(tok.mc)}</b></span>
                              <span style={{color:"#64748b"}}>Trend MC: <b style={{color:pump.mcSlope>=0?"#22c55e":"#ef4444",fontFamily:"'JetBrains Mono',monospace"}}>{pump.mcSlope>=0?"+":""}{pump.mcSlope}%</b></span>
                            </div>
                          </div>
                          {/* Dev row con copia CA */}
                          <div className="dev-row">
                            <span className="addrl">Mint: {short(tok.mint)}</span>
                            <CopyBtn text={tok.mint}/>
                            <span className="addrl">Dev: {short(tok.dev)}</span>
                            <a className="plink" href={`https://pump.fun/${tok.mint}`} target="_blank" rel="noreferrer">pump.fun</a>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>)}

          {/* WALLETS TAB */}
          {tab==="wallets"&&(<>
            <div style={{marginBottom:9,padding:9,background:"#070916",borderRadius:8,border:"1px solid #1e3a5f",fontSize:11,color:"#94a3b8"}}>
              Per ogni smart wallet: cosa ha comprato, a che MC, se tiene o ha venduto, e se altri smart wallet sono entrati sullo stesso token.
            </div>
            <div className="tcards">
              {walletSummaries.map(w=>{
                const isOpen=open["wlt_"+w.wallet];
                return(
                  <div key={w.wallet} className="tcard" style={{borderLeft:w.totalBuys>0?"3px solid #38bdf8":"3px solid #151d30"}}>
                    <div className="th" onClick={()=>toggle("wlt_"+w.wallet)}>
                      <div>
                        <span className="tsym" style={{fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}>{w.short}</span>
                        <div className="tname">{w.totalBuys} buy totali</div>
                      </div>
                      <span className="pill g">{w.totalHeld} held</span>
                      {w.totalSold>0&&<span className="pill r">{w.totalSold} sold</span>}
                      {w.bestMult>=2&&<span className="pill o">best {w.bestMult}x</span>}
                      <div className="tmeta">
                        <span className="chev">{isOpen?"^":"v"}</span>
                      </div>
                    </div>
                    {isOpen&&(
                      <div className="tbody">
                        {w.holdings.length===0?(
                          <div style={{fontSize:11,color:"#475569",padding:"8px 0"}}>Nessun acquisto rilevato ancora.</div>
                        ):(
                          <table className="ttbl" style={{marginTop:8}}>
                            <thead><tr><th>Token</th><th>MC entry</th><th>MC ora</th><th>Mult</th><th>Stato</th><th>Altri SW</th><th>Tempo</th></tr></thead>
                            <tbody>
                              {w.holdings.map(h=>(
                                <tr key={h.mint}>
                                  <td style={{fontWeight:700,color:"#e2e8f0"}}>{h.symbol}</td>
                                  <td style={{color:"#64748b"}}>{fmc(h.mcEntry)}</td>
                                  <td style={{color:"#94a3b8"}}>{fmc(h.mcNow)}</td>
                                  <td style={{fontWeight:700,color:h.mult>=2?"#22c55e":h.mult<0.8?"#ef4444":"#facc15"}}>{h.mult}x</td>
                                  <td>
                                    {h.sold
                                      ?<span style={{color:"#ef4444",fontWeight:700}}>VENDUTO</span>
                                      :<span style={{color:"#22c55e",fontWeight:700}}>TIENE</span>}
                                  </td>
                                  <td style={{color:h.othersIn>0?"#38bdf8":"#334155",fontWeight:h.othersIn>0?700:400}}>{h.othersIn>0?`+${h.othersIn}`:"—"}</td>
                                  <td style={{color:"#475569"}}>{fAgeShort(Date.now()-h.holdTimeSec*1000)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>)}

          {/* SMART TAB */}
          {tab==="smart"&&(<>
            {!heliusActive&&(
              <div style={{background:"#070916",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 12px",marginBottom:10,fontSize:11,color:"#94a3b8"}}>
                Senza Helius i smart wallet vengono visti solo su pump.fun. Aggiungi la chiave nel tab SETUP.
              </div>
            )}
            <div className="srow">
              <div className="sc g"><div className="sc-v">{swConvs.filter(x=>x.nBuy>=3).length}</div><div className="sc-l">CONVOY</div></div>
              <div className="sc b"><div className="sc-v">{swConvs.filter(x=>x.nBuy===2).length}</div><div className="sc-l">2 SMART</div></div>
              <div className="sc r"><div className="sc-v">{swConvs.filter(x=>x.nSell>=2).length}</div><div className="sc-l">SELLING</div></div>
              <div className="sc w"><div className="sc-v">{G.smartEvents.length}</div><div className="sc-l">EVENTS</div></div>
            </div>
            {swConvs.length>0&&(
              <div className="sgrid" style={{marginBottom:10}}>
                {swConvs.slice(0,12).map(row=>(
                  <div key={row.mint} className={`scard ${row.cls}`}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
                      <span style={{fontSize:16}}>{row.emoji}</span>
                      <div>
                        <div style={{fontSize:13,fontWeight:700}}>{row.symbol==="..."?<span className="loading-dots"/>:row.symbol}</div>
                        <div style={{fontSize:10,fontWeight:700,color:row.cls==="strong"?"#22c55e":row.cls==="selling"?"#ef4444":"#facc15"}}>{row.sig}</div>
                        <div style={{fontSize:9,color:"#64748b"}}>{fAgeShort(row.last)} fa -- {fmc(row.mc)}</div>
                      </div>
                      <div style={{marginLeft:"auto",display:"flex",gap:3,flexWrap:"wrap"}}>
                        <span className="pill g">{row.nBuy}B</span>
                        {row.nSell>0&&<span className="pill r">{row.nSell}S</span>}
                        <span className="pill b">{fSol(row.solIn)}</span>
                      </div>
                    </div>
                    <table className="ttbl">
                      <thead><tr><th>Ora</th><th>Az</th><th>Wallet</th><th>SOL</th></tr></thead>
                      <tbody>
                        {row.events.map((ev,i)=>(
                          <tr key={i}>
                            <td>{new Date(ev.ts).toLocaleTimeString()}</td>
                            <td className={ev.action==="buy"?"buy":"sell"}>{ev.action==="buy"?"BUY":"SELL"}</td>
                            <td className="addrl">{SMART_SHORT[ev.wallet]||short(ev.wallet)}</td>
                            <td style={{color:"#94a3b8"}}>{(ev.sol||0).toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}>
                      <a className="plink" href={`https://pump.fun/${row.mint}`} target="_blank" rel="noreferrer">pump.fun</a>
                      <CopyBtn text={row.mint}/>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{fontSize:8,color:"#475569",textTransform:"uppercase",letterSpacing:".4px",marginBottom:4}}>Feed cronologico smart wallet</div>
            <div style={{background:"#070916",border:"1px solid #151d30",borderRadius:8,overflow:"hidden"}}>
              {G.smartEvents.length===0?(
                <div className="empty" style={{border:"none"}}><div className="empty-icon">🧠</div><div className="empty-t">Nessuna attivita smart wallet</div></div>
              ):G.smartEvents.map((ev,i)=>(
                <div key={i} className="sfeed-row">
                  <span style={{width:45,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:ev.action==="buy"?"#22c55e":"#ef4444"}}>{ev.action==="buy"?"BUY":"SELL"}</span>
                  <span style={{fontWeight:700,minWidth:50,fontSize:11}}>{ev.loading?<span className="loading-dots"/>:ev.symbol}</span>
                  <span className="addrl" style={{minWidth:60}}>{SMART_SHORT[ev.wallet]||short(ev.wallet)}</span>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",minWidth:55,color:"#94a3b8",fontSize:10}}>{fSol(ev.sol)}</span>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"#64748b",minWidth:55}}>{fmc(ev.mc)}</span>
                  {ev.dex&&<span className="dex-tag">{ev.dex}</span>}
                  <span style={{fontSize:10,color:"#475569",marginLeft:"auto"}}>{fAgeShort(ev.ts)}</span>
                </div>
              ))}
            </div>
          </>)}

          {/* FEED TAB */}
          {tab==="feed"&&(<>
            <div className="ffilters">
              {["buy","sell","create"].map(f=>(
                <button key={f} className={`fbtn${feedFilter.includes(f)?" on":""}`}
                  onClick={()=>setFeedFilter(p=>p.includes(f)?p.filter(x=>x!==f):[...p,f])}>
                  {f==="buy"?"BUY":f==="sell"?"SELL":"CREATE"}
                </button>
              ))}
              <button className={`fbtn${smartOnly?" on":""}`} onClick={()=>setSmartOnly(v=>!v)}>Smart only</button>
              <span style={{marginLeft:"auto",fontSize:9,color:"#334155"}}>{feed.length} eventi</span>
            </div>
            {feed.length===0?(
              <div className="empty"><div className="empty-icon">📡</div><div className="empty-t">Nessun evento</div></div>
            ):(
              <table className="ttbl">
                <thead><tr><th>Ora</th><th>Az</th><th>Token</th><th>Wallet</th><th>SOL</th><th>MCap</th></tr></thead>
                <tbody>
                  {feed.map(ev=>(
                    <tr key={ev.sig}>
                      <td>{new Date(ev.ts).toLocaleTimeString()}</td>
                      <td className={ev.action}>{ev.action==="buy"?"BUY":ev.action==="sell"?"SELL":"NEW"}</td>
                      <td>
                        {(ev as any).symbol
                          ? <span style={{fontWeight:700,color:"#00f5ff",fontFamily:"'JetBrains Mono',monospace"}}>{(ev as any).symbol}</span>
                          : <span className="addrl">{short(ev.mint)}</span>}
                      </td>
                      <td>{SMART_SET.has(ev.wallet)&&<span className="star">★ </span>}<span className="addrl">{short(ev.wallet)}</span></td>
                      <td style={{color:"#94a3b8"}}>{ev.sol.toFixed(4)}</td>
                      <td style={{color:"#38bdf8",fontFamily:"'JetBrains Mono',monospace",fontSize:10}}>{(ev as any).mc>0?fmc((ev as any).mc):""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>)}

          {/* BLACKLIST TAB */}
          {tab==="bl"&&(<>
            <div style={{marginBottom:9,padding:8,background:"#1a0a0a",borderRadius:8,border:"1px solid #7f1d1d",fontSize:11,color:"#f87171"}}>
              Dev bannati automaticamente quando vendono entro 5 minuti dalla creazione.
            </div>
            {devBlacklist.size===0?(
              <div className="empty"><div className="empty-icon">🚫</div><div className="empty-t">Nessun dev bannato</div></div>
            ):(
              <table className="bl-table">
                <thead><tr><th>Dev wallet</th><th>Dump</th><th>Motivo</th><th>Ultimo</th></tr></thead>
                <tbody>
                  {[...devBlacklist.entries()].sort((a,b)=>b[1].count-a[1].count).map(([dev,info])=>(
                    <tr key={dev}>
                      <td style={{color:"#ef4444"}}>{short(dev)}</td>
                      <td style={{color:"#ef4444",fontWeight:700}}>{info.count}x</td>
                      <td style={{color:"#94a3b8",fontSize:10}}>{info.reason}</td>
                      <td style={{color:"#475569",fontSize:10}}>{fAgeShort(info.lastSeen)} fa</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>)}

          {/* SETUP TAB */}
          {tab==="setup"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>

              {/* Sezione Zero AI */}
              <div style={{background:"#070916",border:"1px solid #1e3a5f",borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#38bdf8",marginBottom:4}}>🤖 Zero — AI Agent</div>
                <div style={{fontSize:11,color:"#64748b",marginBottom:10,lineHeight:1.6}}>
                  Zero analizza i token live ogni <b style={{color:"#e2e8f0"}}>30 secondi</b> e ti fa un recap parlato in italiano, stile trader.
                  Usa <b style={{color:"#38bdf8"}}>Pollinations AI</b> — completamente gratuito, nessuna API key richiesta.
                  <br/>Attiva la voce e poi premi <b style={{color:"#e2e8f0"}}>🤖 ZERO</b> nell'header per partire.
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <button onClick={()=>{toggleAiAgent();}} style={{background:aiAgentOn?"#1e3a5f":"#070916",border:`1px solid ${aiAgentOn?"#38bdf8":"#1e3a5f"}`,borderRadius:6,padding:"5px 14px",cursor:"pointer",color:aiAgentOn?"#38bdf8":"#475569",fontSize:11,fontWeight:700}}>
                    {aiAgentOn?"Zero ATTIVO — clicca per spegnere":"Attiva Zero"}
                  </button>
                  {aiAgentOn&&<span style={{fontSize:10,color:"#4ade80"}}>✓ Parla ogni 30s</span>}
                </div>
                {aiAgentState.lastText&&(
                  <div style={{marginTop:10,fontSize:11,color:"#94a3b8",fontStyle:"italic",borderLeft:"2px solid #38bdf8",paddingLeft:8}}>
                    Ultimo recap: "{aiAgentState.lastText}"
                  </div>
                )}
              </div>

              {/* Helius Key */}
              <div style={{background:"#070916",border:"1px solid #1e3a5f",borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#38bdf8",marginBottom:4}}>Helius API Key</div>
                <div style={{fontSize:11,color:"#64748b",marginBottom:10,lineHeight:1.6}}>
                  Una chiave, due usi: (1) traccia i smart wallet su tutti i DEX — Raydium, Jupiter, Orca, pump.fun;
                  (2) diventa l'RPC primario per leggere le transazioni, molto più stabile dei nodi pubblici gratuiti
                  (che spesso rispondono 429 / rate-limit e fanno fallire il parsing).<br/>
                  Chiave gratuita su <b style={{color:"#38bdf8"}}>helius.dev</b>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <input className="helius-input" placeholder="Incolla la tua Helius API key..."
                    value={heliusKey} onChange={e=>setHeliusKey(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&activateHelius()}/>
                  <button className="helius-btn" onClick={activateHelius}>Attiva</button>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <div className={`dot${G.smartConnected?"":G.smartReconnecting?" y":" off"}`}/>
                    <span style={{fontSize:10,color:"#475569"}}>{G.smartConnected?"Connesso — WS smart + RPC su Helius":heliusActive?"Connessione...":"Non attivo"}</span>
                  </div>
                </div>
                {G.txFailed>30&&!heliusActive&&(
                  <div style={{marginTop:8,fontSize:10,color:"#f87171",background:"#1a0a0a",border:"1px solid #7f1d1d",borderRadius:5,padding:"5px 8px"}}>
                    {G.txFailed} transazioni fallite — probabile rate-limit sugli RPC pubblici. Attiva Helius qui sopra per risolvere.
                  </div>
                )}
              </div>

              {/* Smart Wallets */}
              <div style={{background:"#070916",border:"1px solid #151d30",borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#e2e8f0",marginBottom:8}}>Smart Wallet monitorati ({SMART_WALLETS.length})</div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {SMART_WALLETS.map((w,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0",borderBottom:"1px solid #151d30",fontSize:10}}>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",color:"#38bdf8",minWidth:20}}>{i+1}.</span>
                      <span className="addrl" style={{fontSize:10,flex:1}}>{w}</span>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:8,fontSize:10,color:"#475569"}}>Per aggiornare i wallet modifica SMART_WALLETS nel codice.</div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="ftr">
          <span>{G.lastMsg?`Ultimo: ${new Date(G.lastMsg).toLocaleTimeString()}`:"--"}</span>
          <span>|</span><span>Queue: {G.parseQueue.length+activeJobs}</span>
          <span>|</span><span>Fail: {G.txFailed}</span>
          <span>|</span><span>{G.smartConnected?"Smart: LIVE":"Smart: OFF"}</span>
          <span style={{marginLeft:"auto"}}>RPC: {(()=>{const l=getRpcHttpList();return l[rpcIdx%l.length].replace("https://","").split("/")[0];})()}</span>
        </div>
      </div>
    </>
  );
}

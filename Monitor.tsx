import { useState, useEffect, useRef, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { css } from "./src/styles";
import { setHeliusKey, SMART_WALLETS, SMART_SET, SMART_SHORT, API_BASE } from "./src/config";
import { getRpcHttpList } from "./src/config";
import { AI_INTERVAL, AI_FIRST_DELAY } from "./src/config";
import { G, devBlacklist, voiceState, aiAgentState } from "./src/state";
import { walletPortfolio, holderHistory, holderConc, pumpHistory } from "./src/state";
import { notify, getMintData, isDevBad, cleanupMemory } from "./src/state";
import { markDevBad, recordWalletBuy, recordWalletSell, countOtherSmartBuyers } from "./src/state";
import { rpcIdx, setRpcIdx } from "./src/rpc";
import { fmc, fSol, short, bondingPct, fAgeSec, fAgeShort, vcls, acls, today } from "./src/helpers";
import { calcSnipeScore, calcVelocity, calcPumpTrend, calcMultiplier } from "./src/scoring";
import { speak } from "./src/voice";
import { runAiRecap } from "./src/ai";
import { startWs, startSmartWs } from "./src/websocket";
import { getCoin } from "./src/coinCache";
import { fetchHolderConc } from "./src/holder";
import { NeuralView } from "./src/components/NeuralView";
import { CopyBtn } from "./src/components/CopyBtn";
import { RatingBadge } from "./src/components/RatingBadge";
import { Spark } from "./src/components/Spark";

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Monitor() {
  const wallet = useWallet();
  const [, bump] = useState(0);
  const [tab, setTab] = useState("snipe");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [alerts, setAlerts] = useState<any[]>([]);
  const [feedFilter, setFeedFilter] = useState<string[]>([]);
  const [smartOnly, setSmartOnly] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [hideOld, setHideOld] = useState(true);
  const [showBL, setShowBL] = useState(false);
  const [heliusKey, setHeliusKey] = useState((import.meta as any).env?.VITE_HELIUS_KEY || "");
  const [heliusActive, setHeliusActive] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [aiAgentOn, setAiAgentOn] = useState(true);
  const [showAiLog, setShowAiLog] = useState(false);
  const [neuralSelected, setNeuralSelected] = useState<string | null>(null);
  const [ptt, setPtt] = useState({ active: false, status: "idle", transcript: "" });
  const pttRecRef = useRef<any>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textQuestion, setTextQuestion] = useState("");
  const [sniperEnabled, setSniperEnabled] = useState(false);
  const [sniperMinScore, setSniperMinScore] = useState(75);
  const [sniperMaxMc, setSniperMaxMc] = useState(50000);
  const [sniperSolAmount, setSniperSolAmount] = useState(0.05);
  const [scoringStats, setScoringStats] = useState<any[]>([]);
  const prevTokLen = useRef(0);
  const prevSmartLen = useRef(0);

  useEffect(() => {
    const fn = () => bump(n => n + 1);
    G.listeners.add(fn);
    startWs();
    const envKey = (import.meta as any).env?.VITE_HELIUS_KEY;
    if (envKey && !heliusActive) {
      (await_import_helius(envKey));
    }
    voiceState.enabled = true;
    aiAgentState.enabled = true;
    return () => { G.listeners.delete(fn); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function await_import_helius(envKey: string) {
    setHeliusKey(envKey);
    setRpcIdx(0);
    startSmartWs(envKey);
    setHeliusActive(true);
  }

  useEffect(() => {
    const id = setInterval(() => {
      bump(n => n + 1);
      cleanupMemory();
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const n = G.tokens.length;
    if (n > prevTokLen.current) {
      const tok = G.tokens[0];
      if (tok && !isDevBad(tok.dev)) {
        const md = getMintData(tok.mint);
        const ss = calcSnipeScore(tok, md);
        if (ss.score >= 55) {
          const id = Date.now();
          setAlerts(a => [{ id, tok, ss }, ...a].slice(0, 5));
          setTimeout(() => setAlerts(a => a.filter(x => x.id !== id)), 12000);
          const nome = tok.symbol || tok.name || "token sconosciuto";
          if (ss.score >= 70) {
            speak(`SNIPE! ${nome}. Score ${Math.round(ss.score)}, MCap ${fmc(tok.mc)}, bonding ${tok.bonding} percento.`);
          } else {
            speak(`Nuovo token interessante: ${nome}. Score ${Math.round(ss.score)}, MCap ${fmc(tok.mc)}.`);
          }
        }
      }
    }
    prevTokLen.current = n;
  });

  useEffect(() => {
    const n = G.smartEvents.length;
    if (n > prevSmartLen.current) {
      const ev = G.smartEvents[0];
      if (ev && ev.action === "buy") {
        const id = Date.now() + 1;
        setAlerts(a => [{ id, smart: ev }, ...a].slice(0, 5));
        setTimeout(() => setAlerts(a => a.filter(x => x.id !== id)), 8000);
        const nome = ev.symbol || (ev.mint ? ev.mint.slice(0, 6) : "token");
        const wallet = SMART_SHORT[ev.wallet] || "Smart wallet";
        speak(`${wallet} compra ${nome}, ${fSol(ev.sol)} sol.`);
      }
    }
    prevSmartLen.current = n;
  });

  const toggle = (id: string) => setOpen(o => ({ ...o, [id]: !o[id] }));

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    voiceState.enabled = next;
    if (next) {
      voiceState.queue = [];
      speak("Voce attivata. Ti avviso quando succede qualcosa di importante.");
    } else {
      voiceState.queue = [];
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    }
  };

  const toggleAiAgent = () => {
    const next = !aiAgentOn;
    setAiAgentOn(next);
    aiAgentState.enabled = next;
    if (next && !voiceOn) {
      setVoiceOn(true);
      voiceState.enabled = true;
    }
    if (next) speak("Udini attivato. Ti aggiorno ogni trenta secondi sul mercato.");
  };

  // AI agent loop
  useEffect(() => {
    if (!aiAgentOn) return;
    const id = setInterval(() => {
      if (voiceState.pttActive) return;
      const snap = G.tokens.map(tok => {
        const md = getMintData(tok.mint);
        const ss = calcSnipeScore(tok, md);
        const pump = calcPumpTrend(tok.mint);
        const multi = calcMultiplier(tok.mint, tok.mc);
        return { tok, ss, pump, multi };
      }).sort((a, b) => b.ss.score - a.ss.score);
      runAiRecap(snap, undefined);
    }, AI_INTERVAL);
    const first = setTimeout(() => {
      if (voiceState.pttActive) return;
      const snap = G.tokens.map(tok => {
        const md = getMintData(tok.mint);
        const ss = calcSnipeScore(tok, md);
        const pump = calcPumpTrend(tok.mint);
        const multi = calcMultiplier(tok.mint, tok.mc);
        return { tok, ss, pump, multi };
      }).sort((a, b) => b.ss.score - a.ss.score);
      runAiRecap(snap, undefined);
    }, AI_FIRST_DELAY);
    return () => { clearInterval(id); clearTimeout(first); };
  }, [aiAgentOn]);

  // ── PUSH-TO-TALK ─────────────────────────────────────────────────
  function buildSnapshot() {
    return G.tokens.map(tok => {
      const md = getMintData(tok.mint);
      const ss = calcSnipeScore(tok, md);
      const pump = calcPumpTrend(tok.mint);
      const multi = calcMultiplier(tok.mint, tok.mc);
      return { tok, ss, pump, multi };
    }).sort((a, b) => b.ss.score - a.ss.score);
  }

  function startPushToTalk() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setShowTextInput(true);
      setPtt({ active: false, status: "unsupported", transcript: "" });
      return;
    }
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      voiceState.speaking = false;
      voiceState.pttActive = true;
      const rec = new SR();
      pttRecRef.current = rec;
      rec.lang = "it-IT";
      rec.continuous = false;
      rec.interimResults = true;
      let finalTranscript = "";
      setPtt({ active: true, status: "listening", transcript: "" });
      rec.onresult = (ev: any) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) finalTranscript += t;
          else interim += t;
        }
        setPtt(p => ({ ...p, transcript: finalTranscript || interim }));
      };
      rec.onerror = (e: any) => {
        voiceState.pttActive = false;
        setPtt({ active: false, status: "error", transcript: "" });
        if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
          setShowTextInput(true);
        }
      };
      rec.onend = () => {
        voiceState.pttActive = false;
        const q = (finalTranscript || "").trim();
        if (q) {
          setPtt({ active: false, status: "thinking", transcript: q });
          runAiRecap(buildSnapshot(), q).finally(() => {
            setPtt({ active: false, status: "idle", transcript: "" });
          });
        } else {
          setPtt({ active: false, status: "idle", transcript: "" });
        }
        pttRecRef.current = null;
      };
      rec.start();
    } catch {
      voiceState.pttActive = false;
      setShowTextInput(true);
      setPtt({ active: false, status: "error", transcript: "" });
    }
  }

  function stopPushToTalk() {
    try { if (pttRecRef.current) pttRecRef.current.stop(); } catch (e) { console.warn("[PTT] stop:", e); }
  }

  function askUdiniText() {
    const q = textQuestion.trim();
    if (!q) return;
    setTextQuestion("");
    setPtt({ active: false, status: "thinking", transcript: q });
    runAiRecap(buildSnapshot(), q).finally(() => {
      setPtt({ active: false, status: "idle", transcript: "" });
    });
  }

  useEffect(() => {
    if (tab === "setup") {
      fetch(API_BASE + "/api/stats/scoring").then(r => r.json()).then(setScoringStats).catch(() => {});
    }
  }, [tab]);

  const activateHelius = () => {
    if (!heliusKey.trim()) return;
    setHeliusKey(heliusKey.trim());
    setRpcIdx(0);
    startSmartWs(heliusKey.trim());
    setHeliusActive(true);
  };

  // ── Memoized scored tokens ────────────────────────────────────────
  const scored = useMemo(() => {
    return G.tokens.map(tok => {
      const md = getMintData(tok.mint);
      const ss = calcSnipeScore(tok, md);
      const vel = calcVelocity(md, tok.ts);
      const ageSec = (Date.now() - tok.ts) / 1000;
      const devBad = isDevBad(tok.dev);
      const pump = calcPumpTrend(tok.mint);
      const multi = calcMultiplier(tok.mint, tok.mc);
      return { tok, md, ss, vel, ageSec, devBad, pump, multi };
    }).sort((a, b) => {
      if (a.devBad !== b.devBad) return a.devBad ? 1 : -1;
      return b.ss.score - a.ss.score || a.ageSec - b.ageSec;
    });
  }, [G.tokens.length, G.tokens.map(t => t.mc + t.score).join(",")]);

  const filtered = scored.filter(({ ss, ageSec, devBad }) => {
    if (!showBL && devBad) return false;
    if (hideOld && ageSec > 300) return false;
    if (minScore > 0 && ss.score < minScore) return false;
    return true;
  });

  const snipeCount = scored.filter(x => x.ss.score >= 55 && !x.devBad).length;
  const blCount = [...devBlacklist.keys()].length;
  const hotCount = scored.filter(x => x.ss.score >= 75 && !x.devBad && x.ageSec < 60).length;
  const winners = scored.filter(x => x.multi.mult >= 5).sort((a, b) => b.multi.mult - a.multi.mult);
  const winnersCount = winners.length;
  const x10Count = scored.filter(x => x.multi.mult >= 10).length;

  const todayStr = today();

  const walletSummaries = SMART_WALLETS.map(wallet => {
    const port = walletPortfolio.get(wallet);
    const holdings = port
      ? [...port.entries()].map(([mint, p]) => {
          const liveTok = G.tokens.find((t: any) => t.mint === mint);
          const mcNow = liveTok ? liveTok.mc : p.mcEntry;
          const mult = p.mcEntry > 0 ? mcNow / p.mcEntry : 1;
          const othersIn = countOtherSmartBuyers(mint, wallet);
          return {
            mint,
            symbol: p.symbol,
            mcEntry: p.mcEntry,
            mcNow,
            mult: +mult.toFixed(2),
            sold: p.sold,
            ts: p.ts,
            soldTs: p.soldTs,
            othersIn,
            holdTimeSec: p.sold ? (p.soldTs - p.ts) / 1000 : (Date.now() - p.ts) / 1000,
          };
        }).sort((a: any, b: any) => b.ts - a.ts)
      : [];
    const totalBuys = holdings.length;
    const totalSold = holdings.filter((h: any) => h.sold).length;
    const totalHeld = totalBuys - totalSold;
    const bestMult = holdings.length ? Math.max(...holdings.map((h: any) => h.mult)) : 0;
    return { wallet, short: SMART_SHORT[wallet], holdings, totalBuys, totalSold, totalHeld, bestMult };
  }).sort((a, b) => b.totalBuys - a.totalBuys);

  const swByMint: Record<string, any> = {};
  for (const ev of G.smartEvents) {
    if (!swByMint[ev.mint]) swByMint[ev.mint] = { buys: [], sells: [], symbol: ev.symbol, mc: ev.mc };
    if (ev.action === "buy") swByMint[ev.mint].buys.push(ev);
    else swByMint[ev.mint].sells.push(ev);
    if (!ev.loading) { swByMint[ev.mint].symbol = ev.symbol; swByMint[ev.mint].mc = ev.mc; }
  }

  const swConvs = Object.entries(swByMint).map(([mint, d]) => {
    const nBuy = new Set(d.buys.map((e: any) => e.wallet)).size;
    const nSell = new Set(d.sells.map((e: any) => e.wallet)).size;
    let cls = "watch", sig = "1 WALLET", emoji = "👀";
    if (nSell >= 2) { cls = "selling"; sig = "SMART SELLING"; emoji = "🔴"; }
    else if (nBuy >= 3) { cls = "strong"; sig = "CONVOY 3+"; emoji = "🔥"; }
    else if (nBuy >= 2) { cls = "medium"; sig = "2 SMART IN"; emoji = "⚡"; }
    const allEvs = [...d.buys, ...d.sells].sort((a: any, b: any) => b.ts - a.ts);
    return {
      mint,
      symbol: d.symbol,
      nBuy,
      nSell,
      cls,
      sig,
      emoji,
      solIn: d.buys.reduce((s: number, e: any) => s + (e.sol || 0), 0),
      mc: d.mc,
      last: allEvs[0]?.ts || 0,
      events: allEvs.slice(0, 8),
    };
  }).sort((a, b) => (b.nBuy * 3 - b.nSell * 5) - (a.nBuy * 3 - a.nSell * 5));

  let feed = G.events;
  if (feedFilter.length) feed = feed.filter(e => feedFilter.includes(e.action));
  if (smartOnly) feed = feed.filter(e => SMART_SET.has(e.wallet));
  feed = feed.slice(0, 200);

  return (
    <>
      <style>{css}</style>
      <div className="app">

        {/* Alerts */}
        <div className="alerts">
          {alerts.map(a => a.smart ? (
            <div key={a.id} className="alert-pop" style={{ borderColor: "#4ade80" }}>
              <span className="alert-x" onClick={() => setAlerts(x => x.filter(y => y.id !== a.id))}>x</span>
              <div className="alert-title" style={{ color: "#4ade80" }}>SMART {a.smart.action.toUpperCase()} — {a.smart.dex || "DEX"}</div>
              <div className="alert-body">
                <b>{SMART_SHORT[a.smart.wallet] || short(a.smart.wallet)}</b>
                {" > "}{a.smart.loading ? <span className="loading-dots" /> : <b>{a.smart.symbol}</b>}
                {" "}{fSol(a.smart.sol)}{" "}{fmc(a.smart.mc)}
              </div>
            </div>
          ) : a.tok ? (
            <div key={a.id} className="alert-pop" style={{ borderColor: a.ss.rColor }}>
              <span className="alert-x" onClick={() => setAlerts(x => x.filter(y => y.id !== a.id))}>x</span>
              <div className="alert-title" style={{ color: a.ss.rColor }}>
                {a.ss.vemoji} {a.ss.verdict} — {a.tok.symbol}
                <span style={{ fontFamily: "'JetBrains Mono',monospace", marginLeft: 8 }}>{a.ss.rating.toFixed(1)}/10 {a.ss.rLabel}</span>
              </div>
              <div className="alert-body">
                Bundle {a.tok.pctW}% · {a.tok.bSlots}sl · {fmc(a.tok.mc)} · {fAgeShort(a.tok.ts)} fa
              </div>
            </div>
          ) : null)}
        </div>

        {/* Header */}
        <div className="hdr">
          <div className="logo">UDINIX <em>SENTINEL</em></div>
          <div className="hstats">
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div className={`dot${G.connected ? "" : G.reconnecting ? " y" : " off"}`} />
              <span className="mono">{G.connected ? "PUMP LIVE" : "OFF"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div className={`dot${G.smartConnected ? "" : G.smartReconnecting ? " y" : " off"}`} />
              <span className="mono">{G.smartConnected ? "SMART LIVE" : heliusActive ? "RETRY..." : "NO HELIUS"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: aiAgentOn ? "#a78bfa" : "#475569", boxShadow: aiAgentOn ? "0 0 8px #a78bfa" : "none", animation: aiAgentOn ? "pulse-c 1.5s infinite" : "none" }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: aiAgentOn ? "#a78bfa" : "#475569", fontFamily: "'JetBrains Mono',monospace", letterSpacing: 0.5 }}>UDINI AI</span>
            </div>
            <button onClick={toggleVoice} style={{ display: "flex", alignItems: "center", gap: 4, background: voiceOn ? "rgba(0,245,255,0.12)" : "rgba(100,116,139,0.1)", border: `1px solid ${voiceOn ? "rgba(0,245,255,0.5)" : "rgba(100,116,139,0.4)"}`, borderRadius: 4, padding: "3px 9px", cursor: "pointer", color: voiceOn ? "#00f5ff" : "#94a3b8", fontSize: 9, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 0.5, textTransform: "uppercase" }}>
              {voiceOn ? "🔊 VOX" : "🔇 MUTE"}
            </button>
            <div style={{ marginLeft: 4 }}><WalletMultiButton style={{ height: 24, fontSize: 9, padding: "2px 8px", background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 4, color: "#a78bfa", fontFamily: "'JetBrains Mono',monospace" }} /></div>
            {[
              { v: G.msgCount.toLocaleString(), l: "Logs" },
              { v: G.txParsed, l: "Parsed" },
              { v: G.txFailed, l: "Fail", r: G.txFailed > 5 },
              { v: G.parseQueue.length, l: "Queue" },
              { v: snipeCount, l: "Hot", g: true },
              { v: blCount, l: "Ban", r: blCount > 0 },
            ].map(s => (
              <div key={s.l} className="hs">
                <div className="hs-v" style={s.r ? { color: "#ef4444" } : s.g ? { color: "#22c55e" } : {}}>{s.v}</div>
                <div className="hs-l">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {[
            { id: "neural", label: "NEURAL", badge: scored.length },
            { id: "snipe", label: "SNIPE", badge: filtered.length, hot: hotCount > 0 },
            { id: "winners", label: "WINNERS", badge: winnersCount, hot: winnersCount > 0 },
            { id: "wallets", label: "WALLETS", badge: SMART_WALLETS.length },
            { id: "smart", label: "SMART", badge: G.smartEvents.length, hot: swConvs.some(x => x.nBuy >= 2) },
            { id: "feed", label: "FEED", badge: G.events.length },
            { id: "bl", label: "BLACKLIST", badge: blCount, danger: blCount > 0 },
            { id: "setup", label: "SETUP", badge: null },
          ].map(t => (
            <div key={t.id} className={`tab${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}{t.badge !== null && <span className={`tbadge${t.hot ? " hot" : ""}${t.danger ? " danger" : ""}`}>{t.badge}</span>}
            </div>
          ))}
        </div>

        <div className="body">

          {/* NEURAL TAB */}
          {tab === "neural" && (
            <div className="neural-db">
              <div className="neural-canvas-wrap">
                <div className="neural-ch">
                  <span className="neural-ch-title">🧠 NEURAL MAP</span>
                  <span style={{ fontSize: 9, color: "#475569" }}>nodi = token · dimensione = score · colore = trend · click per dettagli</span>
                  <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    {!voiceOn && <span style={{ fontSize: 9, color: "#f97316" }}>⚠ Attiva voce per Zero</span>}
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#38bdf8", fontWeight: 700 }}>{scored.length} LIVE</span>
                  </span>
                </div>
                <NeuralView scored={scored} onSelect={setNeuralSelected} />
              </div>

              {neuralSelected && (() => {
                const found = scored.find(s => s.tok.mint === neuralSelected);
                if (!found) return null;
                const { tok, ss, pump, multi } = found;
                return (
                  <div style={{ background: "#070916", border: `2px solid ${ss.vcolor}44`, borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span className="tsym" style={{ fontSize: 18 }}>{tok.symbol}</span>
                      <span style={{ fontSize: 11, color: "#64748b" }}>{tok.name}</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 800, color: "#38bdf8" }}>{fmc(tok.mc)}</span>
                      <span style={{ background: ss.vcolor + "18", border: `1px solid ${ss.vcolor}55`, color: ss.vcolor, borderRadius: 5, padding: "2px 8px", fontWeight: 700, fontSize: 11 }}>{ss.vemoji} {ss.verdict}</span>
                      {multi.label && <span style={{ background: multi.color + "22", border: `1px solid ${multi.color}`, color: multi.color, borderRadius: 5, padding: "2px 8px", fontWeight: 800, fontSize: 12 }}>{multi.label}</span>}
                      <span style={{ fontSize: 9, fontWeight: 700, color: pump.color, background: pump.color + "18", padding: "2px 6px", borderRadius: 4 }}>{pump.label}</span>
                      <CopyBtn text={tok.mint} />
                      <button onClick={() => setNeuralSelected(null)} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#475569", cursor: "pointer", fontSize: 16 }}>✕</button>
                    </div>
                    <div style={{ display: "flex", gap: 14, fontSize: 11, flexWrap: "wrap", marginTop: 7 }}>
                      <span style={{ color: "#64748b" }}>Bundle: <b style={{ color: "#38bdf8", fontFamily: "'JetBrains Mono',monospace" }}>{tok.pctW}%</b></span>
                      <span style={{ color: "#64748b" }}>Bonding: <b style={{ color: "#38bdf8", fontFamily: "'JetBrains Mono',monospace" }}>{tok.bonding}%</b></span>
                      <span style={{ color: "#64748b" }}>Score: <b style={{ color: ss.rColor, fontFamily: "'JetBrains Mono',monospace" }}>{ss.rating.toFixed(1)}/10</b></span>
                      <span style={{ color: "#64748b" }}>Smart IN: <b style={{ color: "#4ade80", fontFamily: "'JetBrains Mono',monospace" }}>{tok.swBuy}</b></span>
                    </div>
                  </div>
                );
              })()}

              <div className="neural-panels">
                {/* UDINI AI panel */}
                <div className="neural-zero-panel">
                  <div className="nzero-hdr">
                    <span>🤖 UDINI</span>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a78bfa", boxShadow: "0 0 8px #a78bfa", display: "inline-block", animation: "pulse-c 1.5s infinite", flexShrink: 0 }} />
                    {(aiAgentOn && aiAgentState.running) || ptt.status === "thinking" ? <span style={{ fontSize: 8, color: "#facc15" }}>{ptt.status === "thinking" ? "penso" : "analizzando"}<span className="loading-dots" /></span> : null}
                    <span style={{ marginLeft: "auto", fontSize: 8, color: "#a78bfa", fontFamily: "'JetBrains Mono',monospace" }}>{voiceOn ? "🔊 voce attiva" : "VOX OFF"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0" }}>
                    <button
                      onMouseDown={startPushToTalk} onMouseUp={stopPushToTalk} onMouseLeave={stopPushToTalk}
                      onTouchStart={(e) => { e.preventDefault(); startPushToTalk(); }} onTouchEnd={(e) => { e.preventDefault(); stopPushToTalk(); }}
                      style={{
                        flex: 1, padding: "10px 14px", borderRadius: 9, border: `1px solid ${ptt.active ? "#a78bfa" : "#2a2a45"}`,
                        background: ptt.active ? "#a78bfa22" : "#0d0d1a", color: ptt.active ? "#c4b5fd" : "#94a3b8",
                        fontSize: 11, fontWeight: 700, cursor: "pointer", userSelect: "none", WebkitUserSelect: "none",
                        transition: "all .15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      }}>
                      {ptt.active ? "🎙 ASCOLTO... rilascia per inviare" : ptt.status === "thinking" ? "🤔 Udini sta pensando..." : "🎙 TIENI PREMUTO E PARLA"}
                    </button>
                    <button onClick={() => setShowTextInput(v => !v)} style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid #2a2a45", background: "#0d0d1a", color: "#64748b", fontSize: 11, cursor: "pointer" }}>⌨️</button>
                  </div>
                  {ptt.transcript && ptt.active && (
                    <div style={{ fontSize: 10, color: "#a78bfa", fontStyle: "italic", margin: "0 0 6px", padding: "4px 8px", background: "#a78bfa11", borderRadius: 6 }}>
                      "{ptt.transcript}"
                    </div>
                  )}
                  {ptt.status === "unsupported" && (
                    <div style={{ fontSize: 10, color: "#fb923c", margin: "0 0 6px" }}>
                      Microfono non disponibile su questo browser — usa la chat scritta qui sotto.
                    </div>
                  )}
                  {showTextInput && (
                    <div style={{ display: "flex", gap: 6, margin: "0 0 8px" }}>
                      <input
                        value={textQuestion} onChange={e => setTextQuestion(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") askUdiniText(); }}
                        placeholder="Scrivi a Udini: dove entro? devo uscire da X?"
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 7, border: "1px solid #2a2a45", background: "#0a0a14", color: "#e2e8f0", fontSize: 11, outline: "none" }}
                      />
                      <button onClick={askUdiniText} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid #a78bfa55", background: "#a78bfa22", color: "#c4b5fd", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Invia</button>
                    </div>
                  )}

                  <div className="nzero-wave">
                    {[...Array(20)].map((_, i) => (
                      <div key={i} className="nzero-bar" style={{ animationDelay: `${i * 0.06}s`, animationPlayState: aiAgentOn ? "running" : "paused", height: aiAgentOn ? undefined : "2px", opacity: aiAgentOn ? undefined : 0.15 }} />
                    ))}
                  </div>
                  <div className="nzero-text">
                    {aiAgentState.lastText
                      ? <span>"{aiAgentState.lastText}"</span>
                      : <span style={{ color: "#1e3a5f", fontStyle: "normal", fontSize: 11 }}>
                          Tieni premuto il tasto sopra e fai una domanda a voce · oppure usa la chat scritta · analisi automatica ogni 30s
                        </span>
                    }
                  </div>
                  {aiAgentState.history.length > 0 && (
                    <div className="nzero-hist-list">
                      {aiAgentState.history.slice(0, 4).map((h: any, i: number) => (
                        <div key={i} className="nzero-hist">
                          <span style={{ color: "#334155" }}>{new Date(h.ts).toLocaleTimeString()} </span>
                          {h.question && <span style={{ color: "#a78bfa" }}>[{h.question.slice(0, 30)}] </span>}
                          {h.text.slice(0, 110)}{h.text.length > 110 ? "…" : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Live events stream */}
                <div className="neural-live-panel">
                  <div className="nlive-hdr">
                    ⚡ LIVE STREAM
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#38bdf8", fontSize: 11 }}>{G.msgCount.toLocaleString()}</span>
                    <span style={{ marginLeft: "auto", fontSize: 8, color: "#475569" }}>eventi pump.fun</span>
                  </div>
                  <div className="nlive-events">
                    {G.events.slice(0, 60).map((ev: any, i: number) => (
                      <div key={i} className="nlive-row">
                        <span className={ev.action} style={{ width: 12, textAlign: "center", flexShrink: 0 }}>{ev.action === "buy" ? "▲" : ev.action === "sell" ? "▼" : "✦"}</span>
                        <span className="nlive-sym">{ev.symbol || short(ev.mint)}</span>
                        <span style={{ color: "#64748b" }}>{fSol(ev.sol)}</span>
                        {SMART_SET.has(ev.wallet) && <span className="pill g" style={{ fontSize: 7, padding: "1px 3px", flexShrink: 0 }}>SW</span>}
                        <span className="nlive-mc">{ev.mc > 0 ? fmc(ev.mc) : ""}</span>
                      </div>
                    ))}
                    {G.events.length === 0 && <div style={{ padding: "20px", fontSize: 10, color: "#334155", textAlign: "center" }}>In attesa eventi pump.fun...</div>}
                  </div>
                </div>

                {/* Smart wallet signals */}
                <div className="neural-sw-panel">
                  <div className="nlive-hdr">
                    🎯 SMART SIGNALS
                    <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono',monospace", color: G.smartConnected ? "#4ade80" : "#ef4444", fontSize: 9 }}>{G.smartConnected ? "LIVE" : "OFF"}</span>
                  </div>
                  <div className="nlive-events">
                    {G.smartEvents.slice(0, 40).map((ev: any, i: number) => (
                      <div key={i} className="nlive-row">
                        <span className={ev.action} style={{ width: 12, textAlign: "center", flexShrink: 0 }}>{ev.action === "buy" ? "▲" : "▼"}</span>
                        <span style={{ fontSize: 8, color: "#64748b", flexShrink: 0, minWidth: 40 }}>{SMART_SHORT[ev.wallet] || short(ev.wallet)}</span>
                        <span className="nlive-sym">{ev.loading ? <span className="loading-dots" /> : ev.symbol}</span>
                        <span className="nlive-mc">{ev.mc > 0 ? fmc(ev.mc) : ""}</span>
                      </div>
                    ))}
                    {G.smartEvents.length === 0 && (
                      <div style={{ padding: "20px", fontSize: 10, color: "#334155", textAlign: "center" }}>
                        {G.smartConnected ? "Nessun segnale ancora..." : "Connetti Helius in SETUP →"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SNIPE TAB */}
          {tab === "snipe" && (<>
            <div className="srow">
              <div className="sc g"><div className="sc-v">{scored.filter(x => x.ss.score >= 75 && !x.devBad).length}</div><div className="sc-l">SNIPE IT</div></div>
              <div className="sc b"><div className="sc-v">{scored.filter(x => x.ss.score >= 55 && x.ss.score < 75 && !x.devBad).length}</div><div className="sc-l">ENTRA</div></div>
              <div className="sc y"><div className="sc-v">{scored.filter(x => x.ss.score >= 40 && x.ss.score < 55).length}</div><div className="sc-l">WATCH</div></div>
              <div className="sc r"><div className="sc-v">{scored.filter(x => x.devBad).length}</div><div className="sc-l">DEV BAN</div></div>
              <div className="sc w"><div className="sc-v">{G.tokens.length}</div><div className="sc-l">TOTALE</div></div>
            </div>

            <div className="fbar">
              <span style={{ fontSize: 8, color: "#475569", textTransform: "uppercase", letterSpacing: ".4px" }}>Min score:</span>
              {([[0, "Tutti"], [40, "40+"], [55, "55+"], [75, "75+"]] as const).map(([v, l]) => (
                <button key={v} className={`fbtn${minScore === v ? " on" : ""}`} onClick={() => setMinScore(v)}>{l}</button>
              ))}
              <div className="sep" />
              <button className={`fbtn${hideOld ? " on" : ""}`} onClick={() => setHideOld(v => !v)}>Solo &lt;5min</button>
              <button className={`fbtn${showBL ? " on" : ""}`} onClick={() => setShowBL(v => !v)}>Mostra bannati</button>
            </div>

            {filtered.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">🎯</div>
                <div className="empty-t">{G.connected ? "In attesa di bundle freschi..." : "Connessione in corso..."}</div>
              </div>
            ) : (
              <div className="tcards">
                {filtered.slice(0, 60).map(({ tok, md, ss, vel, ageSec, devBad, pump, multi }, i) => {
                  const isOpen = open[tok.mint];
                  const mintEvs = G.events.filter((e: any) => e.mint === tok.mint).slice(0, 15);
                  const bkInfo = devBad ? devBlacklist.get(tok.dev) : null;
                  const rateColor = vel.rate >= 10 ? "#22c55e" : vel.rate >= 4 ? "#facc15" : "#ef4444";
                  const mx = ss.m;

                  return (
                    <div key={tok.mint} className={`tcard ${vcls(ss.verdict)}${devBad ? " bl" : ""}`}>
                      <div className="th" onClick={() => toggle(tok.mint)}>
                        <div className="sbadge" style={{ background: ss.vcolor + "15", border: `1px solid ${ss.vcolor}44`, color: ss.vcolor }}>
                          {ss.vemoji} {ss.verdict}
                        </div>
                        <div style={{ background: ss.rColor + "18", border: `1px solid ${ss.rColor}55`, borderRadius: 6, padding: "2px 8px", textAlign: "center", flexShrink: 0 }}>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 800, color: ss.rColor, lineHeight: 1 }}>{ss.rating.toFixed(1)}</div>
                          <div style={{ fontSize: 8, color: ss.rColor, opacity: 0.8, fontWeight: 700 }}>{ss.rLabel}</div>
                        </div>
                        {multi.label && (
                          <div style={{ background: multi.color + "22", border: `1px solid ${multi.color}`, borderRadius: 6, padding: "3px 9px", fontWeight: 800, fontSize: 13, color: multi.color, flexShrink: 0 }}>
                            {multi.label}
                          </div>
                        )}
                        <div>
                          <span className="tsym">{tok.symbol}</span>
                          {i === 0 && <span className="newbadge">NEW</span>}
                          {devBad && <span className="bl-badge" style={{ marginLeft: 4 }}>BAN</span>}
                          <div className="tname">{tok.name}</div>
                        </div>
                        {pump.trend > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: pump.color, background: pump.color + "18", padding: "2px 6px", borderRadius: 4 }}>{pump.label}</span>
                        )}
                        <span className="pill b">{tok.pctW}%</span>
                        {tok.bSlots > 0 && <span className="pill b">{tok.bSlots}sl</span>}
                        {mx.organicBuyers > 0 && <span className="pill g">{mx.organicBuyers}org</span>}
                        {tok.swBuy > 0 && <span className="pill g">SW{tok.swBuy}</span>}
                        {tok.swSell > 0 && <span className="pill r">SW-{tok.swSell}</span>}
                        {ss.bundlerSells && ss.bundlerSells.length > 0 && <span className="pill r">OUT{ss.bundlerSells.length}</span>}
                        {tok.replyCount > 0 && <span className="pill o">💬{tok.replyCount}</span>}
                        {tok.migrated && <span className="pill r">MIGRATO</span>}
                        <span className={acls(ageSec)}>{fAgeSec(tok.ts)}</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: rateColor }}>{vel.rate.toFixed(0)}tx/m</span>
                        <div className="tmeta">
                          <div style={{ minWidth: 72 }}>
                            <div className="tmc">{fmc(tok.mc)}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                              <div style={{ flex: 1, height: 3, background: "rgba(0,245,255,0.08)", borderRadius: 2, overflow: "hidden", width: 52 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, tok.bonding)}%`, background: tok.bonding >= 85 ? "#ef4444" : tok.bonding >= 60 ? "#facc15" : "#00f5ff", borderRadius: 2, transition: "width .4s", boxShadow: tok.bonding >= 85 ? "0 0 6px #ef4444" : "0 0 4px rgba(0,245,255,0.4)" }} />
                              </div>
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: tok.bonding >= 85 ? "#ef4444" : tok.bonding >= 60 ? "#facc15" : "#38bdf8", fontWeight: 700, flexShrink: 0 }}>{tok.bonding}%</span>
                            </div>
                          </div>
                          <span className="chev">{isOpen ? "^" : "v"}</span>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="tbody">
                          {ss.bundlerSells && ss.bundlerSells.length >= 2 && (
                            <div className="bsell-warn">
                              BUNDLER STANNO USCENDO ({ss.bundlerSells.length}) — PERICOLO IMMINENTE
                            </div>
                          )}

                          <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: 160, background: pump.color + "10", border: `1px solid ${pump.color}55`, borderRadius: 8, padding: "9px 11px" }}>
                              <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>Pump Trend</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: pump.color }}>{pump.label}</div>
                              <div style={{ display: "flex", gap: 10, marginTop: 5, fontSize: 9, flexWrap: "wrap" }}>
                                <span style={{ color: "#64748b" }}>MC: <b style={{ fontFamily: "'JetBrains Mono',monospace", color: pump.mcSlope >= 0 ? "#22c55e" : "#ef4444" }}>{pump.mcSlope >= 0 ? "+" : ""}{pump.mcSlope}%</b></span>
                                <span style={{ color: "#64748b" }}>Vol: <b style={{ fontFamily: "'JetBrains Mono',monospace", color: pump.volSlope >= 0 ? "#22c55e" : "#ef4444" }}>{pump.volSlope >= 0 ? "+" : ""}{pump.volSlope}/min</b></span>
                                <span style={{ color: "#64748b" }}>Bond: <b style={{ fontFamily: "'JetBrains Mono',monospace", color: pump.bondSlope >= 0 ? "#22c55e" : "#ef4444" }}>{pump.bondSlope >= 0 ? "+" : ""}{pump.bondSlope}%/min</b></span>
                              </div>
                              {pump.history.length >= 2 && (
                                <div style={{ marginTop: 6 }}><Spark values={pump.history.map((h: any) => h.mc)} w={140} h={26} /></div>
                              )}
                            </div>
                            <div style={{ minWidth: 110, background: multi.color + "10", border: `1px solid ${multi.color}55`, borderRadius: 8, padding: "9px 11px", textAlign: "center" }}>
                              <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>Multiplo</div>
                              <div style={{ fontSize: 22, fontWeight: 800, color: multi.color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{multi.mult}x</div>
                              <div style={{ fontSize: 9, color: "#64748b", marginTop: 4 }}>da {fmc(multi.initialMc)}</div>
                            </div>
                          </div>

                          <div className="snpanel">
                            <div className="snhead">
                              <RatingBadge rating={ss.rating} rLabel={ss.rLabel} rColor={ss.rColor} score={ss.score} />
                              <div>
                                <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2 }}>VERDICT</div>
                                <div className="snverdict" style={{ borderColor: ss.vcolor, color: ss.vcolor, background: ss.vcolor + "10" }}>
                                  {ss.vemoji} {ss.verdict}
                                </div>
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 9, color: "#64748b", marginBottom: 4 }}>SNIPE SCORE</div>
                                <div style={{ height: 6, background: "#151d30", borderRadius: 3, overflow: "hidden", maxWidth: 200 }}>
                                  <div style={{ height: "100%", width: `${ss.score}%`, background: `linear-gradient(90deg,${ss.vcolor}55,${ss.vcolor})`, borderRadius: 3, transition: "width .5s" }} />
                                </div>
                                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#64748b", marginTop: 2 }}>{ss.score}/100</div>
                              </div>
                              {devBad && bkInfo && (
                                <div style={{ marginLeft: "auto", background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: 5, padding: "3px 7px", fontSize: 10, color: "#ef4444" }}>
                                  DEV BANNATO<br /><span style={{ opacity: 0.6, fontSize: 9 }}>{bkInfo.count}x dump</span>
                                </div>
                              )}
                            </div>
                            <div className="snflags">
                              {ss.flags.map((f: any, fi: number) => (
                                <div key={fi} className={`sf ${f.t}`}>{f.s}</div>
                              ))}
                            </div>
                          </div>

                          <div className="vel-row">
                            <span style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: ".3px" }}>VELOCITY</span>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", color: rateColor, fontWeight: 700, fontSize: 11 }}>{vel.rate.toFixed(0)} tx/min</span>
                            <div className="vel-bar-bg">
                              <div className="vel-bar-fill" style={{ width: `${Math.min(100, vel.rate * 5)}%`, background: rateColor }} />
                            </div>
                            <span style={{ color: "#334155", fontSize: 9 }}>{vel.l30s} in 30s</span>
                            <span style={{ color: "#334155", fontSize: 9 }}>{vel.l60s} in 60s</span>
                            <span style={{ color: "#334155", fontSize: 9 }}>@30s: {vel.t30}tx · @60s: {vel.t60}tx</span>
                          </div>

                          {/* Advanced analysis */}
                          <div className="adv-panel">
                            <div className="adv-title">ANALISI AVANZATA</div>
                            <div style={{ marginBottom: 7 }}>
                              <div style={{ fontSize: 9, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".3px" }}>Flusso SOL</div>
                              {[
                                { label: "Bundle SOL in", val: mx.bundleSolIn, c: "#38bdf8", max: Math.max(mx.bundleSolIn, mx.organicSolIn, 0.01) },
                                { label: "Organic SOL in", val: mx.organicSolIn, c: "#22c55e", max: Math.max(mx.bundleSolIn, mx.organicSolIn, 0.01) },
                                { label: "SOL out (sell)", val: mx.totalSolOut, c: "#ef4444", max: Math.max(mx.totalSolIn, 0.01) },
                              ].map(b => (
                                <div key={b.label} className="sol-bar-row">
                                  <span style={{ fontSize: 9, color: "#475569", minWidth: 92, textAlign: "right" }}>{b.label}</span>
                                  <div className="sol-bar-bg"><div className="sol-bar-fill" style={{ width: `${Math.min(100, (b.val / b.max) * 100)}%`, background: b.c }} /></div>
                                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: b.c, minWidth: 55, fontWeight: 600 }}>{b.val.toFixed(3)} SOL</span>
                                </div>
                              ))}
                              <div style={{ marginTop: 4, display: "flex", gap: 12, fontSize: 9, flexWrap: "wrap" }}>
                                <span style={{ color: "#475569" }}>Sell pressure: <b style={{ fontFamily: "'JetBrains Mono',monospace", color: mx.sellPressure > 0.5 ? "#ef4444" : mx.sellPressure > 0.25 ? "#f97316" : "#22c55e" }}>{(mx.sellPressure * 100).toFixed(0)}%</b></span>
                                <span style={{ color: "#475569" }}>Bundle exit: <b style={{ fontFamily: "'JetBrains Mono',monospace", color: mx.bundlerExitPct > 50 ? "#ef4444" : mx.bundlerExitPct > 20 ? "#f97316" : "#22c55e" }}>{mx.bundlerExitPct}%</b></span>
                                <span style={{ color: "#475569" }}>Bundle vol: <b style={{ fontFamily: "'JetBrains Mono',monospace", color: mx.bundleSolPct > 90 ? "#ef4444" : "#22c55e" }}>{mx.bundleSolPct}%</b></span>
                              </div>
                            </div>
                            <div style={{ height: 1, background: "#151d30", margin: "6px 0" }} />
                            <div>
                              <div style={{ fontSize: 9, color: "#475569", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".3px" }}>Holder breakdown</div>
                              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 5 }}>
                                {[
                                  { l: "Bundled", v: mx.bundledWallets, c: "#38bdf8" },
                                  { l: "Organic", v: mx.organicBuyers, c: "#22c55e" },
                                  { l: "Tot buyers", v: mx.allBuyWallets, c: "#94a3b8" },
                                  { l: "Watch oggi", v: (() => { const h = holderHistory.get(tok.mint); return h?.[todayStr]?.wallets.size || 0; })(), c: "#38bdf8" },
                                  { l: "Organic %", v: (mx.allBuyWallets > 0 ? Math.round((mx.organicBuyers / mx.allBuyWallets) * 100) : 0) + "%", c: mx.allBuyWallets > 0 && (mx.organicBuyers / mx.allBuyWallets) > 0.4 ? "#22c55e" : "#facc15" },
                                  { l: "Rate /min", v: mx.holderRateEarly, c: mx.holderRateEarly >= 5 ? "#22c55e" : "#facc15" },
                                ].map(x => (
                                  <div key={x.l} className="hbox">
                                    <div className="hbox-v" style={{ color: x.c }}>{x.v}</div>
                                    <div className="hbox-l">{x.l}</div>
                                  </div>
                                ))}
                              </div>
                              {ageSec > 120 && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, flexWrap: "wrap" }}>
                                  <span style={{ color: "#475569" }}>Holder accel:</span>
                                  <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#64748b" }}>{mx.holderRateEarly}/min → {mx.holderRateLate}/min</span>
                                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                                    color: mx.holderAccel > 2 ? "#22c55e" : mx.holderAccel < -3 ? "#ef4444" : "#64748b" }}>
                                    {mx.holderAccel > 0 ? "+" : ""}{mx.holderAccel}/min {mx.holderAccel > 2 ? "ACCELERA" : mx.holderAccel < -3 ? "rallenta" : "stabile"}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mrow">
                            {[
                              { v: `${tok.pctW}%`, l: "Bundled", c: tok.pctW >= 40 ? "#22c55e" : "#facc15" },
                              { v: tok.bSlots, l: "Slot", c: "#38bdf8" },
                              { v: tok.swBuy, l: "SW buy", c: "#22c55e" },
                              { v: tok.swSell, l: "SW sell", c: tok.swSell > 0 ? "#ef4444" : "#334155" },
                              { v: `${tok.bonding}%`, l: "Bonding", c: tok.bonding >= 70 ? "#ef4444" : "#38bdf8" },
                              { v: vel.t30, l: "Tx @30s", c: vel.t30 >= 5 ? "#22c55e" : "#64748b" },
                              { v: vel.t60, l: "Tx @60s", c: vel.t60 >= 10 ? "#22c55e" : "#64748b" },
                              { v: fmc(tok.mc), l: "Mkt cap", c: "#94a3b8" },
                            ].map(m => (
                              <div key={m.l} className="met">
                                <div className="met-v" style={{ color: m.c }}>{m.v}</div>
                                <div className="met-l">{m.l}</div>
                              </div>
                            ))}
                          </div>

                          <div className="dev-row">
                            <span className="addrl">Mint: {short(tok.mint)}</span>
                            <CopyBtn text={tok.mint} />
                            <span className="addrl">Dev: {short(tok.dev)}</span>
                            <span className="addrl">{fSol(tok.solDev)}</span>
                            {tok.devSold && <span className="devdump">DEV SOLD</span>}
                            {devBad && <span className="bl-badge">BAN ({devBlacklist.get(tok.dev)?.count}x)</span>}
                            <a className="plink" href={`https://pump.fun/${tok.mint}`} target="_blank" rel="noreferrer">pump.fun</a>
                          </div>

                          {mintEvs.length > 0 && (
                            <table className="ttbl">
                              <thead><tr><th>Ora</th><th>Az</th><th>Wallet</th><th>SOL</th><th>Slot</th><th>Tag</th></tr></thead>
                              <tbody>
                                {mintEvs.map((ev: any) => {
                                  const inBundle = Object.values(md.bundleSlots).some((set: any) => set.size >= 2 && set.has(ev.wallet));
                                  const isBundlerSell = ev.action === "sell" && inBundle;
                                  return (
                                    <tr key={ev.sig} className={isBundlerSell ? "br" : ""}>
                                      <td>{new Date(ev.ts).toLocaleTimeString()}</td>
                                      <td className={ev.action}>{ev.action === "buy" ? "BUY" : ev.action === "sell" ? "SELL" : "NEW"}</td>
                                      <td>{SMART_SET.has(ev.wallet) && <span className="star">* </span>}<span className="addrl">{short(ev.wallet)}</span></td>
                                      <td style={{ color: "#94a3b8" }}>{ev.sol.toFixed(4)}</td>
                                      <td style={{ color: "#334155" }}>{ev.slot}</td>
                                      <td style={{ fontSize: 9 }}>
                                        {isBundlerSell && <span style={{ color: "#ef4444", fontWeight: 700 }}>BUNDLER OUT</span>}
                                        {inBundle && ev.action === "buy" && <span style={{ color: "#38bdf8" }}>bundled</span>}
                                        {SMART_SET.has(ev.wallet) && <span style={{ color: "#fbbf24" }}>smart</span>}
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
          {tab === "winners" && (<>
            <div style={{ marginBottom: 9, padding: 9, background: "#070916", borderRadius: 8, border: "1px solid #1e3a5f", fontSize: 11, color: "#94a3b8" }}>
              Multiplo calcolato dal MC al momento del bundle/creazione fino a ORA, in tempo reale. Solo token con almeno <b style={{ color: "#22c55e" }}>x5</b>.
            </div>
            <div className="srow">
              <div className="sc g"><div className="sc-v">{x10Count}</div><div className="sc-l">x10+</div></div>
              <div className="sc b"><div className="sc-v">{winnersCount}</div><div className="sc-l">x5+ totali</div></div>
              <div className="sc y"><div className="sc-v">{winners.filter(w => w.pump.trend >= 60).length}</div><div className="sc-l">Ancora salendo</div></div>
              <div className="sc r"><div className="sc-v">{winners.filter(w => w.pump.trend < 30).length}</div><div className="sc-l">Crollati</div></div>
            </div>
            {winners.length === 0 ? (
              <div className="empty"><div className="empty-icon">🏆</div><div className="empty-t">Nessun token ha ancora fatto x5</div></div>
            ) : (
              <div className="tcards">
                {winners.map(({ tok, ss, pump, multi }) => {
                  const isOpen = open["w_" + tok.mint];
                  return (
                    <div key={tok.mint} className="tcard" style={{ borderLeft: `3px solid ${multi.color}` }}>
                      <div className="th" onClick={() => toggle("w_" + tok.mint)}>
                        <div style={{ background: multi.color + "22", border: `1px solid ${multi.color}`, borderRadius: 6, padding: "4px 10px", fontWeight: 800, fontSize: 16, color: multi.color, fontFamily: "'JetBrains Mono',monospace" }}>
                          {multi.mult}x
                        </div>
                        <div>
                          <span className="tsym">{tok.symbol}</span>
                          <div className="tname">{tok.name}</div>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: pump.color, background: pump.color + "18", padding: "2px 6px", borderRadius: 4 }}>{pump.label}</span>
                        <span className="pill b">{tok.pctW}% bundle</span>
                        {tok.swBuy > 0 && <span className="pill g">SW{tok.swBuy}</span>}
                        <div className="tmeta">
                          <div>
                            <div className="tmc">{fmc(tok.mc)}</div>
                            <div className="tinfo">da {fmc(multi.initialMc)} — {fAgeShort(tok.ts)} fa</div>
                          </div>
                          <span className="chev">{isOpen ? "^" : "v"}</span>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="tbody">
                          <div style={{ marginTop: 9, background: "#04060e", border: "1px solid #151d30", borderRadius: 8, padding: "10px 12px" }}>
                            <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 6 }}>Crescita MC nel tempo</div>
                            {pump.history.length >= 2 && <Spark values={pump.history.map((h: any) => h.mc)} w={260} h={50} />}
                            <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10, flexWrap: "wrap" }}>
                              <span style={{ color: "#64748b" }}>MC iniziale: <b style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace" }}>{fmc(multi.initialMc)}</b></span>
                              <span style={{ color: "#64748b" }}>MC ora: <b style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace" }}>{fmc(tok.mc)}</b></span>
                              <span style={{ color: "#64748b" }}>Trend MC: <b style={{ color: pump.mcSlope >= 0 ? "#22c55e" : "#ef4444", fontFamily: "'JetBrains Mono',monospace" }}>{pump.mcSlope >= 0 ? "+" : ""}{pump.mcSlope}%</b></span>
                            </div>
                          </div>
                          <div className="dev-row">
                            <span className="addrl">Mint: {short(tok.mint)}</span>
                            <CopyBtn text={tok.mint} />
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
          {tab === "wallets" && (<>
            <div style={{ marginBottom: 9, padding: 9, background: "#070916", borderRadius: 8, border: "1px solid #1e3a5f", fontSize: 11, color: "#94a3b8" }}>
              Per ogni smart wallet: cosa ha comprato, a che MC, se tiene o ha venduto, e se altri smart wallet sono entrati sullo stesso token.
            </div>
            <div className="tcards">
              {walletSummaries.map(w => {
                const isOpen = open["wlt_" + w.wallet];
                return (
                  <div key={w.wallet} className="tcard" style={{ borderLeft: w.totalBuys > 0 ? "3px solid #38bdf8" : "3px solid #151d30" }}>
                    <div className="th" onClick={() => toggle("wlt_" + w.wallet)}>
                      <div>
                        <span className="tsym" style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}>{w.short}</span>
                        <div className="tname">{w.totalBuys} buy totali</div>
                      </div>
                      <span className="pill g">{w.totalHeld} held</span>
                      {w.totalSold > 0 && <span className="pill r">{w.totalSold} sold</span>}
                      {w.bestMult >= 2 && <span className="pill o">best {w.bestMult}x</span>}
                      <div className="tmeta">
                        <span className="chev">{isOpen ? "^" : "v"}</span>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="tbody">
                        {w.holdings.length === 0 ? (
                          <div style={{ fontSize: 11, color: "#475569", padding: "8px 0" }}>Nessun acquisto rilevato ancora.</div>
                        ) : (
                          <table className="ttbl" style={{ marginTop: 8 }}>
                            <thead><tr><th>Token</th><th>MC entry</th><th>MC ora</th><th>Mult</th><th>Stato</th><th>Altri SW</th><th>Tempo</th></tr></thead>
                            <tbody>
                              {w.holdings.map((h: any) => (
                                <tr key={h.mint}>
                                  <td style={{ fontWeight: 700, color: "#e2e8f0" }}>{h.symbol}</td>
                                  <td style={{ color: "#64748b" }}>{fmc(h.mcEntry)}</td>
                                  <td style={{ color: "#94a3b8" }}>{fmc(h.mcNow)}</td>
                                  <td style={{ fontWeight: 700, color: h.mult >= 2 ? "#22c55e" : h.mult < 0.8 ? "#ef4444" : "#facc15" }}>{h.mult}x</td>
                                  <td>{h.sold ? <span style={{ color: "#ef4444", fontWeight: 700 }}>VENDUTO</span> : <span style={{ color: "#22c55e", fontWeight: 700 }}>TIENE</span>}</td>
                                  <td style={{ color: h.othersIn > 0 ? "#38bdf8" : "#334155", fontWeight: h.othersIn > 0 ? 700 : 400 }}>{h.othersIn > 0 ? `+${h.othersIn}` : "—"}</td>
                                  <td style={{ color: "#475569" }}>{fAgeShort(Date.now() - h.holdTimeSec * 1000)}</td>
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
          {tab === "smart" && (<>
            {!heliusActive && (
              <div style={{ background: "#070916", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: 11, color: "#94a3b8" }}>
                Senza Helius i smart wallet vengono visti solo su pump.fun. Aggiungi la chiave nel tab SETUP.
              </div>
            )}
            <div className="srow">
              <div className="sc g"><div className="sc-v">{swConvs.filter(x => x.nBuy >= 3).length}</div><div className="sc-l">CONVOY</div></div>
              <div className="sc b"><div className="sc-v">{swConvs.filter(x => x.nBuy === 2).length}</div><div className="sc-l">2 SMART</div></div>
              <div className="sc r"><div className="sc-v">{swConvs.filter(x => x.nSell >= 2).length}</div><div className="sc-l">SELLING</div></div>
              <div className="sc w"><div className="sc-v">{G.smartEvents.length}</div><div className="sc-l">EVENTS</div></div>
            </div>
            {swConvs.length > 0 && (
              <div className="sgrid" style={{ marginBottom: 10 }}>
                {swConvs.slice(0, 12).map(row => (
                  <div key={row.mint} className={`scard ${row.cls}`}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                      <span style={{ fontSize: 16 }}>{row.emoji}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{row.symbol === "..." ? <span className="loading-dots" /> : row.symbol}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: row.cls === "strong" ? "#22c55e" : row.cls === "selling" ? "#ef4444" : "#facc15" }}>{row.sig}</div>
                        <div style={{ fontSize: 9, color: "#64748b" }}>{fAgeShort(row.last)} fa -- {fmc(row.mc)}</div>
                      </div>
                      <div style={{ marginLeft: "auto", display: "flex", gap: 3, flexWrap: "wrap" }}>
                        <span className="pill g">{row.nBuy}B</span>
                        {row.nSell > 0 && <span className="pill r">{row.nSell}S</span>}
                        <span className="pill b">{fSol(row.solIn)}</span>
                      </div>
                    </div>
                    <table className="ttbl">
                      <thead><tr><th>Ora</th><th>Az</th><th>Wallet</th><th>SOL</th></tr></thead>
                      <tbody>
                        {row.events.map((ev: any, i: number) => (
                          <tr key={i}>
                            <td>{new Date(ev.ts).toLocaleTimeString()}</td>
                            <td className={ev.action === "buy" ? "buy" : "sell"}>{ev.action === "buy" ? "BUY" : "SELL"}</td>
                            <td className="addrl">{SMART_SHORT[ev.wallet] || short(ev.wallet)}</td>
                            <td style={{ color: "#94a3b8" }}>{(ev.sol || 0).toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                      <a className="plink" href={`https://pump.fun/${row.mint}`} target="_blank" rel="noreferrer">pump.fun</a>
                      <CopyBtn text={row.mint} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 8, color: "#475569", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>Feed cronologico smart wallet</div>
            <div style={{ background: "#070916", border: "1px solid #151d30", borderRadius: 8, overflow: "hidden" }}>
              {G.smartEvents.length === 0 ? (
                <div className="empty" style={{ border: "none" }}><div className="empty-icon">🧠</div><div className="empty-t">Nessuna attivita smart wallet</div></div>
              ) : G.smartEvents.map((ev: any, i: number) => (
                <div key={i} className="sfeed-row">
                  <span style={{ width: 45, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: ev.action === "buy" ? "#22c55e" : "#ef4444" }}>{ev.action === "buy" ? "BUY" : "SELL"}</span>
                  <span style={{ fontWeight: 700, minWidth: 50, fontSize: 11 }}>{ev.loading ? <span className="loading-dots" /> : ev.symbol}</span>
                  <span className="addrl" style={{ minWidth: 60 }}>{SMART_SHORT[ev.wallet] || short(ev.wallet)}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", minWidth: 55, color: "#94a3b8", fontSize: 10 }}>{fSol(ev.sol)}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#64748b", minWidth: 55 }}>{fmc(ev.mc)}</span>
                  {ev.dex && <span className="dex-tag">{ev.dex}</span>}
                  <span style={{ fontSize: 10, color: "#475569", marginLeft: "auto" }}>{fAgeShort(ev.ts)}</span>
                </div>
              ))}
            </div>
          </>)}

          {/* FEED TAB */}
          {tab === "feed" && (<>
            <div className="ffilters">
              {["buy", "sell", "create"].map(f => (
                <button key={f} className={`fbtn${feedFilter.includes(f) ? " on" : ""}`}
                  onClick={() => setFeedFilter(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f])}>
                  {f === "buy" ? "BUY" : f === "sell" ? "SELL" : "CREATE"}
                </button>
              ))}
              <button className={`fbtn${smartOnly ? " on" : ""}`} onClick={() => setSmartOnly(v => !v)}>Smart only</button>
              <span style={{ marginLeft: "auto", fontSize: 9, color: "#334155" }}>{feed.length} eventi</span>
            </div>
            {feed.length === 0 ? (
              <div className="empty"><div className="empty-icon">📡</div><div className="empty-t">Nessun evento</div></div>
            ) : (
              <table className="ttbl">
                <thead><tr><th>Ora</th><th>Az</th><th>Token</th><th>Wallet</th><th>SOL</th><th>MCap</th></tr></thead>
                <tbody>
                  {feed.map((ev: any) => (
                    <tr key={ev.sig}>
                      <td>{new Date(ev.ts).toLocaleTimeString()}</td>
                      <td className={ev.action}>{ev.action === "buy" ? "BUY" : ev.action === "sell" ? "SELL" : "NEW"}</td>
                      <td>{ev.symbol ? <span style={{ fontWeight: 700, color: "#00f5ff", fontFamily: "'JetBrains Mono',monospace" }}>{ev.symbol}</span> : <span className="addrl">{short(ev.mint)}</span>}</td>
                      <td>{SMART_SET.has(ev.wallet) && <span className="star">★ </span>}<span className="addrl">{short(ev.wallet)}</span></td>
                      <td style={{ color: "#94a3b8" }}>{ev.sol.toFixed(4)}</td>
                      <td style={{ color: "#38bdf8", fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{ev.mc > 0 ? fmc(ev.mc) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>)}

          {/* BLACKLIST TAB */}
          {tab === "bl" && (<>
            <div style={{ marginBottom: 9, padding: 8, background: "#1a0a0a", borderRadius: 8, border: "1px solid #7f1d1d", fontSize: 11, color: "#f87171" }}>
              Dev bannati automaticamente quando vendono entro 5 minuti dalla creazione.
            </div>
            {devBlacklist.size === 0 ? (
              <div className="empty"><div className="empty-icon">🚫</div><div className="empty-t">Nessun dev bannato</div></div>
            ) : (
              <table className="bl-table">
                <thead><tr><th>Dev wallet</th><th>Dump</th><th>Motivo</th><th>Ultimo</th></tr></thead>
                <tbody>
                  {[...devBlacklist.entries()].sort((a: any, b: any) => b[1].count - a[1].count).map(([dev, info]: any) => (
                    <tr key={dev}>
                      <td style={{ color: "#ef4444" }}>{short(dev)}</td>
                      <td style={{ color: "#ef4444", fontWeight: 700 }}>{info.count}x</td>
                      <td style={{ color: "#94a3b8", fontSize: 10 }}>{info.reason}</td>
                      <td style={{ color: "#475569", fontSize: 10 }}>{fAgeShort(info.lastSeen)} fa</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>)}

          {/* SETUP TAB */}
          {tab === "setup" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "#070916", border: "1px solid #1e3a5f", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8", marginBottom: 4 }}>🤖 Zero — AI Agent</div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, lineHeight: 1.6 }}>
                  Zero analizza i token live ogni <b style={{ color: "#e2e8f0" }}>30 secondi</b> e ti fa un recap parlato in italiano, stile trader.
                  Usa <b style={{ color: "#38bdf8" }}>Pollinations AI</b> — completamente gratuito, nessuna API key richiesta.
                  <br />Attiva la voce e poi premi <b style={{ color: "#e2e8f0" }}>🤖 ZERO</b> nell'header per partire.
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={toggleAiAgent} style={{ background: aiAgentOn ? "#1e3a5f" : "#070916", border: `1px solid ${aiAgentOn ? "#38bdf8" : "#1e3a5f"}`, borderRadius: 6, padding: "5px 14px", cursor: "pointer", color: aiAgentOn ? "#38bdf8" : "#475569", fontSize: 11, fontWeight: 700 }}>
                    {aiAgentOn ? "Zero ATTIVO — clicca per spegnere" : "Attiva Zero"}
                  </button>
                  {aiAgentOn && <span style={{ fontSize: 10, color: "#4ade80" }}>✓ Parla ogni 30s</span>}
                </div>
                {aiAgentState.lastText && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", fontStyle: "italic", borderLeft: "2px solid #38bdf8", paddingLeft: 8 }}>
                    Ultimo recap: "{aiAgentState.lastText}"
                  </div>
                )}
              </div>

              <div style={{ background: "#070916", border: "1px solid #1e3a5f", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8", marginBottom: 4 }}>Helius API Key</div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, lineHeight: 1.6 }}>
                  Una chiave, due usi: (1) traccia i smart wallet su tutti i DEX — Raydium, Jupiter, Orca, pump.fun;
                  (2) diventa l'RPC primario per leggere le transazioni, molto più stabile dei nodi pubblici gratuiti.
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input className="helius-input" placeholder="Incolla la tua Helius API key..."
                    value={heliusKey} onChange={e => setHeliusKey(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && activateHelius()} />
                  <button className="helius-btn" onClick={activateHelius}>Attiva</button>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div className={`dot${G.smartConnected ? "" : G.smartReconnecting ? " y" : " off"}`} />
                    <span style={{ fontSize: 10, color: "#475569" }}>{G.smartConnected ? "Connesso — WS smart + RPC su Helius" : heliusActive ? "Connessione..." : "Non attivo"}</span>
                  </div>
                </div>
                {G.txFailed > 30 && !heliusActive && (
                  <div style={{ marginTop: 8, fontSize: 10, color: "#f87171", background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: 5, padding: "5px 8px" }}>
                    {G.txFailed} transazioni fallite — probabile rate-limit sugli RPC pubblici. Attiva Helius qui sopra per risolvere.
                  </div>
                )}
              </div>

              {wallet.connected && (
                <div style={{ background: "#070916", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>⚡ Auto-Sniper</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, lineHeight: 1.6 }}>
                    Comprerà automaticamente token che superano le soglie sotto. Wallet: <b style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{wallet.publicKey?.toBase58().slice(0, 8)}...</b>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <label style={{ fontSize: 10, color: "#475569", display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="checkbox" checked={sniperEnabled} onChange={e => setSniperEnabled(e.target.checked)} />
                      Attivo
                    </label>
                    <label style={{ fontSize: 10, color: "#475569" }}>Score min:
                      <input type="number" value={sniperMinScore} onChange={e => setSniperMinScore(+e.target.value)} style={{ width: 50, marginLeft: 4, background: "#0d0d1a", border: "1px solid #2a2a45", borderRadius: 3, padding: "2px 4px", color: "#e2e8f0", fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }} />
                    </label>
                    <label style={{ fontSize: 10, color: "#475569" }}>Max MC:
                      <input type="number" value={sniperMaxMc} onChange={e => setSniperMaxMc(+e.target.value)} style={{ width: 60, marginLeft: 4, background: "#0d0d1a", border: "1px solid #2a2a45", borderRadius: 3, padding: "2px 4px", color: "#e2e8f0", fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }} />
                    </label>
                    <label style={{ fontSize: 10, color: "#475569" }}>SOL:
                      <input type="number" step="0.01" value={sniperSolAmount} onChange={e => setSniperSolAmount(+e.target.value)} style={{ width: 55, marginLeft: 4, background: "#0d0d1a", border: "1px solid #2a2a45", borderRadius: 3, padding: "2px 4px", color: "#e2e8f0", fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }} />
                    </label>
                  </div>
                  {sniperEnabled && <div style={{ marginTop: 6, fontSize: 10, color: "#4ade80" }}>⚠ Sniper attivo — acquisti automatici in esecuzione</div>}
                </div>
              )}

              <div style={{ background: "#070916", border: "1px solid #151d30", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Smart Wallet monitorati ({SMART_WALLETS.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {SMART_WALLETS.map((w, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: "1px solid #151d30", fontSize: 10 }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#38bdf8", minWidth: 20 }}>{i + 1}.</span>
                      <span className="addrl" style={{ fontSize: 10, flex: 1 }}>{w}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: "#475569" }}>Per aggiornare i wallet modifica SMART_WALLETS nel codice.</div>
              </div>

              <div style={{ background: "#070916", border: "1px solid #1e3a5f", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8", marginBottom: 4 }}>📊 Scoring Performance</div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>Percentuali di successo dello scoring basate su dati storici (30 giorni).</div>
                {scoringStats.length === 0 ? (
                  <div style={{ fontSize: 10, color: "#475569" }}>Dati insufficienti (servono almeno 5 campioni per bracket).</div>
                ) : (
                  <table className="ttbl">
                    <thead><tr><th>Bracket</th><th>Campioni</th><th>Win Rate</th><th>Avg Multiplo</th></tr></thead>
                    <tbody>
                      {scoringStats.map((s: any) => (
                        <tr key={s.bracket}>
                          <td style={{ fontWeight: 700, color: "#e2e8f0" }}>{s.bracket}</td>
                          <td style={{ color: "#38bdf8" }}>{s.samples}</td>
                          <td style={{ color: (s.win_rate || 0) > 0.5 ? "#22c55e" : "#ef4444" }}>{((s.win_rate || 0) * 100).toFixed(0)}%</td>
                          <td style={{ color: "#22c55e" }}>{(s.avg_multiplier || 0).toFixed(1)}x</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="ftr">
          <span>{G.lastMsg ? `Ultimo: ${new Date(G.lastMsg).toLocaleTimeString()}` : "--"}</span>
          <span>|</span><span>Queue: {G.parseQueue.length}</span>
          <span>|</span><span>Fail: {G.txFailed}</span>
          <span>|</span><span>{G.smartConnected ? "Smart: LIVE" : "Smart: OFF"}</span>
          <span style={{ marginLeft: "auto" }}>RPC: {(() => { const l = getRpcHttpList(); return l[rpcIdx % l.length].replace("https://", "").split("/")[0]; })()}</span>
        </div>
      </div>
    </>
  );
}

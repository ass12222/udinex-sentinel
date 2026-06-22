import { aiAgentState, G } from "./state";
import { speak } from "./voice";
import type { SnapshotItem } from "./types";

// ─── AGENTE AI (ZERO) — Pollinations AI, gratuito, zero API key ───────────────
export async function runAiRecap(scoredSnapshot: any[], userQuestion?: string) {
  if (aiAgentState.running) return;
  aiAgentState.running = true;
  try {
    const top = scoredSnapshot.slice(0, 8).map(({ tok, ss, pump, multi }) => ({
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
      ageSec: Math.round((Date.now() - tok.ts) / 1000),
    }));

    const sysPrompt = userQuestion
      ? `Sei Udini, assistente vocale AI per trading di token Solana su pump.fun, specializzato in bundle-snipe. L'utente ti ha fatto una domanda diretta a voce. Ti arriva anche uno snapshot JSON dei token piu' rilevanti come contesto. Rispondi alla domanda dell'utente in modo diretto e breve (massimo 2-4 frasi), in italiano colloquiale, tono da trader esperto che parla con un amico. REGOLE: 1. Usa SEMPRE il campo "symbol" (es: "BONK") — NON pronunciare mai indirizzi o stringhe lunghe. 2. Se la domanda riguarda un token specifico che non e' nello snapshot, dillo onestamente: "non ho dati su quel token ora". 3. Se chiede "dove entro" o simile, suggerisci il token con verdict migliore tra quelli con bundlerSellCount basso e devSold false. 4. Se chiede "devo uscire" su qualcosa, controlla bundlerSellCount e devSold. Rispondi SOLO con testo da pronunciare, zero markdown, zero emoji, zero elenchi.`
      : `Sei Udini, assistente vocale AI per trading di token Solana su pump.fun, specializzato in bundle-snipe. Ti arriva uno snapshot JSON dei token piu' rilevanti. Devi fare un recap PARLATO molto breve (massimo 2-3 frasi), in italiano colloquiale, tono diretto come un trader esperto. REGOLE ASSOLUTE: 1. Usa SEMPRE il campo "symbol" del JSON (es: "BONK", "PEPE") — NON pronunciare mai indirizzi, codici esadecimali o stringhe lunghe. Se non c'e' symbol, dici solo "un token". 2. Ignora i token con score sotto 30 o con flag "TOKEN MORTO". 3. Se c'e' un token con verdict SNIPE IT o ENTRA, bundlerSellCount basso e devSold false: dillo subito con nome e mcap. 4. Se un bundler o dev sta vendendo su un token caldo: avvisa di uscire SUBITO con il nome del token. 5. Se tutto e' fermo: dillo in una frase. Rispondi SOLO con testo da pronunciare, zero markdown, zero emoji, zero elenchi.`;

    const userMsg = userQuestion
      ? `Domanda dell'utente: "${userQuestion}"\n\nSnapshot token ora (${new Date().toLocaleTimeString()}):\n${JSON.stringify(top, null, 0)}`
      : `Snapshot token ora (${new Date().toLocaleTimeString()}):\n${JSON.stringify(top, null, 0)}`;

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
      aiAgentState.history.unshift({
        ts: Date.now(),
        text,
        isReply: !!userQuestion,
        question: userQuestion || null,
      });
      if (aiAgentState.history.length > 30) aiAgentState.history.length = 30;
      speak(text);
      G.listeners.forEach(fn => fn());
    }
  } catch (e) {
    console.warn("[AI Agent] Errore:", e);
  } finally {
    aiAgentState.running = false;
    aiAgentState.lastRunAt = Date.now();
  }
}

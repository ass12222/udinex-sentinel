import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { saveEvent, saveSmartEvent, upsertBlacklist, upsertPortfolio, markPortfolioSold } from "./store";
import { sendAlertIfNeeded } from "./bot";

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
const SMART_SET = new Set(SMART_WALLETS);

const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const PUMP_V3 = "https://frontend-api-v3.pump.fun";
const RPC_WS_LIST = [
  "wss://solana.publicnode.com",
  "wss://api.mainnet-beta.solana.com",
];

interface ProxyClient {
  ws: WebSocket;
  id: string;
}

const clients: Map<string, ProxyClient> = new Map();

export function startWsProxy(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    const id = Math.random().toString(36).slice(2, 8);
    clients.set(id, { ws, id });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleClientMessage(id, msg);
      } catch {}
    });

    ws.on("close", () => clients.delete(id));
  });

  startPumpWs();
  console.log("[WS Proxy] Avviato su /ws");
}

function broadcast(data: any) {
  const msg = JSON.stringify(data);
  for (const [, client] of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
}

function handleClientMessage(_clientId: string, msg: any) {
  switch (msg.type) {
    case "token_update":
      broadcast(msg);
      break;
    case "event":
      saveEvent(msg.data);
      broadcast(msg);
      break;
    case "smart_event":
      saveSmartEvent(msg.data);
      if (msg.data.action === "buy") {
        upsertPortfolio(msg.data.wallet, msg.data.mint, msg.data.mc || 0, msg.data.symbol);
      } else {
        markPortfolioSold(msg.data.wallet, msg.data.mint);
      }
      broadcast(msg);
      break;
    case "blacklist":
      upsertBlacklist(msg.data.dev, msg.data.reason);
      break;
    case "scoring":
      sendAlertIfNeeded(msg.data.score, msg.data.symbol, msg.data.mc, msg.data.mint);
      break;
  }
}

// ─── WebSocket pump.fun (server-side) ───────────────────────────────────────
let pumpWs: WebSocket | null = null;
let pumpReconnectAttempts = 0;

function startPumpWs() {
  const url = RPC_WS_LIST[0];
  try {
    pumpWs = new WebSocket(url);
    pumpWs.onopen = () => {
      pumpReconnectAttempts = 0;
      pumpWs?.send(JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "logsSubscribe",
        params: [{ mentions: [PUMP_PROGRAM] }, { commitment: "processed" }],
      }));
    };

    pumpWs.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data as string);
        if (d.method !== "logsNotification") return;
        const sig = d.params.result.value.signature;
        const slot = d.params.result.context.slot;
        broadcast({ type: "raw_log", data: { sig, slot } });
      } catch {}
    };

    pumpWs.onclose = () => {
      pumpWs = null;
      const delay = Math.min(3000 * Math.pow(1.5, pumpReconnectAttempts), 30000);
      pumpReconnectAttempts++;
      setTimeout(startPumpWs, delay);
    };

    pumpWs.onerror = () => {};
  } catch {
    const delay = Math.min(3000 * Math.pow(1.5, pumpReconnectAttempts), 30000);
    pumpReconnectAttempts++;
    setTimeout(startPumpWs, delay);
  }
}

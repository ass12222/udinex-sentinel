import TelegramBot from "node-telegram-bot-api";
import { getRecentTokens, getSmartEvents, getBlacklist, getSetting, setSetting } from "./store";

let bot: TelegramBot | null = null;
let chatIds: string[] = [];

export function startBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  chatIds = (process.env.TELEGRAM_CHAT_IDS || "").split(",").filter(Boolean);

  bot = new TelegramBot(token, { polling: true });

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (!chatIds.includes(chatId)) chatIds.push(chatId);
    bot?.sendMessage(chatId,
      "🤖 *Udinex Sentinel Bot*\n\n"
      + "Comandi:\n"
      + "`/top` — Top 10 token caldi\n"
      + "`/summary` — Riepilogo mercato\n"
      + "`/blacklist` — Dev bannati\n"
      + "`/smart` — Ultimi movimenti smart wallet\n"
      + "`/alert <score>` — Imposta alert (es: `/alert 70`)\n"
      + "`/stop` — Disattiva alert",
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/\/top/, async (msg) => {
    const tokens = getRecentTokens(10) as any[];
    if (!tokens.length) return bot?.sendMessage(msg.chat.id, "Nessun token monitorato.");
    const lines = tokens.map((t, i) =>
      `${i + 1}. *${t.symbol || "?"}* — $${(t.mc || 0).toLocaleString()} MC — Score ${t.score?.toFixed(0) || "?"} — Bundle ${t.pctW || 0}%`
    );
    bot?.sendMessage(msg.chat.id, lines.join("\n"), { parse_mode: "Markdown" });
  });

  bot.onText(/\/summary/, (msg) => {
    const tokens = getRecentTokens() as any[];
    const hot = tokens.filter(t => (t.score || 0) >= 55).length;
    const banned = (getBlacklist() as any[]).length;
    const smart = (getSmartEvents(1) as any[])[0];
    const lastActivity = smart ? new Date(smart.ts).toLocaleTimeString() : "nessuna";
    bot?.sendMessage(msg.chat.id,
      `📊 *Riepilogo*\n\n`
      + `Token monitorati: ${tokens.length}\n`
      + `🔥 Caldi (score≥55): ${hot}\n`
      + `🚫 Dev bannati: ${banned}\n`
      + `Ultima attivita smart: ${lastActivity}`,
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/\/blacklist/, (msg) => {
    const list = getBlacklist() as any[];
    if (!list.length) return bot?.sendMessage(msg.chat.id, "Nessun dev bannato.");
    const lines = list.map(b => `${b.dev?.slice(0, 8)}... — ${b.count}x — ${b.reason}`);
    bot?.sendMessage(msg.chat.id, "🚫 *Dev Bannati*\n\n" + lines.join("\n"), { parse_mode: "Markdown" });
  });

  bot.onText(/\/smart/, (msg) => {
    const events = getSmartEvents(10) as any[];
    if (!events.length) return bot?.sendMessage(msg.chat.id, "Nessun evento smart wallet.");
    const lines = events.map(e =>
      `${e.action === "buy" ? "🟢" : "🔴"} ${e.symbol || "?"} — ${e.action.toUpperCase()} — ◎${(e.sol || 0).toFixed(2)}`
    );
    bot?.sendMessage(msg.chat.id, "🧠 *Smart Wallet*\n\n" + lines.join("\n"), { parse_mode: "Markdown" });
  });

  bot.onText(/\/alert (.+)/, (msg, match) => {
    const chatId = msg.chat.id.toString();
    const val = match?.[1]?.trim();
    if (val) {
      setSetting(`alert_score_${chatId}`, val);
      bot?.sendMessage(chatId, `✅ Alert impostato: score ≥ ${val}`);
    }
  });

  bot.onText(/\/stop/, (msg) => {
    const chatId = msg.chat.id.toString();
    setSetting(`alert_score_${chatId}`, "");
    bot?.sendMessage(chatId, "⏹ Alert disattivati.");
  });

  console.log(`[Telegram] Bot avviato, ${chatIds.length} chat configurate`);
}

export function sendAlertIfNeeded(score: number, symbol: string, mc: number, mint: string) {
  if (!bot) return;
  for (const id of chatIds) {
    const threshold = parseFloat(getSetting(`alert_score_${id}`) || "0");
    if (threshold > 0 && score >= threshold) {
      bot.sendMessage(id,
        `🚨 *Alert Score ${score.toFixed(0)}*\n\n`
        + `*${symbol}* — $${(mc || 0).toLocaleString()} MC\n`
        + `Score: ${score.toFixed(0)}/100\n`
        + `Mint: \`${mint}\``,
        { parse_mode: "Markdown" }
      ).catch(() => {});
    }
  }
}

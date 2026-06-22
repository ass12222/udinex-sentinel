import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { initStore } from "./store";
import { apiRouter } from "./routes/api";
import { startBot } from "./bot";
import { startWsProxy } from "./wsProxy";

const PORT = parseInt(process.env.PORT || "3001", 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api", apiRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), ts: Date.now() });
});

const server = createServer(app);

initStore();
startWsProxy(server);

if (process.env.TELEGRAM_BOT_TOKEN) {
  startBot();
  console.log("[Bot] Telegram avviato");
} else {
  console.log("[Bot] TELEGRAM_BOT_TOKEN non impostato, bot disattivato");
}

server.listen(PORT, () => {
  console.log(`[Server] In ascolto su http://localhost:${PORT}`);
});

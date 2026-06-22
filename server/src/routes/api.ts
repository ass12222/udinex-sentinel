import { Router } from "express";
import {
  getRecentTokens, getToken, upsertToken, saveEvent, saveSmartEvent, getEvents, getSmartEvents,
  getBlacklist, upsertBlacklist, getPortfolio, upsertPortfolio, markPortfolioSold,
  getSetting, setSetting, getWalletStats, getScoringStats, getEnabledAlerts,
  savePriceSnapshot, getTokenPriceHistory, saveScoringResult,
} from "../store";

export const apiRouter = Router();

apiRouter.get("/tokens", (_req, res) => {
  res.json(getRecentTokens());
});

apiRouter.get("/tokens/:mint", (req, res) => {
  const tok = getToken(req.params.mint);
  if (!tok) return res.status(404).json({ error: "not found" });
  res.json(tok);
});

apiRouter.post("/tokens", (req, res) => {
  upsertToken(req.body);
  res.json({ ok: true });
});

apiRouter.get("/tokens/:mint/history", (req, res) => {
  res.json(getTokenPriceHistory(req.params.mint));
});

apiRouter.post("/tokens/:mint/snapshot", (req, res) => {
  savePriceSnapshot(req.params.mint, req.body.mc, req.body.bonding);
  res.json({ ok: true });
});

apiRouter.post("/tokens/:mint/scoring", (req, res) => {
  saveScoringResult(req.params.mint, req.body.score, req.body.verdict, req.body.bundlePct, req.body.swBuy, req.body.swSell, req.body.mcAtScore);
  res.json({ ok: true });
});

apiRouter.get("/events", (req, res) => {
  res.json(getEvents(req.query.mint as string));
});

apiRouter.post("/events", (req, res) => {
  saveEvent(req.body);
  res.json({ ok: true });
});

apiRouter.get("/smart-events", (_req, res) => {
  res.json(getSmartEvents());
});

apiRouter.post("/smart-events", (req, res) => {
  saveSmartEvent(req.body);
  res.json({ ok: true });
});

apiRouter.get("/smart-events/wallet/:wallet", (req, res) => {
  res.json(getWalletStats(req.params.wallet));
});

apiRouter.get("/blacklist", (_req, res) => {
  res.json(getBlacklist());
});

apiRouter.post("/blacklist", (req, res) => {
  const { dev, reason } = req.body;
  if (!dev) return res.status(400).json({ error: "dev required" });
  upsertBlacklist(dev, reason || "segnalato");
  res.json({ ok: true });
});

apiRouter.get("/portfolio/:wallet", (req, res) => {
  res.json(getPortfolio(req.params.wallet));
});

apiRouter.post("/portfolio/buy", (req, res) => {
  upsertPortfolio(req.body.wallet, req.body.mint, req.body.mcEntry, req.body.symbol);
  res.json({ ok: true });
});

apiRouter.post("/portfolio/sell", (req, res) => {
  markPortfolioSold(req.body.wallet, req.body.mint);
  res.json({ ok: true });
});

apiRouter.get("/settings/:key", (req, res) => {
  res.json({ key: req.params.key, value: getSetting(req.params.key) });
});

apiRouter.post("/settings", (req, res) => {
  setSetting(req.body.key, req.body.value);
  res.json({ ok: true });
});

apiRouter.get("/stats/scoring", (_req, res) => {
  res.json(getScoringStats());
});

apiRouter.get("/alerts", (_req, res) => {
  res.json(getEnabledAlerts());
});

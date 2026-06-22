import { useEffect, useRef, type ReactNode } from "react";
import { G, devBlacklist } from "./state";
import { syncToken, syncEvent, syncSmartEvent, syncScoring, syncBlacklist, syncPriceSnapshot } from "./api";

export function SyncProvider({ children }: { children: ReactNode }) {
  const lastSync = useRef(0);
  const lastBlacklistSize = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      if (now - lastSync.current < 5000) return;
      lastSync.current = now;

      // Sync tokens
      for (const tok of G.tokens) {
        syncToken(tok);
        syncPriceSnapshot(tok.mint, tok.mc, tok.bonding);
      }

      // Sync events (last 10 new ones)
      const events = G.events.slice(0, 10);
      for (const ev of events) {
        syncEvent(ev);
      }

      // Sync smart events
      const smartEvs = G.smartEvents.slice(0, 10);
      for (const ev of smartEvs) {
        syncSmartEvent(ev);
      }

      // Sync blacklist changes
      if (devBlacklist.size !== lastBlacklistSize.current) {
        lastBlacklistSize.current = devBlacklist.size;
        for (const [dev, info] of devBlacklist) {
          syncBlacklist(dev, info.reason);
        }
      }
    }, 10000);

    return () => clearInterval(id);
  }, []);

  return <>{children}</>;
}

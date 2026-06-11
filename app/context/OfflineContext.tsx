import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { checkIsOnline, useIsOnline } from "../lib/network";
import { getOutboxCount, processOutbox } from "../lib/scanOutbox";

interface OfflineContextValue {
  /** Best-effort device connectivity state. */
  isOnline: boolean;
  /** Number of scans queued locally, waiting to be uploaded. */
  outboxCount: number;
  /** Whether the outbox is currently being uploaded. */
  syncing: boolean;
  refreshOutboxCount: () => Promise<void>;
  /** Uploads all queued scans now (also runs automatically when connectivity returns). */
  syncNow: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | undefined>(undefined);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const isOnline = useIsOnline();
  const [outboxCount, setOutboxCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const wasOnline = useRef(isOnline);

  const refreshOutboxCount = useCallback(async () => {
    setOutboxCount(await getOutboxCount());
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await processOutbox();
    } finally {
      await refreshOutboxCount();
      setSyncing(false);
    }
  }, [refreshOutboxCount]);

  // On launch, pick up any scans that were queued during a previous session —
  // if we're already online there won't be an offline->online transition to trigger a sync.
  const launchedRef = useRef(false);
  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;

    (async () => {
      const count = await getOutboxCount();
      setOutboxCount(count);
      if (count > 0 && (await checkIsOnline())) {
        await syncNow();
      }
    })();
  }, [syncNow]);

  // Auto-sync the queue whenever the device transitions from offline to online.
  useEffect(() => {
    if (isOnline && !wasOnline.current) {
      syncNow();
    }
    wasOnline.current = isOnline;
  }, [isOnline, syncNow]);

  return (
    <OfflineContext.Provider value={{ isOnline, outboxCount, syncing, refreshOutboxCount, syncNow }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    throw new Error("useOffline must be used within an OfflineProvider");
  }
  return ctx;
}

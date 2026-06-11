import { useEffect, useState } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";

const POLL_INTERVAL_MS = 15000;

/** Best-effort connectivity check — defaults to "online" if the check itself fails. */
export async function checkIsOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

/** Tracks device connectivity, re-checking when the app returns to the foreground and on a background interval. */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let mounted = true;
    const check = () => {
      checkIsOnline().then((online) => {
        if (mounted) setIsOnline(online);
      });
    };

    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    const interval = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  return isOnline;
}

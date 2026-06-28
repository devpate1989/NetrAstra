import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { apiRequest } from "../lib/api";
import { registerForPushNotificationsAsync } from "../lib/notifications";
import type { AppUser } from "../types";

interface AuthContextValue {
  session: Session | null;
  user: AppUser | null;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadProfile() {
    try {
      // Render's free-tier server can take 30-60s to wake from a cold start;
      // the default 20s timeout was firing on the very first request after
      // idle, leaving a valid session with `user: null`. Give this initial
      // fetch more headroom so it succeeds instead of falling back to logged-out-looking state.
      const profile = await apiRequest<AppUser>("/profile/me", { timeoutMs: 60_000 });
      setUser(profile);
      registerForPushNotificationsAsync().catch((err) => {
        console.warn("[auth] Failed to register for push notifications:", err);
      });
    } catch (err) {
      console.warn("[auth] Failed to load profile:", err);
      setUser(null);
    }
  }

  useEffect(() => {
    let active = true;

    // getSession() can hang indefinitely on a stuck/slow network request
    // (e.g. refreshing a stale token) with no built-in timeout, which left
    // the app stuck on the loading spinner forever. Race it against a
    // timeout so the app always reaches the login/dashboard screen.
    const sessionCheck = supabase.auth.getSession();
    const timeout = new Promise<{ data: { session: null } }>((resolve) =>
      setTimeout(() => resolve({ data: { session: null } }), 10_000)
    );

    Promise.race([sessionCheck, timeout])
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        if (data.session) {
          await loadProfile();
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.warn("[auth] Failed to get session:", err);
        setSession(null);
        setIsLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        await loadProfile();
      } else {
        setUser(null);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      isLoading,
      refreshProfile: loadProfile,
      signOut: async () => {
        await supabase.auth.signOut();
        setUser(null);
      },
    }),
    [session, user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

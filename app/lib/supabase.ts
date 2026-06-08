import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";

// Expo Router's static web export pre-renders screens on the server (Node.js),
// where `window`/`localStorage` don't exist. AsyncStorage's web implementation
// touches them eagerly, so guard every call and act as a no-op store on the server —
// the browser bundle still uses real persisted storage once it hydrates.
const isBrowser = () => typeof window !== "undefined";

const ssrSafeStorage: SupportedStorage = {
  getItem: (key) => (isBrowser() ? AsyncStorage.getItem(key) : Promise.resolve(null)),
  setItem: (key, value) => (isBrowser() ? AsyncStorage.setItem(key, value) : Promise.resolve()),
  removeItem: (key) => (isBrowser() ? AsyncStorage.removeItem(key) : Promise.resolve()),
};

const envSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const envSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!envSupabaseUrl || !envSupabaseAnonKey) {
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. " +
      "Fill them in app/.env — using placeholder values so the app can still build/boot."
  );
}

// Fall back to harmless placeholders so `createClient` doesn't throw during
// bundling/static export/tests when real credentials haven't been configured yet.
// Network calls will simply fail until real values are provided in app/.env.
const supabaseUrl = envSupabaseUrl || "https://placeholder.supabase.co";
const supabaseAnonKey = envSupabaseAnonKey || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ssrSafeStorage,
    autoRefreshToken: isBrowser(),
    persistSession: true,
    detectSessionInUrl: false,
  },
});

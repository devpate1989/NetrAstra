import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Text } from "../../components/Text";
import { Banner } from "../../components/Banner";
import { FormField } from "../../components/FormField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { apiRequest } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import type { AppUser } from "../../types";

export default function LoginScreen() {
  const { loginWithProfile } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError("");

    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setLoading(true);
    try {
      // Single API call — returns both the session tokens AND the user profile
      // so we never need a separate /profile/me round-trip after login.
      const result = await apiRequest<{
        session: { accessToken: string; refreshToken: string; expiresAt?: number };
        user: AppUser;
      }>("/auth/login", {
        method: "POST",
        body: { username: username.trim().toLowerCase(), password },
        skipAuth: true,
      });

      // Pre-populate user profile in AuthContext BEFORE setSession() so the
      // dashboard has data the instant it mounts, without waiting for loadProfile().
      loginWithProfile(result.user);

      // Store tokens in the Supabase client. This triggers onAuthStateChange
      // (SIGNED_IN) which in turn causes index.tsx to redirect to /(app)/dashboard.
      // We intentionally do NOT call router.replace() here — doing so before
      // onAuthStateChange fires causes a race condition where (app)/_layout.tsx
      // still sees session=null and immediately redirects back to login.
      await supabase.auth.setSession({
        access_token: result.session.accessToken,
        refresh_token: result.session.refreshToken,
      });

      // Navigation happens automatically via index.tsx once session state updates.
    } catch (err: any) {
      setError(err?.message ?? "Could not sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-white"
    >
      <ScrollView contentContainerClassName="flex-grow items-center justify-center px-6 py-12">
        <View className="w-full max-w-sm">
          <View className="mb-8 items-center">
            <Image
              source={require("../../assets/icon.png")}
              className="mb-4 rounded-2xl"
              style={{ width: 64, height: 64 }}
              resizeMode="contain"
            />
            <Text className="text-2xl font-bold text-slate-900">Netra Astra</Text>
            <Text className="mt-1 text-center text-sm text-slate-500">
              Sign in to access inquiries, dashboards & reports
            </Text>
          </View>

          <Banner message={error} variant="error" />

          <FormField
            label="Username"
            placeholder="e.g. devvpatel2015"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            value={username}
            onChangeText={setUsername}
            onSubmitEditing={() => {}}
            returnKeyType="next"
          />
          <FormField
            label="Password"
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
            returnKeyType="go"
          />

          <PrimaryButton label={loading ? "Signing in…" : "Sign in"} onPress={handleLogin} loading={loading} />

          <Text className="mt-6 text-center text-xs text-slate-400">
            Accounts are created by your station Admin.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

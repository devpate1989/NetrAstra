import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Text } from "../../components/Text";
import { router } from "expo-router";
import { Banner } from "../../components/Banner";
import { FormField } from "../../components/FormField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { apiRequest } from "../../lib/api";
import { supabase } from "../../lib/supabase";

export default function LoginScreen() {
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
      const result = await apiRequest<{
        session: { accessToken: string; refreshToken: string };
      }>("/auth/login", {
        method: "POST",
        body: { username: username.trim().toLowerCase(), password },
        skipAuth: true,
      });

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: result.session.accessToken,
        refresh_token: result.session.refreshToken,
      });

      if (setSessionError) throw setSessionError;

      router.replace("/(app)/dashboard");
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
            placeholder="e.g. rajesh.kumar"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />
          <FormField
            label="Password"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <PrimaryButton label="Sign in" onPress={handleLogin} loading={loading} />

          <Text className="mt-6 text-center text-xs text-slate-400">
            Accounts are created by your station Admin.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

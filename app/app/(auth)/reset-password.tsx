import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Text } from "../../components/Text";
import { Link, router, useLocalSearchParams } from "expo-router";
import { Banner } from "../../components/Banner";
import { FormField } from "../../components/FormField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { apiRequest } from "../../lib/api";

/**
 * Reached via the password-reset email link (redirectTo = `${APP_URL}/reset-password`).
 * Supabase appends the recovery access token either as a query/deep-link param
 * or in the URL hash fragment (web). We try both, and fall back to letting the
 * user paste the token directly if automatic extraction doesn't work for their platform.
 */
function readTokenFromWebHash(): string | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const hash = window.location.hash?.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  return params.get("access_token");
}

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ access_token?: string; accessToken?: string; token?: string }>();
  const [accessToken, setAccessToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fromParams = params.access_token ?? params.accessToken ?? params.token;
    const fromHash = readTokenFromWebHash();
    const found = fromParams ?? fromHash ?? "";
    if (found) setAccessToken(found);
  }, [params.access_token, params.accessToken, params.token]);

  async function handleSubmit() {
    setError("");
    setSuccess("");

    if (!accessToken.trim()) {
      setError("We couldn't find a reset token. Please paste the link from your email or request a new one.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const result = await apiRequest<{ message: string }>("/auth/reset-password", {
        method: "POST",
        skipAuth: true,
        body: { accessToken: accessToken.trim(), newPassword },
      });
      setSuccess(result.message);
      setTimeout(() => router.replace("/(auth)/login"), 1800);
    } catch (err: any) {
      setError(err?.message ?? "Could not reset your password. The link may have expired.");
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
          <View className="mb-6 items-center">
            <Text className="text-2xl font-bold text-slate-900">Set a new password</Text>
            <Text className="mt-1 text-center text-sm text-slate-500">
              Choose a new password for your account.
            </Text>
          </View>

          <Banner message={error} variant="error" />
          <Banner message={success} variant="success" />

          {!params.access_token && !params.accessToken && !params.token ? (
            <FormField
              label="Reset token"
              placeholder="Paste the token from your reset-password email"
              autoCapitalize="none"
              value={accessToken}
              onChangeText={setAccessToken}
            />
          ) : null}

          <FormField label="New password" placeholder="At least 8 characters" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
          <FormField label="Confirm new password" placeholder="Re-enter your new password" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />

          <PrimaryButton label="Reset password" onPress={handleSubmit} loading={loading} />

          <View className="mt-6 items-center">
            <Link href="/(auth)/login" className="text-sm font-semibold text-brand-600">
              Back to sign in
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

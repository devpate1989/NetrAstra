import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Text } from "../../components/Text";
import { Link } from "expo-router";
import { Banner } from "../../components/Banner";
import { FormField } from "../../components/FormField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { apiRequest } from "../../lib/api";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Please enter the email associated with your account.");
      return;
    }

    setLoading(true);
    try {
      const result = await apiRequest<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        skipAuth: true,
        body: { email: email.trim() },
      });
      setSuccess(result.message);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.");
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
            <Text className="text-2xl font-bold text-slate-900">Forgot your password?</Text>
            <Text className="mt-1 text-center text-sm text-slate-500">
              Enter your account email and we&apos;ll send you a reset link.
            </Text>
          </View>

          <Banner message={error} variant="error" />
          <Banner message={success} variant="success" />

          <FormField
            label="Email"
            placeholder="you@police.gov.in"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <PrimaryButton label="Send reset link" onPress={handleSubmit} loading={loading} />

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

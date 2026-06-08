import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { Text } from "../../components/Text";
import { Link, router } from "expo-router";
import { Banner } from "../../components/Banner";
import { FormField } from "../../components/FormField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { apiRequest } from "../../lib/api";
import type { UserRole } from "../../types";

// Self-registration is limited to operational roles. Admin accounts are
// provisioned/promoted by an existing admin (see the user-management screen),
// never self-selected — this matches the server's registerSchema restriction.
const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "io", label: "Investigating Officer" },
  { value: "sho", label: "SHO" },
];

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("io");
  const [policeStation, setPoliceStation] = useState("");
  const [district, setDistrict] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    setError("");
    setSuccess("");

    if (!fullName.trim() || !email.trim() || !password) {
      setError("Please fill in your name, email, and password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/auth/register", {
        method: "POST",
        skipAuth: true,
        body: {
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          role,
          policeStation: policeStation.trim() || undefined,
          district: district.trim() || undefined,
        },
      });

      setSuccess("Account created! Please check your email to verify your account, then sign in.");
      setTimeout(() => router.replace("/(auth)/login"), 1800);
    } catch (err: any) {
      setError(err?.message ?? "Could not create your account. Please try again.");
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
            <Text className="text-2xl font-bold text-slate-900">Create your account</Text>
            <Text className="mt-1 text-center text-sm text-slate-500">
              Register to file inquiries and access your dashboard
            </Text>
          </View>

          <Banner message={error} variant="error" />
          <Banner message={success} variant="success" />

          <FormField label="Full name" placeholder="e.g. Abhishek Singh" value={fullName} onChangeText={setFullName} />
          <FormField
            label="Email"
            placeholder="you@police.gov.in"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <FormField label="Password" placeholder="At least 8 characters" secureTextEntry value={password} onChangeText={setPassword} />
          <FormField label="Confirm password" placeholder="Re-enter your password" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />

          <Text className="mb-1 text-sm font-medium text-slate-700">Role</Text>
          <View className="mb-4 flex-row flex-wrap gap-2">
            {ROLE_OPTIONS.map((option) => {
              const selected = option.value === role;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setRole(option.value)}
                  className={`rounded-full border px-4 py-2 ${
                    selected ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white"
                  }`}
                >
                  <Text className={`text-sm font-medium ${selected ? "text-white" : "text-slate-700"}`}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <FormField label="Police Station (थाना)" placeholder="e.g. Kumarganj" value={policeStation} onChangeText={setPoliceStation} />
          <FormField label="District (जनपद)" placeholder="e.g. Ayodhya" value={district} onChangeText={setDistrict} />

          <PrimaryButton label="Create account" onPress={handleRegister} loading={loading} />

          <View className="mt-6 flex-row justify-center">
            <Text className="text-sm text-slate-500">Already have an account? </Text>
            <Link href="/(auth)/login" className="text-sm font-semibold text-brand-600">
              Sign in
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { Text } from "../../components/Text";
import { router } from "expo-router";
import { ScreenContainer } from "../../components/ScreenContainer";
import { FormField } from "../../components/FormField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Banner } from "../../components/Banner";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, ApiError } from "../../lib/api";
import { pickAndUploadAvatar } from "../../lib/avatar";
import type { AppUser } from "../../types";

const ROLE_LABELS: Record<string, string> = {
  io: "Investigating Officer",
  sho: "SHO",
  admin: "Admin",
};

export default function ProfileScreen() {
  const { user, refreshProfile, signOut } = useAuth();

  const [fullName, setFullName] = useState("");
  const [policeStation, setPoliceStation] = useState("");
  const [district, setDistrict] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName ?? "");
      setPoliceStation(user.policeStation ?? "");
      setDistrict(user.district ?? "");
      setPhone(user.phone ?? "");
    }
  }, [user]);

  async function handleSave() {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await apiRequest<AppUser>("/profile/me", {
        method: "PATCH",
        body: {
          fullName: fullName.trim(),
          policeStation: policeStation.trim(),
          district: district.trim(),
          phone: phone.trim(),
        },
      });
      await refreshProfile();
      setSuccess("Profile updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePickAvatar() {
    if (!user) return;
    setError("");
    setSuccess("");
    setUploadingAvatar(true);
    try {
      const avatarUrl = await pickAndUploadAvatar(user.id);
      if (!avatarUrl) return;

      await apiRequest<AppUser>("/profile/me", { method: "PATCH", body: { avatarUrl } });
      await refreshProfile();
      setSuccess("Profile photo updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your profile photo.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError("");
    setPasswordSuccess("");

    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setChangingPassword(true);
    try {
      const result = await apiRequest<{ message: string }>("/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      setPasswordSuccess(result.message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Could not change your password.");
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/(auth)/login");
  }

  const initial = (user?.fullName ?? user?.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <ScreenContainer title="Profile" subtitle={user ? ROLE_LABELS[user.role] ?? user.role : undefined}>
      <Banner message={error} variant="error" />
      <Banner message={success} variant="success" />

      <View className="mb-4 items-center rounded-xl border border-slate-200 bg-white p-5">
        <Pressable onPress={handlePickAvatar} disabled={uploadingAvatar} className="relative">
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} className="h-20 w-20 rounded-full bg-slate-100" />
          ) : (
            <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-100">
              <Text className="text-2xl font-bold text-brand-700">{initial}</Text>
            </View>
          )}
        </Pressable>
        <Pressable onPress={handlePickAvatar} disabled={uploadingAvatar}>
          <Text className="mt-3 text-sm font-semibold text-brand-600">
            {uploadingAvatar ? "Uploading…" : user?.avatarUrl ? "Change photo" : "Add a profile photo"}
          </Text>
        </Pressable>
        <Text className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Email</Text>
        <Text className="text-base text-slate-900">{user?.email}</Text>
      </View>

      <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Personal & contact details
      </Text>
      <FormField label="Full name" value={fullName} onChangeText={setFullName} />
      <FormField label="Police Station (थाना)" value={policeStation} onChangeText={setPoliceStation} />
      <FormField label="District (जनपद)" value={district} onChangeText={setDistrict} />
      <FormField label="Mobile number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <PrimaryButton label="Save changes" onPress={handleSave} loading={saving} icon="save" />

      <View className="my-6 h-px bg-slate-200" />

      <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Change password
      </Text>
      <Banner message={passwordError} variant="error" />
      <Banner message={passwordSuccess} variant="success" />
      <FormField
        label="Current password"
        secureTextEntry
        value={currentPassword}
        onChangeText={setCurrentPassword}
      />
      <FormField
        label="New password"
        placeholder="At least 8 characters"
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
      />
      <FormField
        label="Confirm new password"
        secureTextEntry
        value={confirmNewPassword}
        onChangeText={setConfirmNewPassword}
      />
      <PrimaryButton label="Update password" onPress={handleChangePassword} loading={changingPassword} variant="outline" icon="lock-reset" />

      <View className="mt-6">
        <PrimaryButton label="Sign out" onPress={handleSignOut} variant="outline" icon="logout" />
      </View>
    </ScreenContainer>
  );
}

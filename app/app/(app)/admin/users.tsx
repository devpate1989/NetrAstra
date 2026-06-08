import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Text } from "../../../components/Text";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
import { FormField } from "../../../components/FormField";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { apiRequest, ApiError } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import type { UserRole } from "../../../types";

interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  policeStation: string | null;
  district: string | null;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "io", label: "IO" },
  { value: "sho", label: "SHO" },
  { value: "admin", label: "Admin" },
];

const ROLE_LABELS: Record<UserRole, string> = {
  io: "Investigating Officer",
  sho: "SHO",
  admin: "Admin",
};

const BLANK_FORM = { email: "", password: "", fullName: "", role: "io" as UserRole, policeStation: "", district: "" };

export default function AdminUsersScreen() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create-user form
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    setError("");
    try {
      const data = await apiRequest<{ users: AdminUser[] }>("/admin/users");
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load users.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(targetUser: AdminUser, role: UserRole) {
    if (role === targetUser.role) return;
    setError("");
    setSuccess("");
    setUpdatingId(targetUser.id);
    try {
      const data = await apiRequest<{ user: AdminUser }>(`/admin/users/${targetUser.id}`, {
        method: "PATCH",
        body: { role },
      });
      setUsers((prev) => prev.map((u) => (u.id === data.user.id ? data.user : u)));
      setSuccess(`${data.user.fullName ?? data.user.email} is now ${ROLE_LABELS[data.user.role]}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update this user's role.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleCreate() {
    setCreateError("");
    if (!form.email.trim() || !form.password || !form.fullName.trim()) {
      setCreateError("Email, password, and full name are required.");
      return;
    }
    setCreating(true);
    try {
      const data = await apiRequest<{ user: AdminUser }>("/admin/users", {
        method: "POST",
        body: {
          email: form.email.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          role: form.role,
          policeStation: form.policeStation.trim() || undefined,
          district: form.district.trim() || undefined,
        },
      });
      setUsers((prev) => [data.user, ...prev]);
      setSuccess(`Account created for ${data.user.fullName ?? data.user.email}.`);
      setForm(BLANK_FORM);
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Could not create account.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScreenContainer
      title="Manage Users"
      subtitle="Create accounts and manage roles for your station"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            setIsRefreshing(true);
            load(false);
          }}
        />
      }
    >
      {/* ── Create user ─────────────────────────────────── */}
      <Pressable
        onPress={() => { setShowCreate((v) => !v); setCreateError(""); }}
        className="mb-4 flex-row items-center justify-between rounded-xl border border-brand-600 bg-brand-50 px-4 py-3"
      >
        <View className="flex-row items-center gap-2">
          <MaterialIcons name="person-add" size={18} color="#1d4ed8" />
          <Text className="text-sm font-semibold text-brand-600">Create new account</Text>
        </View>
        <MaterialIcons name={showCreate ? "expand-less" : "expand-more"} size={20} color="#1d4ed8" />
      </Pressable>

      {showCreate && (
        <View className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
          <Banner message={createError} variant="error" />
          <FormField label="Full name" value={form.fullName} onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))} />
          <FormField label="Email" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} />
          <FormField label="Password (min 8 chars)" secureTextEntry value={form.password} onChangeText={(v) => setForm((f) => ({ ...f, password: v }))} />
          <FormField label="Police Station (थाना)" value={form.policeStation} onChangeText={(v) => setForm((f) => ({ ...f, policeStation: v }))} />
          <FormField label="District (जनपद)" value={form.district} onChangeText={(v) => setForm((f) => ({ ...f, district: v }))} />

          <Text className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Role</Text>
          <View className="mb-4 flex-row gap-2">
            {ROLE_OPTIONS.map((opt) => {
              const selected = opt.value === form.role;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setForm((f) => ({ ...f, role: opt.value }))}
                  className={`rounded-full border px-4 py-1.5 ${selected ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white"}`}
                >
                  <Text className={`text-sm font-medium ${selected ? "text-white" : "text-slate-700"}`}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <PrimaryButton label="Create account" onPress={handleCreate} loading={creating} icon="person-add" />
        </View>
      )}

      {/* ── Status banners ──────────────────────────────── */}
      <Banner message={error} variant="error" />
      <Banner message={success} variant="success" />

      {/* ── User list ───────────────────────────────────── */}
      {isLoading ? (
        <View className="items-center py-10">
          <ActivityIndicator size="large" color="#1d4ed8" />
        </View>
      ) : users.length === 0 ? (
        <Banner message="No users found yet." variant="info" />
      ) : (
        users.map((u) => {
          const isSelf = u.id === currentUser?.id;
          return (
            <View key={u.id} className="mb-3 w-full rounded-xl border border-slate-200 bg-white p-4">
              <View className="flex-row items-start gap-3">
                <View className="mt-0.5 h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                  <MaterialIcons name="person" size={18} color="#64748b" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-slate-900">
                    {u.fullName ?? "Unnamed officer"}{" "}
                    {isSelf ? <Text className="text-xs font-normal text-slate-400">(you)</Text> : null}
                  </Text>
                  <Text className="mt-0.5 text-sm text-slate-500">{u.email}</Text>
                  {(u.policeStation || u.district) && (
                    <Text className="mt-0.5 text-xs text-slate-400">
                      {u.policeStation ? `थाना ${u.policeStation}` : ""}
                      {u.policeStation && u.district ? " · " : ""}
                      {u.district ? `जनपद ${u.district}` : ""}
                    </Text>
                  )}
                </View>
              </View>

              <Text className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Role — {ROLE_LABELS[u.role]}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {ROLE_OPTIONS.map((option) => {
                    const selected = option.value === u.role;
                    const disabled = isSelf || updatingId === u.id;
                    return (
                      <Pressable
                        key={option.value}
                        disabled={disabled}
                        onPress={() => changeRole(u, option.value)}
                        className={`rounded-full border px-4 py-1.5 ${
                          selected ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white"
                        } ${disabled && !selected ? "opacity-50" : ""}`}
                      >
                        <Text className={`text-sm font-medium ${selected ? "text-white" : "text-slate-700"}`}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
              {isSelf ? (
                <Text className="mt-2 text-xs text-slate-400">You cannot change your own role.</Text>
              ) : null}
            </View>
          );
        })
      )}
    </ScreenContainer>
  );
}

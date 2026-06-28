import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
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
  username: string;
  fullName: string | null;
  role: UserRole;
  policeStation: string | null;
  district: string | null;
}

interface BulkRowResult {
  row: number;
  username: string;
  fullName: string;
  status: "created" | "failed" | "skipped";
  password?: string;
  error?: string;
}

interface BulkImportResult {
  totalRows: number;
  created: number;
  failed: number;
  skipped: number;
  results: BulkRowResult[];
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

const BLANK_FORM = { username: "", password: "", fullName: "", role: "io" as UserRole, phone: "" };

async function readFileAsBase64(uri: string, file?: File): Promise<string> {
  if (Platform.OS === "web" && file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        resolve(dataUrl.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

export default function AdminUsersScreen() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);

  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetDone, setResetDone] = useState(false);

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

  useEffect(() => { load(); }, [load]);

  async function changeRole(targetUser: AdminUser, role: UserRole) {
    if (role === targetUser.role) return;
    setError(""); setSuccess("");
    setUpdatingId(targetUser.id);
    try {
      const data = await apiRequest<{ user: AdminUser }>(`/admin/users/${targetUser.id}`, {
        method: "PATCH",
        body: { role },
      });
      setUsers((prev) => prev.map((u) => (u.id === data.user.id ? data.user : u)));
      setSuccess(`${data.user.fullName ?? data.user.username} is now ${ROLE_LABELS[data.user.role]}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update this user's role.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleCreate() {
    setCreateError("");
    if (!form.username.trim() || !form.password || !form.fullName.trim()) {
      setCreateError("Username, password, and full name are required.");
      return;
    }
    setCreating(true);
    try {
      const data = await apiRequest<{ user: AdminUser }>("/admin/users", {
        method: "POST",
        body: {
          username: form.username.trim().toLowerCase(),
          password: form.password,
          fullName: form.fullName.trim(),
          role: form.role,
          phone: form.phone.trim() || undefined,
        },
      });
      setUsers((prev) => [data.user, ...prev]);
      setSuccess(`Account created for ${data.user.fullName ?? data.user.username}.`);
      setForm(BLANK_FORM);
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Could not create account.");
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    setResetError("");
    if (resetPassword.length < 8) {
      setResetError("Password must be at least 8 characters.");
      return;
    }
    setResetting(true);
    try {
      await apiRequest(`/admin/users/${resetTarget.id}/password`, {
        method: "PATCH",
        body: { password: resetPassword },
      });
      setResetDone(true);
      setResetPassword("");
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : "Could not reset password.");
    } finally {
      setResetting(false);
    }
  }

  function openResetModal(u: AdminUser) {
    setResetTarget(u);
    setResetPassword("");
    setResetError("");
    setResetDone(false);
  }

  function closeResetModal() {
    setResetTarget(null);
    setResetPassword("");
    setResetError("");
    setResetDone(false);
  }

  async function handleBulkImport() {
    setError(""); setSuccess("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "*/*",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const ext = asset.name.split(".").pop()?.toLowerCase();
      if (ext !== "xlsx" && ext !== "xls") {
        setError("Please select an Excel file (.xlsx or .xls).");
        return;
      }

      setBulkLoading(true);
      const base64 = await readFileAsBase64(asset.uri, (asset as any).file);
      const data = await apiRequest<BulkImportResult>("/admin/users/bulk", {
        method: "POST",
        body: { base64, fileName: asset.name },
      });
      setBulkResult(data);
      if (data.created > 0) await load(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bulk import failed. Please try again.");
    } finally {
      setBulkLoading(false);
    }
  }

  const statusColor = (s: BulkRowResult["status"]) =>
    s === "created" ? "text-green-700" : s === "failed" ? "text-red-600" : "text-amber-600";
  const statusIcon = (s: BulkRowResult["status"]) =>
    s === "created" ? "check-circle" : s === "failed" ? "error" : "warning";

  return (
    <ScreenContainer
      title="Manage Users"
      subtitle="Create accounts and manage roles for your station"
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); load(false); }} />
      }
    >
      {/* ── Action buttons ──────────────────────────────── */}
      <View className="mb-4 flex-row gap-3">
        <Pressable
          onPress={() => { setShowCreate((v) => !v); setCreateError(""); }}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-brand-600 bg-brand-50 px-4 py-3"
        >
          <MaterialIcons name="person-add" size={18} color="#1d4ed8" />
          <Text className="text-sm font-semibold text-brand-600">New account</Text>
          <MaterialIcons name={showCreate ? "expand-less" : "expand-more"} size={18} color="#1d4ed8" />
        </Pressable>

        <Pressable
          onPress={handleBulkImport}
          disabled={bulkLoading}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-3"
        >
          {bulkLoading
            ? <ActivityIndicator size="small" color="#059669" />
            : <MaterialIcons name="upload-file" size={18} color="#059669" />
          }
          <Text className="text-sm font-semibold text-emerald-700">
            {bulkLoading ? "Importing…" : "Bulk Import"}
          </Text>
        </Pressable>
      </View>

      {/* ── Single create form ──────────────────────────── */}
      {showCreate && (
        <View className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
          <Banner message={createError} variant="error" />
          <FormField label="Full name" value={form.fullName} onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))} />
          <FormField
            label="Username"
            placeholder="e.g. rajesh.kumar"
            autoCapitalize="none"
            autoCorrect={false}
            value={form.username}
            onChangeText={(v) => setForm((f) => ({ ...f, username: v.toLowerCase() }))}
          />
          <FormField label="Password (min 8 chars)" secureTextEntry value={form.password} onChangeText={(v) => setForm((f) => ({ ...f, password: v }))} />
          <FormField label="Phone (optional)" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} />

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

          <Text className="mb-3 text-xs text-slate-400">
            थाना: kumarganj · जनपद: ayodhya (auto-assigned)
          </Text>

          <PrimaryButton label="Create account" onPress={handleCreate} loading={creating} icon="person-add" />
        </View>
      )}

      {/* ── Status banners ──────────────────────────────── */}
      <Banner message={error} variant="error" />
      <Banner message={success} variant="success" />

      {/* ── Bulk import results modal ────────────────────── */}
      <Modal visible={bulkResult !== null} animationType="slide" transparent onRequestClose={() => setBulkResult(null)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[80%] rounded-t-2xl bg-white">
            <View className="flex-row items-center justify-between border-b border-slate-100 px-5 py-4">
              <Text className="text-lg font-bold text-slate-900">Import Results</Text>
              <Pressable onPress={() => setBulkResult(null)}>
                <MaterialIcons name="close" size={22} color="#64748b" />
              </Pressable>
            </View>

            {bulkResult && (
              <>
                <View className="flex-row gap-3 px-5 py-4">
                  <View className="flex-1 items-center rounded-xl bg-green-50 py-3">
                    <Text className="text-xl font-bold text-green-700">{bulkResult.created}</Text>
                    <Text className="text-xs text-green-600">Created</Text>
                  </View>
                  <View className="flex-1 items-center rounded-xl bg-red-50 py-3">
                    <Text className="text-xl font-bold text-red-600">{bulkResult.failed}</Text>
                    <Text className="text-xs text-red-500">Failed</Text>
                  </View>
                  <View className="flex-1 items-center rounded-xl bg-amber-50 py-3">
                    <Text className="text-xl font-bold text-amber-600">{bulkResult.skipped}</Text>
                    <Text className="text-xs text-amber-500">Skipped</Text>
                  </View>
                </View>

                <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator>
                  {bulkResult.results.map((r) => (
                    <View key={r.row} className="mb-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <View className="flex-row items-center gap-2">
                        <MaterialIcons name={statusIcon(r.status) as any} size={16} color={r.status === "created" ? "#15803d" : r.status === "failed" ? "#dc2626" : "#d97706"} />
                        <Text className="flex-1 text-sm font-semibold text-slate-800">{r.fullName}</Text>
                        <Text className={`text-xs font-medium capitalize ${statusColor(r.status)}`}>{r.status}</Text>
                      </View>
                      <Text className="mt-1 font-mono text-xs text-slate-500">@{r.username}</Text>
                      {r.password && (
                        <View className="mt-2 rounded-lg bg-amber-50 px-3 py-2">
                          <Text className="text-xs text-amber-700">
                            Password: <Text className="font-mono font-bold">{r.password}</Text>
                          </Text>
                          <Text className="mt-0.5 text-xs text-amber-600">Share with officer and ask them to change it.</Text>
                        </View>
                      )}
                      {r.error && <Text className="mt-1 text-xs text-red-500">{r.error}</Text>}
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Reset password modal ────────────────────────── */}
      <Modal visible={resetTarget !== null} animationType="fade" transparent onRequestClose={closeResetModal}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full rounded-2xl bg-white p-5">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-slate-900">Reset Password</Text>
              <Pressable onPress={closeResetModal}>
                <MaterialIcons name="close" size={22} color="#64748b" />
              </Pressable>
            </View>

            {resetTarget && (
              <Text className="mb-4 text-sm text-slate-500">
                Set a new password for{" "}
                <Text className="font-semibold text-slate-800">
                  {resetTarget.fullName ?? resetTarget.username}
                </Text>
              </Text>
            )}

            {resetDone ? (
              <View className="items-center py-4 gap-2">
                <MaterialIcons name="check-circle" size={40} color="#16a34a" />
                <Text className="text-base font-semibold text-green-700">Password updated</Text>
                <Text className="text-xs text-slate-500 text-center">
                  Share the new password with the officer and ask them to keep it safe.
                </Text>
                <Pressable onPress={closeResetModal} className="mt-3 rounded-xl bg-brand-600 px-6 py-3">
                  <Text className="font-semibold text-white">Done</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Banner message={resetError} variant="error" />
                <FormField
                  label="New password (min 8 chars)"
                  secureTextEntry
                  value={resetPassword}
                  onChangeText={setResetPassword}
                  autoCapitalize="none"
                />
                <PrimaryButton
                  label="Set password"
                  onPress={handleResetPassword}
                  loading={resetting}
                  icon="lock"
                />
              </>
            )}
          </View>
        </View>
      </Modal>

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
                  <Text className="mt-0.5 font-mono text-sm text-slate-500">@{u.username}</Text>
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
                        className={`rounded-full border px-4 py-1.5 ${selected ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white"} ${disabled && !selected ? "opacity-50" : ""}`}
                      >
                        <Text className={`text-sm font-medium ${selected ? "text-white" : "text-slate-700"}`}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
              {isSelf && <Text className="mt-2 text-xs text-slate-400">You cannot change your own role.</Text>}

              {!isSelf && (
                <Pressable
                  onPress={() => openResetModal(u)}
                  className="mt-3 flex-row items-center gap-1.5 self-start rounded-lg border border-slate-300 bg-slate-50 px-3 py-2"
                >
                  <MaterialIcons name="lock" size={15} color="#475569" />
                  <Text className="text-xs font-medium text-slate-600">Reset password</Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}
    </ScreenContainer>
  );
}

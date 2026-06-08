import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "../../../components/Text";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
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

export default function AdminUsersScreen() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  return (
    <ScreenContainer
      title="Manage Users"
      subtitle="Promote or change roles for IO / SHO / Admin accounts"
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
      <Banner message={error} variant="error" />
      <Banner message={success} variant="success" />

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
              <Text className="text-base font-semibold text-slate-900">
                {u.fullName ?? "Unnamed officer"} {isSelf ? <Text className="text-xs text-slate-400">(you)</Text> : null}
              </Text>
              <Text className="mt-0.5 text-sm text-slate-500">{u.email}</Text>
              {(u.policeStation || u.district) && (
                <Text className="mt-0.5 text-xs text-slate-400">
                  {u.policeStation ? `थाना ${u.policeStation}` : ""}
                  {u.policeStation && u.district ? " · " : ""}
                  {u.district ? `जनपद ${u.district}` : ""}
                </Text>
              )}

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

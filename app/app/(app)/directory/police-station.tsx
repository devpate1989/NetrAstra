import { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { Text } from "../../../components/Text";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
import { ChipSelect } from "../../../components/ChipSelect";
import { FormField } from "../../../components/FormField";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { useAuth } from "../../../context/AuthContext";
import { apiRequest, ApiError } from "../../../lib/api";
import type { StationPersonnel, UserRole } from "../../../types";

const ROLE_LABELS: Record<UserRole, string> = {
  io: "Investigating Officer",
  sho: "SHO",
  admin: "Admin",
};

type RoleFilter = "all" | UserRole;

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sho", label: "SHO" },
  { value: "admin", label: "Admin" },
  { value: "io", label: "IO" },
];

export default function PoliceStationDirectoryScreen() {
  const { user } = useAuth();

  const [personnel, setPersonnel] = useState<StationPersonnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { personnel: data } = await apiRequest<{ personnel: StationPersonnel[] }>("/directory/personnel");
      setPersonnel(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the station directory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return personnel.filter((p) => {
      if (roleFilter !== "all" && p.role !== roleFilter) return false;
      if (query && !p.fullName?.toLowerCase().includes(query) && !p.username?.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [personnel, search, roleFilter]);

  return (
    <ScreenContainer
      title="Station Directory"
      subtitle={
        user?.policeStation
          ? `थाना ${user.policeStation}${user.district ? ` · जनपद ${user.district}` : ""}`
          : "Officers at your station"
      }
    >
      <Banner message={error} variant="error" />

      <FormField
        label="Search by name"
        placeholder="e.g. Rajesh Kumar"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />

      <ChipSelect label="Role" value={roleFilter} options={ROLE_FILTERS} onChange={setRoleFilter} />

      {loading ? (
        <View className="items-center py-10">
          <ActivityIndicator size="large" color="#1d4ed8" />
        </View>
      ) : filtered.length === 0 ? (
        <View className="items-center py-10">
          <Text className="text-sm text-slate-500">No personnel match your search.</Text>
        </View>
      ) : (
        filtered.map((p) => <PersonnelRow key={p.id} person={p} />)
      )}

      <View className="mt-2">
        <PrimaryButton label="Back to Dashboard" variant="outline" onPress={() => router.replace("/(app)/dashboard")} />
      </View>
    </ScreenContainer>
  );
}

const PersonnelRow = memo(function PersonnelRow({ person }: { person: StationPersonnel }) {
  const initial = (person.fullName || person.username || "?").trim().charAt(0).toUpperCase();

  function handleCall() {
    if (!person.phone) return;
    Linking.openURL(`tel:${person.phone}`).catch(() => {});
  }

  return (
    <View className="mb-3 w-full rounded-xl border border-slate-200 bg-white p-4">
      <View className="flex-row items-center">
        {person.avatarUrl ? (
          <Image source={{ uri: person.avatarUrl }} className="mr-3 h-11 w-11 rounded-full bg-slate-100" />
        ) : (
          <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-brand-100">
            <Text className="text-lg font-bold text-brand-700">{initial}</Text>
          </View>
        )}
        <View className="flex-1">
          <Text className="text-base font-semibold text-slate-900">{person.fullName}</Text>
          <Text className="mt-0.5 text-xs text-slate-500">@{person.username}</Text>
        </View>
        <View className="rounded-full bg-brand-50 px-3 py-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {ROLE_LABELS[person.role] ?? person.role}
          </Text>
        </View>
      </View>

      {person.phone ? (
        <Pressable
          onPress={handleCall}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 active:bg-brand-700"
        >
          <MaterialIcons name="call" size={16} color="#fff" />
          <Text className="text-sm font-semibold text-white">Call {person.phone}</Text>
        </Pressable>
      ) : (
        <Text className="mt-3 text-xs italic text-slate-400">No contact number on file</Text>
      )}
    </View>
  );
});

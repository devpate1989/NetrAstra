import { ActivityIndicator, Pressable, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Text } from "./Text";
import { useOffline } from "../context/OfflineContext";

/** Shows device offline status and/or pending offline-scan queue, with a manual sync action. */
export function OfflineBanner() {
  const { isOnline, outboxCount, syncing, syncNow } = useOffline();

  if (isOnline && outboxCount === 0) return null;

  const message = !isOnline
    ? outboxCount > 0
      ? `Offline — ${outboxCount} scan${outboxCount === 1 ? "" : "s"} queued for upload`
      : "You're offline — showing cached data where available"
    : `${outboxCount} scan${outboxCount === 1 ? "" : "s"} waiting to upload`;

  return (
    <View
      className={`mb-4 w-full flex-row items-center justify-between rounded-lg border px-4 py-3 ${
        isOnline ? "border-amber-200 bg-amber-50" : "border-slate-300 bg-slate-100"
      }`}
    >
      <View className="mr-2 flex-1 flex-row items-center gap-2">
        <MaterialIcons name={isOnline ? "cloud-queue" : "cloud-off"} size={18} color={isOnline ? "#d97706" : "#475569"} />
        <Text className={`flex-1 text-xs font-medium ${isOnline ? "text-amber-700" : "text-slate-600"}`}>{message}</Text>
      </View>
      {isOnline && outboxCount > 0 && (
        <Pressable onPress={syncNow} disabled={syncing} className="flex-row items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5">
          {syncing ? <ActivityIndicator size="small" color="#1d4ed8" /> : <MaterialIcons name="sync" size={14} color="#1d4ed8" />}
          <Text className="text-xs font-semibold text-brand-600">{syncing ? "Syncing…" : "Sync now"}</Text>
        </Pressable>
      )}
    </View>
  );
}

import { memo, useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { useFocusEffect } from "expo-router";
import { Text } from "../../../components/Text";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
import { apiRequest, ApiError } from "../../../lib/api";

interface AuditLogEntry {
  id: string;
  actorUsername: string | null;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  "user.create": "Created user account",
  "user.update": "Updated user",
  "user.reset_password": "Reset user's password",
  "user.bulk_create": "Bulk-imported users",
  "auth.change_password": "Changed own password",
  "auth.reset_password": "Reset password via link",
  "auth.admin_generate_reset_link": "Generated password reset link",
  "report.submit": "Submitted report",
};

const ACTION_ICONS: Record<string, React.ComponentProps<typeof MaterialIcons>["name"]> = {
  "user.create": "person-add",
  "user.update": "manage-accounts",
  "user.reset_password": "lock-reset",
  "user.bulk_create": "upload-file",
  "auth.change_password": "password",
  "auth.reset_password": "password",
  "auth.admin_generate_reset_link": "link",
  "report.submit": "description",
};

function formatDetails(details: Record<string, unknown> | null): string | null {
  if (!details) return null;
  const parts = Object.entries(details).map(([key, value]) => `${key}: ${String(value)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AuditEntryRow = memo(function AuditEntryRow({ entry }: { entry: AuditLogEntry }) {
  const detailsText = formatDetails(entry.details);
  return (
    <View className="mb-3 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <View className="flex-row items-start gap-3">
        <View className="mt-0.5 h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
          <MaterialIcons name={ACTION_ICONS[entry.action] ?? "history"} size={18} color="#64748b" />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-slate-900">
            {ACTION_LABELS[entry.action] ?? entry.action}
          </Text>
          <Text className="mt-0.5 text-xs text-slate-500">
            {entry.actorUsername ? `@${entry.actorUsername}` : "Unknown user"} · {formatDate(entry.createdAt)}
          </Text>
          {detailsText ? (
            <Text className="mt-1.5 text-xs text-slate-400">{detailsText}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
});

export default function AuditLogScreen() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const hasMore = entries.length < total;

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    setError("");
    try {
      const data = await apiRequest<{ entries: AuditLogEntry[]; total: number }>(
        `/admin/audit-log?page=1&limit=${PAGE_SIZE}`
      );
      setEntries(data.entries);
      setTotal(data.total);
      setPage(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the audit log.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await apiRequest<{ entries: AuditLogEntry[]; total: number }>(
        `/admin/audit-log?page=${nextPage}&limit=${PAGE_SIZE}`
      );
      setEntries((prev) => [...prev, ...data.entries]);
      setTotal(data.total);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load more entries.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <ScreenContainer
      title="Audit Log"
      subtitle="Sensitive admin and report actions for accountability"
      scrollable={false}
    >
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AuditEntryRow entry={item} />}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); load(false); }} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={<Banner message={error} variant="error" />}
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center py-10">
              <ActivityIndicator size="large" color="#1d4ed8" />
            </View>
          ) : (
            <Banner message="No audit log entries yet." variant="info" />
          )
        }
        ListFooterComponent={
          hasMore ? (
            <Pressable
              onPress={loadMore}
              disabled={loadingMore}
              className="mt-2 flex-row items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color="#1d4ed8" />
              ) : (
                <MaterialIcons name="expand-more" size={18} color="#1d4ed8" />
              )}
              <Text className="text-sm font-semibold text-brand-600">
                {loadingMore ? "Loading…" : "Load more"}
              </Text>
            </Pressable>
          ) : null
        }
      />
    </ScreenContainer>
  );
}

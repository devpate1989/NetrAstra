import { memo, useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { Text } from "../../components/Text";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Banner } from "../../components/Banner";
import { apiRequest, ApiError } from "../../lib/api";
import type { AppNotification } from "../../types/notification";

const TYPE_ICONS: Record<string, React.ComponentProps<typeof MaterialIcons>["name"]> = {
  jansunwai_assigned: "assignment-ind",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const NotificationRow = memo(function NotificationRow({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: (item: AppNotification) => void;
}) {
  const isUnread = !item.readAt;
  return (
    <Pressable
      onPress={() => onPress(item)}
      className={`mb-3 w-full rounded-2xl border p-4 shadow-sm ${
        isUnread ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-white"
      }`}
    >
      <View className="flex-row items-start gap-3">
        <View className={`mt-0.5 h-10 w-10 items-center justify-center rounded-xl ${isUnread ? "bg-brand-100" : "bg-slate-100"}`}>
          <MaterialIcons
            name={TYPE_ICONS[item.type] ?? "notifications"}
            size={18}
            color={isUnread ? "#1d4ed8" : "#64748b"}
          />
        </View>
        <View className="flex-1">
          <Text className={`text-sm ${isUnread ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>
            {item.title}
          </Text>
          <Text className="mt-1 text-sm text-slate-600">{item.body}</Text>
          <Text className="mt-1.5 text-xs text-slate-400">{formatDate(item.createdAt)}</Text>
        </View>
        {isUnread ? <View className="mt-1.5 h-2.5 w-2.5 rounded-full bg-brand-600" /> : null}
      </View>
    </Pressable>
  );
});

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState("");

  const hasUnread = notifications.some((n) => !n.readAt);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    setError("");
    try {
      const data = await apiRequest<{ notifications: AppNotification[] }>("/notifications");
      setNotifications(data.notifications);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load notifications.");
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

  const handlePress = async (item: AppNotification) => {
    if (!item.readAt) {
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)));
      try {
        await apiRequest(`/notifications/${item.id}/read`, { method: "PATCH" });
      } catch {
        // Non-critical — local state already updated optimistically.
      }
    }

    const applicationId = item.data?.applicationId;
    if (typeof applicationId === "string") {
      router.push({ pathname: "/(app)/jansunwai/[id]", params: { id: applicationId } });
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await apiRequest("/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not mark notifications as read.");
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <ScreenContainer title="Notifications" subtitle="Assignments and updates" scrollable={false}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <NotificationRow item={item} onPress={handlePress} />}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); load(false); }} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            <Banner message={error} variant="error" />
            {hasUnread ? (
              <Pressable
                onPress={handleMarkAllRead}
                disabled={markingAll}
                className="mb-3 flex-row items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                {markingAll ? (
                  <ActivityIndicator size="small" color="#1d4ed8" />
                ) : (
                  <MaterialIcons name="done-all" size={16} color="#1d4ed8" />
                )}
                <Text className="text-sm font-semibold text-brand-600">Mark all as read</Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center py-10">
              <ActivityIndicator size="large" color="#1d4ed8" />
            </View>
          ) : (
            <Banner message="No notifications yet." variant="info" />
          )
        }
      />
    </ScreenContainer>
  );
}

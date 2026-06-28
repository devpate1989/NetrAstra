import { memo, useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import { Text } from "../../../components/Text";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
import { OfflineBanner } from "../../../components/OfflineBanner";
import { ApiError } from "../../../lib/api";
import { listLegalAnalyses } from "../../../lib/legalAnalysis";
import { cacheLegalAnalyses, getCachedLegalAnalyses } from "../../../lib/offlineCache";
import type { LegalAnalysis } from "../../../types/legal";

const PAGE_SIZE = 20;

const STATUS_ICON: Record<string, React.ComponentProps<typeof MaterialIcons>["name"]> = {
  processing: "hourglass-top",
  completed: "check-circle",
  failed: "error",
};

const STATUS_COLOR: Record<string, string> = {
  processing: "#f59e0b",
  completed: "#059669",
  failed: "#dc2626",
};

const MODE_LABELS: Record<string, string> = {
  quick: "Quick",
  deep: "Deep Research",
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

const AnalysisRow = memo(function AnalysisRow({ item }: { item: LegalAnalysis }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/(app)/legal/[id]", params: { id: item.id } })}
      className="mb-3 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
    >
      <View className="flex-row items-center">
        <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
          <MaterialIcons name="gavel" size={20} color="#4f46e5" />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>
            {item.caseType || "Legal Analysis"}
          </Text>
          <Text className="mt-0.5 text-xs text-slate-400">
            {MODE_LABELS[item.mode]} · {formatDate(item.createdAt)}
          </Text>
          {item.summary ? (
            <Text className="mt-1 text-xs text-slate-500" numberOfLines={1}>
              {item.summary}
            </Text>
          ) : null}
        </View>
        <MaterialIcons name={STATUS_ICON[item.status] ?? "help"} size={18} color={STATUS_COLOR[item.status] ?? "#94a3b8"} />
      </View>
    </Pressable>
  );
});

export default function LegalHistoryScreen() {
  const [analyses, setAnalyses] = useState<LegalAnalysis[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const hasMore = analyses.length < total;

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    setError("");
    try {
      const data = await listLegalAnalyses(1, PAGE_SIZE);
      setAnalyses(data.analyses);
      setTotal(data.total);
      setPage(1);
      cacheLegalAnalyses(data.analyses).catch(() => {});
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        // Likely offline — fall back to the local cache.
        const cached = await getCachedLegalAnalyses();
        setAnalyses(cached);
        setTotal(cached.length);
        setPage(1);
      }
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
      const data = await listLegalAnalyses(nextPage, PAGE_SIZE);
      setAnalyses((prev) => [...prev, ...data.analyses]);
      setTotal(data.total);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load more analyses.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <ScreenContainer title="Legal Analysis History" subtitle="All analyses you've run" scrollable={false}>
      <FlatList
        data={analyses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AnalysisRow item={item} />}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); load(false); }} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <>
            <OfflineBanner />
            <Banner message={error} variant="error" />
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center py-10">
              <ActivityIndicator size="large" color="#1d4ed8" />
            </View>
          ) : (
            <Banner message="No analyses yet." variant="info" />
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
              <Text className="text-sm font-semibold text-brand-600">{loadingMore ? "Loading…" : "Load more"}</Text>
            </Pressable>
          ) : null
        }
      />
    </ScreenContainer>
  );
}

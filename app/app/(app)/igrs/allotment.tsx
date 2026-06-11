import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../../../components/Text";
import { Banner } from "../../../components/Banner";
import { apiRequest, ApiError } from "../../../lib/api";
import type { IgrsApplication, IoOfficer, ReferenceSummaryRow } from "../../../types/jansunwai";

type Filter = "all" | "unallotted" | "allotted";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unallotted", label: "Unallotted" },
  { value: "allotted", label: "Allotted" },
];

const PAGE_SIZE = 50;

// The reference-summary sync submits 28 search forms (14 categories x 2 pages)
// against the portal — give it more room than the default API timeout.
const REFERENCE_SUMMARY_SYNC_TIMEOUT_MS = 180_000;

// The applications sync now pages through all 14 संदर्भ प्रकार categories
// (and their result pages) to scrape every pending आवेदन, not just one
// category — give it the same headroom as the reference-summary sync.
const APPLICATIONS_SYNC_TIMEOUT_MS = 180_000;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function IgrsAllotmentScreen() {
  const [apps, setApps] = useState<IgrsApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Allot modal
  const [allotTarget, setAllotTarget] = useState<IgrsApplication | null>(null);
  const [officers, setOfficers] = useState<IoOfficer[] | null>(null);
  const [officerSearch, setOfficerSearch] = useState("");
  const [selectedOfficer, setSelectedOfficer] = useState<IoOfficer | null>(null);
  const [allotting, setAllotting] = useState(false);
  const [allotError, setAllotError] = useState("");

  // Reference-type (संदर्भ प्रकार) summary
  const [refSummary, setRefSummary] = useState<ReferenceSummaryRow[]>([]);
  const [refSummaryLoading, setRefSummaryLoading] = useState(true);
  const [refSummarySyncing, setRefSummarySyncing] = useState(false);
  const [refSummaryError, setRefSummaryError] = useState("");
  const [refSummaryExpanded, setRefSummaryExpanded] = useState(false);

  const pageRef = useRef(1);
  const hasMore = apps.length < total;

  // ── Data loading ─────────────────────────────────────────

  async function fetchPage(f: Filter, p: number, append: boolean) {
    try {
      const { applications, total: t } = await apiRequest<{
        applications: IgrsApplication[];
        total: number;
      }>(`/jansunwai/all?filter=${f}&page=${p}&limit=${PAGE_SIZE}`);
      if (append) {
        setApps((prev) => [...prev, ...applications]);
      } else {
        setApps(applications);
        // Derive last-sync from most recent scrapedAt
        const latest = applications
          .map((a) => (a.scrapedAt ? new Date(a.scrapedAt).getTime() : 0))
          .reduce((max, t) => (t > max ? t : max), 0);
        if (latest > 0) setLastSyncTime(new Date(latest).toISOString());
      }
      setTotal(t);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load applications.");
    }
  }

  const reload = useCallback(
    async (f: Filter) => {
      setLoading(true);
      setError("");
      pageRef.current = 1;
      await fetchPage(f, 1, false);
      setLoading(false);
    },
    [] // eslint-disable-line
  );

  const loadReferenceSummary = useCallback(async () => {
    try {
      const { summary } = await apiRequest<{ summary: ReferenceSummaryRow[] }>("/jansunwai/reference-summary");
      setRefSummary(summary);
    } catch (err) {
      setRefSummaryError(err instanceof ApiError ? err.message : "Could not load reference summary.");
    } finally {
      setRefSummaryLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload(filter);
      loadReferenceSummary();
    }, [reload, filter, loadReferenceSummary])
  );

  const handleReferenceSummarySync = async () => {
    setRefSummarySyncing(true);
    setRefSummaryError("");
    try {
      await apiRequest("/jansunwai/reference-summary/refresh", {
        method: "POST",
        timeoutMs: REFERENCE_SUMMARY_SYNC_TIMEOUT_MS,
      });
      await loadReferenceSummary();
    } catch (err) {
      setRefSummaryError(err instanceof ApiError ? err.message : "Sync failed. Please try again.");
    } finally {
      setRefSummarySyncing(false);
    }
  };

  const handleFilterChange = (f: Filter) => {
    setFilter(f);
    reload(f);
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    pageRef.current = nextPage;
    await fetchPage(filter, nextPage, true);
    setLoadingMore(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    setError("");
    try {
      await apiRequest("/jansunwai/refresh", { method: "POST", timeoutMs: APPLICATIONS_SYNC_TIMEOUT_MS });
      setLastSyncTime(new Date().toISOString());
      await reload(filter);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  // ── Allotment ────────────────────────────────────────────

  const openAllotModal = async (app: IgrsApplication) => {
    setAllotTarget(app);
    setSelectedOfficer(null);
    setOfficerSearch("");
    setAllotError("");
    if (!officers) {
      try {
        const { officers: data } = await apiRequest<{ officers: IoOfficer[] }>("/jansunwai/officers");
        setOfficers(data);
      } catch {
        setOfficers([]);
      }
    }
  };

  const confirmAllot = async () => {
    if (!allotTarget || !selectedOfficer) return;
    setAllotting(true);
    setAllotError("");
    try {
      const { application } = await apiRequest<{ application: IgrsApplication }>(
        `/jansunwai/${allotTarget.id}/allot`,
        { method: "PATCH", body: { ioId: selectedOfficer.id } }
      );
      setApps((prev) => prev.map((a) => (a.id === application.id ? application : a)));
      setAllotTarget(null);
    } catch (err) {
      setAllotError(err instanceof ApiError ? err.message : "Could not allot this application.");
    } finally {
      setAllotting(false);
    }
  };

  // ── Render helpers ───────────────────────────────────────

  const filteredOfficers = (officers ?? []).filter((o) => {
    const q = officerSearch.toLowerCase();
    return !q || (o.fullName ?? "").toLowerCase().includes(q) || o.username.toLowerCase().includes(q);
  });

  const renderApp = ({ item: app }: { item: IgrsApplication }) => {
    const allotted = !!app.assignedIoId;
    return (
      <View style={styles.card}>
        {/* Top row: app number + date */}
        <View style={styles.cardHeader}>
          <Text className="font-mono text-xs font-bold text-slate-700">{app.applicationNumber}</Text>
          <Text className="text-xs text-slate-400">
            {app.scrapedAt ? new Date(app.scrapedAt).toLocaleDateString("en-IN") : ""}
          </Text>
        </View>

        <View style={styles.cardBody}>
          {/* Subject */}
          {app.subject ? (
            <Text className="mb-1.5 text-xs font-semibold text-brand-600" numberOfLines={1}>
              {app.subject}
            </Text>
          ) : null}

          {/* Petitioner row */}
          <View className="mb-2 flex-row items-center gap-1.5">
            <MaterialIcons name="person-outline" size={13} color="#94a3b8" />
            <Text className="flex-1 text-sm text-slate-800" numberOfLines={1}>
              {app.petitionerName ?? "Unknown petitioner"}
              {app.petitionerMobile ? (
                <Text className="font-mono text-xs text-slate-400"> · {app.petitionerMobile}</Text>
              ) : null}
            </Text>
          </View>

          {/* Description */}
          {app.description ? (
            <Text className="mb-3 text-xs leading-relaxed text-slate-500" numberOfLines={2}>
              {app.description}
            </Text>
          ) : null}

          {/* Allotment row */}
          {allotted ? (
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5">
                <MaterialIcons name="check-circle" size={13} color="#059669" />
                <Text className="text-xs font-medium text-emerald-700" numberOfLines={1}>
                  {app.assignedIoName ?? "Assigned"}
                </Text>
              </View>
              <Pressable
                onPress={() => openAllotModal(app)}
                className="rounded-lg px-3 py-1.5"
                hitSlop={8}
              >
                <Text className="text-xs font-semibold text-brand-600">Re-allot</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => openAllotModal(app)}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5"
            >
              <MaterialIcons name="assignment-ind" size={15} color="#fff" />
              <Text className="text-sm font-semibold text-white">Allot</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const renderOfficer = ({ item: o }: { item: IoOfficer }) => {
    const selected = selectedOfficer?.id === o.id;
    return (
      <Pressable
        onPress={() => setSelectedOfficer(o)}
        style={[styles.officerRow, selected && styles.officerRowSelected]}
      >
        <View style={[styles.officerAvatar, selected && styles.officerAvatarSelected]}>
          <MaterialIcons name="person" size={16} color={selected ? "#fff" : "#64748b"} />
        </View>
        <View className="flex-1">
          <Text className={`text-sm font-semibold ${selected ? "text-brand-700" : "text-slate-800"}`}>
            {o.fullName ?? o.username}
          </Text>
          <Text className="font-mono text-xs text-slate-400">@{o.username}</Text>
        </View>
        {selected ? <MaterialIcons name="check-circle" size={18} color="#1d4ed8" /> : null}
      </Pressable>
    );
  };

  // ── UI ───────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top"]}>
      {/* Header */}
      <View className="border-b border-slate-200 bg-white px-5 pb-4 pt-5">
        <View className="mb-3 flex-row items-start justify-between">
          <View>
            <Text className="text-2xl font-bold text-slate-900">IGRS Allotment</Text>
            <Text className="mt-0.5 text-xs text-slate-400">
              {lastSyncTime ? `Synced ${timeAgo(lastSyncTime)}` : "Not synced yet"}
              {" · "}
              {total} application{total !== 1 ? "s" : ""}
              {" · "}Auto-sync every 30 min
            </Text>
          </View>
          <Pressable
            onPress={handleSync}
            disabled={syncing || loading}
            className="flex-row items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2"
          >
            {syncing
              ? <ActivityIndicator size="small" color="#1d4ed8" />
              : <MaterialIcons name="sync" size={16} color="#1d4ed8" />}
            <Text className="text-sm font-medium text-brand-600">{syncing ? "Syncing…" : "Sync now"}</Text>
          </Pressable>
        </View>

        {/* Filter chips */}
        <View className="flex-row gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <Pressable
                key={f.value}
                onPress={() => handleFilterChange(f.value)}
                className={`flex-1 items-center rounded-xl py-2 ${active ? "bg-brand-600" : "border border-slate-200 bg-slate-50"}`}
              >
                <Text className={`text-sm font-semibold ${active ? "text-white" : "text-slate-600"}`}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Error */}
      {error ? (
        <View className="px-5 pt-3">
          <Banner message={error} variant="error" />
        </View>
      ) : null}

      {/* List */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1d4ed8" />
        </View>
      ) : (
        <FlatList
          data={apps}
          keyExtractor={(item) => item.id}
          renderItem={renderApp}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <ReferenceSummaryCard
              rows={refSummary}
              loading={refSummaryLoading}
              syncing={refSummarySyncing}
              error={refSummaryError}
              expanded={refSummaryExpanded}
              onToggleExpand={() => setRefSummaryExpanded((v) => !v)}
              onSync={handleReferenceSummarySync}
            />
          }
          ListEmptyComponent={
            <View className="mt-16 items-center">
              <MaterialIcons name="assignment" size={48} color="#e2e8f0" />
              <Text className="mt-3 text-sm text-slate-400">
                {filter === "unallotted"
                  ? "All applications have been allotted."
                  : filter === "allotted"
                  ? "No applications allotted yet."
                  : "No applications found. Tap Sync now to fetch from the portal."}
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View className="py-5">
                <ActivityIndicator size="small" color="#1d4ed8" />
              </View>
            ) : hasMore ? null : apps.length > 0 ? (
              <Text className="py-4 text-center text-xs text-slate-400">
                All {total} applications loaded
              </Text>
            ) : null
          }
        />
      )}

      {/* ── Allot modal ──────────────────────────────────────── */}
      <Modal
        visible={allotTarget !== null}
        animationType="slide"
        transparent
        onRequestClose={() => !allotting && setAllotTarget(null)}
      >
        <View className="flex-1 justify-end bg-black/40">
          <View style={styles.modalSheet}>
            {/* Modal header */}
            <View className="flex-row items-center justify-between border-b border-slate-100 px-5 py-4">
              <View className="flex-1 pr-4">
                <Text className="text-base font-bold text-slate-900">
                  {allotTarget?.assignedIoId ? "Re-allot Application" : "Allot Application"}
                </Text>
                <Text className="font-mono text-xs text-slate-500" numberOfLines={1}>
                  {allotTarget?.applicationNumber}
                  {allotTarget?.petitionerName ? ` · ${allotTarget.petitionerName}` : ""}
                </Text>
              </View>
              <Pressable onPress={() => !allotting && setAllotTarget(null)} hitSlop={10}>
                <MaterialIcons name="close" size={22} color="#64748b" />
              </Pressable>
            </View>

            {/* Current assignment notice */}
            {allotTarget?.assignedIoName ? (
              <View className="mx-5 mt-3 flex-row items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5">
                <MaterialIcons name="info-outline" size={15} color="#d97706" />
                <Text className="flex-1 text-xs text-amber-700">
                  Currently assigned to <Text className="font-semibold">{allotTarget.assignedIoName}</Text>
                </Text>
              </View>
            ) : null}

            {/* Search box */}
            <View className="flex-row items-center gap-2 border-b border-slate-100 px-5 py-3 mt-2">
              <MaterialIcons name="search" size={18} color="#94a3b8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search officer by name…"
                placeholderTextColor="#94a3b8"
                value={officerSearch}
                onChangeText={setOfficerSearch}
                autoCapitalize="none"
              />
              {officerSearch.length > 0 && (
                <Pressable onPress={() => setOfficerSearch("")} hitSlop={8}>
                  <MaterialIcons name="cancel" size={16} color="#94a3b8" />
                </Pressable>
              )}
            </View>

            {/* Allot error */}
            {allotError ? (
              <View className="mx-5 mt-2 rounded-xl bg-red-50 px-4 py-2">
                <Text className="text-xs text-red-600">{allotError}</Text>
              </View>
            ) : null}

            {/* Officer list */}
            {officers === null ? (
              <View className="items-center py-8">
                <ActivityIndicator color="#1d4ed8" />
              </View>
            ) : (
              <FlatList
                data={filteredOfficers}
                keyExtractor={(o) => o.id}
                renderItem={renderOfficer}
                style={styles.officerList}
                contentContainerStyle={styles.officerListContent}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text className="py-6 text-center text-sm text-slate-400">
                    {officers.length === 0
                      ? "No IO officers found. Add some from Admin → Users."
                      : "No officer matches your search."}
                  </Text>
                }
              />
            )}

            {/* Confirm row */}
            <View className="flex-row gap-3 border-t border-slate-100 px-5 py-4">
              <Pressable
                onPress={() => setAllotTarget(null)}
                disabled={allotting}
                className="flex-1 items-center rounded-xl border border-slate-200 py-3"
              >
                <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmAllot}
                disabled={!selectedOfficer || allotting}
                className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 ${selectedOfficer && !allotting ? "bg-brand-600" : "bg-slate-200"}`}
              >
                {allotting ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text
                  className={`text-sm font-semibold ${selectedOfficer && !allotting ? "text-white" : "text-slate-400"}`}
                >
                  {allotting ? "Allotting…" : "Confirm Allotment"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── संदर्भ प्रकार-wise summary card ─────────────────────────
function ReferenceSummaryCard({
  rows,
  loading,
  syncing,
  error,
  expanded,
  onToggleExpand,
  onSync,
}: {
  rows: ReferenceSummaryRow[];
  loading: boolean;
  syncing: boolean;
  error: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onSync: () => void;
}) {
  const totals = rows.reduce(
    (acc, r) => ({
      unmark: acc.unmark + r.unmarkCount,
      office: acc.office + r.officePendingCount,
      total: acc.total + r.totalPending,
    }),
    { unmark: 0, office: 0, total: 0 }
  );
  const lastSync = rows.find((r) => r.scrapedAt)?.scrapedAt ?? null;
  const visibleRows = expanded ? rows : rows.slice(0, 3);

  return (
    <View style={styles.summaryCard}>
      <Pressable onPress={onToggleExpand} className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-1 pr-3">
          <Text className="text-sm font-bold text-slate-900">संदर्भ प्रकार-वार लम्बित</Text>
          <Text className="mt-0.5 text-xs text-slate-400">
            {lastSync ? `Synced ${timeAgo(lastSync)}` : "Not synced yet"}
            {rows.length > 0 ? ` · Total pending ${totals.total}` : ""}
          </Text>
        </View>
        <MaterialIcons name={expanded ? "expand-less" : "expand-more"} size={22} color="#64748b" />
      </Pressable>

      {error ? (
        <View className="px-4 pb-2">
          <Text className="text-xs text-red-600">{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View className="items-center pb-4">
          <ActivityIndicator size="small" color="#1d4ed8" />
        </View>
      ) : rows.length === 0 ? (
        <View className="px-4 pb-4">
          <Text className="text-xs text-slate-400">No data yet. Tap Sync to fetch from the portal.</Text>
        </View>
      ) : (
        <View className="px-4 pb-2">
          {/* Column headers */}
          <View className="flex-row items-center border-b border-slate-100 pb-2">
            <Text className="flex-1 text-[11px] font-semibold uppercase text-slate-400">संदर्भ प्रकार</Text>
            <Text style={styles.summaryColHeader}>Unmark</Text>
            <Text style={styles.summaryColHeader}>Office</Text>
            <Text style={styles.summaryColHeader}>Total</Text>
          </View>

          {visibleRows.map((row) => (
            <View key={row.complaintTypeCode} className="flex-row items-center border-b border-slate-50 py-2">
              <Text className="flex-1 pr-2 text-xs text-slate-700" numberOfLines={2}>
                {row.complaintTypeName}
              </Text>
              <Text style={styles.summaryColValue}>{row.unmarkCount}</Text>
              <Text style={styles.summaryColValue}>{row.officePendingCount}</Text>
              <Text style={[styles.summaryColValue, styles.summaryColTotal]}>{row.totalPending}</Text>
            </View>
          ))}

          {!expanded && rows.length > 3 ? (
            <Pressable onPress={onToggleExpand} className="items-center py-2">
              <Text className="text-xs font-semibold text-brand-600">Show all {rows.length} categories</Text>
            </Pressable>
          ) : null}

          {/* Totals row */}
          <View className="flex-row items-center border-t border-slate-100 pt-2">
            <Text className="flex-1 text-xs font-bold text-slate-900">Total</Text>
            <Text style={[styles.summaryColValue, styles.summaryColBold]}>{totals.unmark}</Text>
            <Text style={[styles.summaryColValue, styles.summaryColBold]}>{totals.office}</Text>
            <Text style={[styles.summaryColValue, styles.summaryColBold, styles.summaryColTotal]}>
              {totals.total}
            </Text>
          </View>
        </View>
      )}

      {/* Sync */}
      <Pressable
        onPress={onSync}
        disabled={syncing}
        className="flex-row items-center justify-center gap-1.5 border-t border-slate-100 py-2.5"
      >
        {syncing ? (
          <ActivityIndicator size="small" color="#1d4ed8" />
        ) : (
          <MaterialIcons name="sync" size={14} color="#1d4ed8" />
        )}
        <Text className="text-xs font-semibold text-brand-600">
          {syncing ? "Syncing…" : "Sync reference summary"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
    overflow: "hidden",
  },
  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 16,
    overflow: "hidden",
  },
  summaryColHeader: {
    width: 52,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  summaryColValue: {
    width: 52,
    textAlign: "right",
    fontSize: 12,
    color: "#1e293b",
  },
  summaryColTotal: {
    color: "#1d4ed8",
    fontWeight: "700",
  },
  summaryColBold: {
    fontWeight: "700",
    color: "#0f172a",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#f8fafc",
  },
  cardBody: {
    padding: 16,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  officerList: {
    maxHeight: 320,
  },
  officerListContent: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  officerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "#f8fafc",
  },
  officerRowSelected: {
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
  },
  officerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  officerAvatarSelected: {
    backgroundColor: "#1d4ed8",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#1e293b",
    paddingVertical: 2,
  },
});

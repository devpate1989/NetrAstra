import { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { Text } from "../../components/Text";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Banner } from "../../components/Banner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { FormField } from "../../components/FormField";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, ApiError } from "../../lib/api";
import type { Investigation, InvestigationGroup, ScrapeRefreshResult } from "../../types/investigation";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function pendingDays(registeredOn: string | null): number | null {
  if (!registeredOn) return null;
  const reg = new Date(registeredOn);
  if (Number.isNaN(reg.getTime())) return null;
  return Math.floor((Date.now() - reg.getTime()) / (1000 * 60 * 60 * 24));
}

function pendingBadgeStyle(days: number): { bg: string; border: string; labelColor: string; dotColor: string } {
  if (days >= 60) return { bg: "#dc2626", border: "#b91c1c", labelColor: "#fecaca", dotColor: "#dc2626" };
  if (days >= 20) return { bg: "#f97316", border: "#ea580c", labelColor: "#ffedd5", dotColor: "#f97316" };
  return { bg: "#16a34a", border: "#15803d", labelColor: "#bbf7d0", dotColor: "#16a34a" };
}

type AgeBucket = "30" | "60" | "90" | "90plus";

function ageBucketKey(days: number): AgeBucket {
  if (days <= 30) return "30";
  if (days <= 60) return "60";
  if (days <= 90) return "90";
  return "90plus";
}

const AGE_BUCKETS: { key: AgeBucket; label: string; color: string }[] = [
  { key: "30", label: "≤ 30 days", color: "#059669" },
  { key: "60", label: "31–60 days", color: "#d97706" },
  { key: "90", label: "61–90 days", color: "#ea580c" },
  { key: "90plus", label: "90+ days", color: "#dc2626" },
];

interface EditState {
  ioName: string;
  section: string;
}

const CaseRow = memo(function CaseRow({
  item,
  canEdit,
  saving,
  onSave,
  showIoName,
}: {
  item: Investigation;
  canEdit: boolean;
  saving: boolean;
  onSave: (id: string, changes: EditState) => Promise<void>;
  showIoName?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditState>({ ioName: item.ioName ?? "", section: item.section ?? "" });

  const startEdit = () => {
    setDraft({ ioName: item.ioName ?? "", section: item.section ?? "" });
    setEditing(true);
  };

  const submit = async () => {
    await onSave(item.id, draft);
    setEditing(false);
  };

  const days = pendingDays(item.registeredOn);
  const badge = days !== null ? pendingBadgeStyle(days) : null;

  return (
    <View className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {badge && days !== null && (
        <View
          style={{ backgroundColor: badge.bg, borderBottomWidth: 1, borderBottomColor: badge.border }}
          className="flex-row items-center justify-between px-4 py-3"
        >
          <Text style={{ color: badge.labelColor }} className="text-xs font-semibold uppercase tracking-wide">
            Pending since
          </Text>
          <Text style={{ color: "#ffffff" }} className="text-2xl font-extrabold">
            {String(days)} days
          </Text>
        </View>
      )}
      <View className="p-4">
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-slate-900">{item.externalReference || "No reference"}</Text>
          <Text className="text-xs text-slate-500">{formatDate(item.registeredOn)}</Text>
        </View>
        <Text className="text-sm text-slate-700">{item.complainantName || "Unknown complainant"}</Text>
        {showIoName ? (
          <Text className="mt-0.5 text-xs font-medium text-brand-600">{item.ioName || "Unassigned"}</Text>
        ) : null}
        {item.caseSummary ? (
          <Text className="mt-1 text-xs text-slate-500">{item.caseSummary}</Text>
        ) : null}
        {editing ? (
          <View className="mt-3 rounded-lg bg-slate-50 p-3">
            <FormField label="IO name" value={draft.ioName} onChangeText={(v) => setDraft((d) => ({ ...d, ioName: v }))} />
            <FormField label="धारा (Section)" value={draft.section} onChangeText={(v) => setDraft((d) => ({ ...d, section: v }))} />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <PrimaryButton label="Save" onPress={submit} loading={saving} />
              </View>
              <View className="flex-1">
                <PrimaryButton label="Cancel" variant="outline" onPress={() => setEditing(false)} />
              </View>
            </View>
          </View>
        ) : (
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            <View className="rounded-full bg-slate-100 px-3 py-1">
              <Text className="text-xs font-medium text-slate-600">धारा: {item.section || "—"}</Text>
            </View>
            {item.caseStatus ? (
              <View className="rounded-full bg-amber-100 px-3 py-1">
                <Text className="text-xs font-medium text-amber-700">{item.caseStatus}</Text>
              </View>
            ) : null}
            {canEdit ? (
              <Pressable onPress={startEdit} className="ml-auto rounded-full border border-brand-600 px-3 py-1">
                <Text className="text-xs font-medium text-brand-600">Edit</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
});

export default function InvestigationsScreen() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin";
  const { io: ioFilter } = useLocalSearchParams<{ io?: string }>();

  const [groups, setGroups] = useState<InvestigationGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ageBucket, setAgeBucket] = useState<AgeBucket | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<{ groupedByIo: InvestigationGroup[] }>("/investigations");
      setGroups(data.groupedByIo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load pending investigations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    setError("");
    setNotice("");
    try {
      const { result } = await apiRequest<{ result: ScrapeRefreshResult }>("/investigations/refresh", { method: "POST" });
      if ("started" in result) {
        setNotice("Sync started in the background — check back in a minute.");
      } else if (result.skipped) {
        setNotice(result.reason || "The CCTNS portal is not configured yet.");
      } else {
        setNotice(`Refreshed — stored ${result.stored} of ${result.scraped} pending investigations.`);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not refresh from the CCTNS portal.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = useCallback(async (id: string, changes: EditState) => {
    setSavingId(id);
    setError("");
    try {
      await apiRequest(`/investigations/${id}`, {
        method: "PATCH",
        body: { ioName: changes.ioName.trim(), section: changes.section.trim() },
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes.");
    } finally {
      setSavingId(null);
    }
  }, [load]);

  const isIo = user?.role === "io";

  const allCases = useMemo(() => (groups ?? []).flatMap((g) => g.cases), [groups]);

  const bucketCounts = useMemo(() => {
    const counts: Record<AgeBucket, number> = { "30": 0, "60": 0, "90": 0, "90plus": 0 };
    for (const item of allCases) {
      const days = pendingDays(item.registeredOn);
      if (days === null) continue;
      counts[ageBucketKey(days)] += 1;
    }
    return counts;
  }, [allCases]);

  const flatBucketCases = useMemo(() => {
    if (!ageBucket) return null;
    return allCases.filter((item) => {
      if (ioFilter && item.ioName !== ioFilter) return false;
      const days = pendingDays(item.registeredOn);
      return days !== null && ageBucketKey(days) === ageBucket;
    });
  }, [allCases, ageBucket, ioFilter]);

  const displayGroups = !isIo && ioFilter ? (groups ?? []).filter((g) => g.ioName === ioFilter) : groups;
  const totalCases = displayGroups?.reduce((sum, g) => sum + g.cases.length, 0) ?? 0;

  const bucketLabel = ageBucket ? AGE_BUCKETS.find((b) => b.key === ageBucket)?.label : null;

  return (
    <ScreenContainer
      title={bucketLabel ? `Pendency ${bucketLabel}` : !isIo && ioFilter ? ioFilter : isIo ? "My Pending Cases" : "Pending Investigations"}
      subtitle={
        isIo
          ? "CCTNS-tracked cases assigned to you"
          : bucketLabel
            ? "CCTNS-tracked pending cases in this age range"
            : ioFilter
              ? "CCTNS-tracked pending cases for this officer"
              : "CCTNS report tracker — categorized by Investigating Officer (IO)"
      }
    >
      {!isIo && ioFilter ? (
        <View className="mb-4">
          <Pressable
            onPress={() => router.replace("/(app)/investigations")}
            className="flex-row items-center self-start gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5"
          >
            <MaterialIcons name="arrow-back" size={14} color="#475569" />
            <Text className="text-xs font-medium text-slate-600">All officers</Text>
          </Pressable>
        </View>
      ) : null}

      {!isIo && !ioFilter && groups && groups.length > 0 ? (
        <View className="mb-4">
          <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pendency by age
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {AGE_BUCKETS.map((bucket) => {
              const active = ageBucket === bucket.key;
              return (
                <Pressable
                  key={bucket.key}
                  onPress={() => setAgeBucket(active ? null : bucket.key)}
                  style={{ backgroundColor: active ? bucket.color : `${bucket.color}1A` }}
                  className="flex-1 items-center rounded-xl px-3 py-3"
                >
                  <Text style={{ color: active ? "#fff" : bucket.color }} className="text-2xl font-extrabold">
                    {bucketCounts[bucket.key]}
                  </Text>
                  <Text style={{ color: active ? "#fff" : bucket.color }} className="mt-0.5 text-xs font-semibold">
                    {bucket.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {ageBucket ? (
        <View className="mb-4">
          <Pressable
            onPress={() => setAgeBucket(null)}
            className="flex-row items-center self-start gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5"
          >
            <MaterialIcons name="arrow-back" size={14} color="#475569" />
            <Text className="text-xs font-medium text-slate-600">Clear day filter</Text>
          </Pressable>
        </View>
      ) : null}

      {!isIo && (
        <View className="mb-4">
          <PrimaryButton
            label={refreshing ? "Refreshing…" : "Refresh from CCTNS portal"}
            onPress={handleRefresh}
            loading={refreshing}
            variant="outline"
            icon="sync"
          />
        </View>
      )}

      <Banner message={error} variant="error" />
      <Banner message={notice} variant="info" />

      {loading && !groups ? (
        <ActivityIndicator color="#1d4ed8" />
      ) : ageBucket ? (
        flatBucketCases && flatBucketCases.length > 0 ? (
          <>
            <Text className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              {flatBucketCases.length} pending case{flatBucketCases.length === 1 ? "" : "s"}
            </Text>
            {flatBucketCases.map((item) => (
              <CaseRow key={item.id} item={item} canEdit={canEdit} saving={savingId === item.id} onSave={handleSave} showIoName />
            ))}
          </>
        ) : (
          <Text className="mt-2 text-sm text-slate-500">No pending cases in this age range.</Text>
        )
      ) : displayGroups && displayGroups.length > 0 ? (
        <>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {ioFilter ? "" : "IO-wise pendency"}
            </Text>
            <View className="flex-row gap-3">
              <View className="flex-row items-center gap-1">
                <View style={{ backgroundColor: "#16a34a" }} className="h-2.5 w-2.5 rounded-full" />
                <Text className="text-xs text-slate-500">&lt;20d</Text>
              </View>
              <View className="flex-row items-center gap-1">
                <View style={{ backgroundColor: "#f97316" }} className="h-2.5 w-2.5 rounded-full" />
                <Text className="text-xs text-slate-500">20–59d</Text>
              </View>
              <View className="flex-row items-center gap-1">
                <View style={{ backgroundColor: "#dc2626" }} className="h-2.5 w-2.5 rounded-full" />
                <Text className="text-xs text-slate-500">60d+</Text>
              </View>
            </View>
          </View>
          <Text className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            {displayGroups.length} IO{displayGroups.length === 1 ? "" : "s"} · {totalCases} pending case{totalCases === 1 ? "" : "s"}
          </Text>
          {displayGroups.map((group) => (
            <View key={group.ioName} className="mb-5">
              <Text className="mb-2 text-base font-bold text-slate-900">{group.ioName}</Text>
              {group.cases.map((item) => (
                <CaseRow key={item.id} item={item} canEdit={canEdit} saving={savingId === item.id} onSave={handleSave} />
              ))}
            </View>
          ))}
        </>
      ) : (
        <Text className="mt-2 text-sm text-slate-500">
          {isIo
            ? "No pending cases are assigned to you in CCTNS right now."
            : ioFilter
              ? `No pending investigations found for ${ioFilter}.`
              : 'No pending investigations are stored yet. Tap "Refresh from CCTNS portal" once the portal URL and credentials are configured.'}
        </Text>
      )}
    </ScreenContainer>
  );
}

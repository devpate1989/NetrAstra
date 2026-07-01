import { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, ScrollView, View } from "react-native";
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

type AgeBucket = "30" | "60" | "90" | "90plus";

function ageBucketKey(days: number): AgeBucket {
  if (days <= 30) return "30";
  if (days <= 60) return "60";
  if (days <= 90) return "90";
  return "90plus";
}

const AGE_BUCKETS: { key: AgeBucket; label: string; sublabel: string; bg: string; accent: string; icon: string }[] = [
  { key: "30",     label: "≤ 30 days",  sublabel: "Fresh",    bg: "#065f46", accent: "#34d399", icon: "check-circle" },
  { key: "60",     label: "31–60 days", sublabel: "Moderate", bg: "#92400e", accent: "#fbbf24", icon: "schedule"     },
  { key: "90",     label: "61–90 days", sublabel: "Urgent",   bg: "#9a3412", accent: "#fb923c", icon: "warning"      },
  { key: "90plus", label: "90+ days",   sublabel: "Critical", bg: "#7f1d1d", accent: "#f87171", icon: "emergency"    },
];

interface EditState { ioName: string; section: string; }

function FirPdfButton({ externalReference }: { externalReference: string | null }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  if (!externalReference) return null;
  const handle = async () => {
    setState("loading");
    try {
      const d = await apiRequest<{ url: string | null }>(`/investigations/fir-pdf/${encodeURIComponent(externalReference)}`);
      if (d.url) { await Linking.openURL(d.url); setState("idle"); }
      else { setState("error"); setTimeout(() => setState("idle"), 3000); }
    } catch { setState("error"); setTimeout(() => setState("idle"), 3000); }
  };
  return (
    <Pressable onPress={handle} disabled={state === "loading"}
      className="flex-row items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 active:opacity-70">
      <MaterialIcons name={state === "loading" ? "hourglass-empty" : state === "error" ? "error-outline" : "picture-as-pdf"} size={14}
        color={state === "error" ? "#dc2626" : "#e11d48"} />
      <Text className={`text-xs font-semibold ${state === "error" ? "text-red-600" : "text-rose-700"}`}>
        {state === "loading" ? "Loading…" : state === "error" ? "Not available" : "FIR PDF"}
      </Text>
    </Pressable>
  );
}

const CaseRow = memo(function CaseRow({
  item, canEdit, saving, onSave, showIoName,
}: {
  item: Investigation; canEdit: boolean; saving: boolean;
  onSave: (id: string, changes: EditState) => Promise<void>;
  showIoName?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditState>({ ioName: item.ioName ?? "", section: item.section ?? "" });
  const days = pendingDays(item.registeredOn);

  const badgeBg = days === null ? "#64748b"
    : days >= 90 ? "#7f1d1d"
    : days >= 60 ? "#9a3412"
    : days >= 30 ? "#92400e"
    : "#065f46";

  return (
    <View className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <View style={{ backgroundColor: badgeBg }} className="flex-row items-center justify-between px-4 py-2.5">
        <Text className="text-xs font-bold uppercase tracking-wider text-white/80">Pending since</Text>
        <Text className="text-xl font-extrabold text-white">{days !== null ? `${days} days` : "—"}</Text>
      </View>
      <View className="p-4">
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-slate-900">{item.externalReference || "No reference"}</Text>
          <Text className="text-xs text-slate-400">{formatDate(item.registeredOn)}</Text>
        </View>
        <Text className="text-sm text-slate-600">{item.complainantName || "Unknown complainant"}</Text>
        {showIoName && item.ioName ? (
          <View className="mt-1 flex-row items-center gap-1">
            <MaterialIcons name="person" size={12} color="#1d4ed8" />
            <Text className="text-xs font-medium text-brand-600">{item.ioName}</Text>
          </View>
        ) : null}
        {item.caseSummary ? <Text className="mt-1 text-xs text-slate-400" numberOfLines={2}>{item.caseSummary}</Text> : null}
        {editing ? (
          <View className="mt-3 rounded-lg bg-slate-50 p-3">
            <FormField label="IO name" value={draft.ioName} onChangeText={(v) => setDraft((d) => ({ ...d, ioName: v }))} />
            <FormField label="धारा (Section)" value={draft.section} onChangeText={(v) => setDraft((d) => ({ ...d, section: v }))} />
            <View className="flex-row gap-2">
              <View className="flex-1"><PrimaryButton label="Save" onPress={async () => { await onSave(item.id, draft); setEditing(false); }} loading={saving} /></View>
              <View className="flex-1"><PrimaryButton label="Cancel" variant="outline" onPress={() => setEditing(false)} /></View>
            </View>
          </View>
        ) : (
          <View>
            <View className="mt-2 flex-row flex-wrap items-center gap-2">
              <View className="rounded-full bg-slate-100 px-3 py-1">
                <Text className="text-xs text-slate-600">धारा: {item.section || "—"}</Text>
              </View>
              {item.caseStatus ? <View className="rounded-full bg-amber-100 px-3 py-1"><Text className="text-xs text-amber-700">{item.caseStatus}</Text></View> : null}
              {canEdit ? <Pressable onPress={() => { setDraft({ ioName: item.ioName ?? "", section: item.section ?? "" }); setEditing(true); }} className="ml-auto rounded-full border border-brand-600 px-3 py-1"><Text className="text-xs font-medium text-brand-600">Edit</Text></Pressable> : null}
            </View>
            {/* FIR PDF download */}
            <View className="mt-2">
              <FirPdfButton externalReference={item.externalReference} />
            </View>
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

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleRefresh = async () => {
    setRefreshing(true); setError(""); setNotice("");
    try {
      const { result } = await apiRequest<{ result: ScrapeRefreshResult }>("/investigations/refresh", { method: "POST" });
      if ("started" in result) setNotice("Sync started in the background — check back in a minute.");
      else if (result.skipped) setNotice(result.reason || "CCTNS portal not configured.");
      else setNotice(`Refreshed — ${result.stored}/${result.scraped} stored.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not refresh from the CCTNS portal.");
    } finally { setRefreshing(false); }
  };

  const handleSave = useCallback(async (id: string, changes: EditState) => {
    setSavingId(id); setError("");
    try {
      await apiRequest(`/investigations/${id}`, { method: "PATCH", body: { ioName: changes.ioName.trim(), section: changes.section.trim() } });
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not save changes."); }
    finally { setSavingId(null); }
  }, [load]);

  const isIo = user?.role === "io";
  const isShoAdmin = user?.role === "sho" || user?.role === "admin";

  const allCases = useMemo(() => (groups ?? []).flatMap((g) => g.cases), [groups]);

  const bucketCounts = useMemo(() => {
    const c: Record<AgeBucket, number> = { "30": 0, "60": 0, "90": 0, "90plus": 0 };
    for (const item of allCases) {
      const d = pendingDays(item.registeredOn);
      if (d !== null) c[ageBucketKey(d)] += 1;
    }
    return c;
  }, [allCases]);

  // IO-wise numerical summary (deduplicated, sorted by count)
  const ioNumerical = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of groups ?? []) {
      const clean = (g.ioName || "Unassigned").replace(/\s*-\s*$/, "").trim();
      counts.set(clean, (counts.get(clean) ?? 0) + g.cases.length);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [groups]);

  // When age bucket tapped → flat filtered list
  const bucketCases = useMemo(() => {
    if (!ageBucket) return null;
    return allCases.filter((item) => {
      const d = pendingDays(item.registeredOn);
      return d !== null && ageBucketKey(d) === ageBucket;
    });
  }, [allCases, ageBucket]);

  // IO-filter view: show that IO's cases
  const ioCases = useMemo(() => {
    if (!ioFilter) return null;
    return allCases.filter((item) => {
      const clean = (item.ioName || "").replace(/\s*-\s*$/, "").trim();
      return clean === ioFilter || item.ioName === ioFilter;
    });
  }, [allCases, ioFilter]);

  const totalCases = allCases.length;
  const bucketMeta = ageBucket ? AGE_BUCKETS.find((b) => b.key === ageBucket) : null;

  // ── IO detail view (drill-down from io-summary or age bucket) ──────────
  if (ioFilter) {
    return (
      <ScreenContainer scrollable={false} title={ioFilter} subtitle="Pending CCTNS cases for this officer">
        <View className="mb-4">
          <Pressable onPress={() => router.replace("/(app)/investigations")} className="flex-row items-center self-start gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5">
            <MaterialIcons name="arrow-back" size={14} color="#475569" />
            <Text className="text-xs font-medium text-slate-600">Back</Text>
          </Pressable>
        </View>
        <Banner message={error} variant="error" />
        {loading ? <ActivityIndicator color="#1d4ed8" /> : (
          <FlatList
            data={ioCases ?? []}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => <CaseRow item={item} canEdit={canEdit} saving={savingId === item.id} onSave={handleSave} />}
            ListHeaderComponent={ioCases?.length ? <Text className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">{ioCases.length} case{ioCases.length !== 1 ? "s" : ""}</Text> : null}
            ListEmptyComponent={<Text className="mt-2 text-sm text-slate-500">No pending cases.</Text>}
            showsVerticalScrollIndicator={false}
          />
        )}
      </ScreenContainer>
    );
  }

  // ── Age-bucket drill-down ────────────────────────────────────────────────
  if (ageBucket && bucketMeta) {
    return (
      <ScreenContainer scrollable={false} title={`${bucketMeta.sublabel} Cases`} subtitle={`Pending ${bucketMeta.label}`}>
        <View className="mb-4">
          <Pressable onPress={() => setAgeBucket(null)} className="flex-row items-center self-start gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5">
            <MaterialIcons name="arrow-back" size={14} color="#475569" />
            <Text className="text-xs font-medium text-slate-600">Back to summary</Text>
          </Pressable>
        </View>
        <Banner message={error} variant="error" />
        <FlatList
          data={bucketCases ?? []}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <CaseRow item={item} canEdit={canEdit} saving={savingId === item.id} onSave={handleSave} showIoName />}
          ListHeaderComponent={bucketCases?.length ? <Text className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">{bucketCases.length} case{bucketCases.length !== 1 ? "s" : ""}</Text> : null}
          ListEmptyComponent={<Text className="mt-2 text-sm text-slate-500">No pending cases in this range.</Text>}
          showsVerticalScrollIndicator={false}
        />
      </ScreenContainer>
    );
  }

  // ── IO's own view ───────────────────────────────────────────────────────
  if (isIo) {
    return (
      <ScreenContainer scrollable={false} title="My Pending Cases" subtitle="CCTNS-tracked cases assigned to you">
        <Banner message={error} variant="error" />
        {loading ? <ActivityIndicator color="#1d4ed8" /> : (
          <FlatList
            data={allCases}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => <CaseRow item={item} canEdit={false} saving={false} onSave={handleSave} />}
            ListEmptyComponent={<Text className="mt-2 text-sm text-slate-500">No pending cases assigned to you.</Text>}
            showsVerticalScrollIndicator={false}
          />
        )}
      </ScreenContainer>
    );
  }

  // ── Main SHO/Admin summary view ─────────────────────────────────────────
  return (
    <ScreenContainer title="Pending Investigations" subtitle={`CCTNS — ${totalCases} cases across ${ioNumerical.length} IOs`}>
      {/* Refresh */}
      <View className="mb-5">
        <PrimaryButton label={refreshing ? "Refreshing…" : "Refresh from CCTNS portal"} onPress={handleRefresh} loading={refreshing} variant="outline" icon="sync" />
      </View>

      <Banner message={error} variant="error" />
      <Banner message={notice} variant="info" />

      {loading ? (
        <ActivityIndicator color="#1d4ed8" />
      ) : (
        <>
          {/* ── SECTION 1: PENDENCY BY AGE (most important, highly highlighted) ── */}
          <View className="mb-6">
            <View className="mb-3 flex-row items-center gap-2">
              <View className="h-1 flex-1 rounded-full bg-slate-900" />
              <Text className="text-sm font-extrabold uppercase tracking-widest text-slate-900">
                ⏱ Pendency by Age
              </Text>
              <View className="h-1 flex-1 rounded-full bg-slate-900" />
            </View>

            <View className="flex-row gap-3">
              {/* Left column */}
              <View className="flex-1 gap-3">
                {AGE_BUCKETS.slice(0, 2).map((b) => (
                  <Pressable
                    key={b.key}
                    onPress={() => setAgeBucket(b.key)}
                    style={{ backgroundColor: b.bg }}
                    className="rounded-2xl p-4 shadow-lg active:opacity-80"
                  >
                    <Text style={{ color: b.accent }} className="text-4xl font-black">{bucketCounts[b.key]}</Text>
                    <Text style={{ color: b.accent }} className="mt-1 text-xs font-bold uppercase tracking-wide">{b.label}</Text>
                    <Text style={{ color: `${b.accent}99` }} className="text-xs">{b.sublabel}</Text>
                    <View className="mt-2 flex-row items-center justify-end">
                      <MaterialIcons name={b.icon as any} size={14} color={b.accent} />
                    </View>
                  </Pressable>
                ))}
              </View>
              {/* Right column */}
              <View className="flex-1 gap-3">
                {AGE_BUCKETS.slice(2).map((b) => (
                  <Pressable
                    key={b.key}
                    onPress={() => setAgeBucket(b.key)}
                    style={{ backgroundColor: b.bg }}
                    className="rounded-2xl p-4 shadow-lg active:opacity-80"
                  >
                    <Text style={{ color: b.accent }} className="text-4xl font-black">{bucketCounts[b.key]}</Text>
                    <Text style={{ color: b.accent }} className="mt-1 text-xs font-bold uppercase tracking-wide">{b.label}</Text>
                    <Text style={{ color: `${b.accent}99` }} className="text-xs">{b.sublabel}</Text>
                    <View className="mt-2 flex-row items-center justify-end">
                      <MaterialIcons name={b.icon as any} size={14} color={b.accent} />
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
            <Text className="mt-2 text-center text-xs text-slate-400">Tap any card to view those cases</Text>
          </View>

          {/* ── SECTION 2: IO-WISE NUMERICAL REPORT (संख्यात्मक) ── */}
          {ioNumerical.length > 0 && (
            <View className="mb-4">
              <View className="mb-3 flex-row items-center gap-2">
                <View className="h-0.5 flex-1 rounded-full bg-slate-300" />
                <Text className="text-sm font-bold uppercase tracking-wider text-slate-600">
                  IO-wise Numerical Report
                </Text>
                <View className="h-0.5 flex-1 rounded-full bg-slate-300" />
              </View>

              <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {/* Header row */}
                <View className="flex-row items-center bg-slate-100 px-4 py-2.5">
                  <Text className="w-8 text-xs font-bold text-slate-500">#</Text>
                  <Text className="flex-1 text-xs font-bold uppercase tracking-wide text-slate-500">Investigating Officer</Text>
                  <Text className="text-xs font-bold uppercase tracking-wide text-slate-500">Cases</Text>
                </View>

                {ioNumerical.map((io, idx) => {
                  const pct = ioNumerical.length > 1 ? io.count / ioNumerical[0].count : 1;
                  const barColor = pct > 0.7 ? "#dc2626" : pct > 0.4 ? "#f97316" : "#1d4ed8";
                  return (
                    <Pressable
                      key={io.name}
                      onPress={() => router.push({ pathname: "/(app)/investigations", params: { io: io.name } })}
                      className={`px-4 py-3 active:bg-slate-50 ${idx > 0 ? "border-t border-slate-100" : ""}`}
                    >
                      <View className="flex-row items-center">
                        <Text className="w-8 text-sm font-bold text-slate-400">{idx + 1}</Text>
                        <View className="flex-1 pr-3">
                          <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>{io.name}</Text>
                          {/* Mini bar */}
                          <View className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <View style={{ width: `${Math.round(pct * 100)}%`, backgroundColor: barColor }} className="h-full rounded-full" />
                          </View>
                        </View>
                        <View className="flex-row items-center gap-1.5">
                          <View style={{ backgroundColor: barColor }} className="h-7 min-w-[28px] items-center justify-center rounded-full px-2">
                            <Text className="text-xs font-extrabold text-white">{io.count}</Text>
                          </View>
                          <MaterialIcons name="chevron-right" size={16} color="#94a3b8" />
                        </View>
                      </View>
                    </Pressable>
                  );
                })}

                <View className="border-t border-slate-100 bg-slate-50 px-4 py-2.5">
                  <Text className="text-center text-xs font-medium text-slate-500">Total: {totalCases} cases · {ioNumerical.length} IOs</Text>
                </View>
              </View>
            </View>
          )}

          {!groups || groups.length === 0 ? (
            <Text className="mt-4 text-center text-sm text-slate-500">
              No pending investigations stored yet.{"\n"}Tap "Refresh" to sync from the CCTNS portal.
            </Text>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
import { Text } from "../../../components/Text";
import { apiRequest, ApiError } from "../../../lib/api";
import type { JanSunwaiSummary, ReferenceSummaryRow } from "../../../types/jansunwai";

const UNASSIGNED = "Unassigned";
const UNCLASSIFIED = "अवर्गीकृत (Unclassified)";

interface IoGroup {
  name: string;
  count: number;
}

interface SandarbhGroup {
  code: number | null;
  name: string;
  count: number;
}

function groupByIo(apps: JanSunwaiSummary[]): IoGroup[] {
  const counts = new Map<string, number>();
  for (const app of apps) {
    const name = app.assignedIoName ?? UNASSIGNED;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function groupBySandarbh(apps: JanSunwaiSummary[]): SandarbhGroup[] {
  const map = new Map<string, SandarbhGroup>();
  for (const app of apps) {
    const code = app.referenceTypeCode;
    const name = app.referenceTypeName ?? UNCLASSIFIED;
    const key = code != null ? String(code) : "unclassified";
    if (!map.has(key)) map.set(key, { code, name, count: 0 });
    map.get(key)!.count += 1;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export default function IgrsPendencyScreen() {
  const [applications, setApplications] = useState<JanSunwaiSummary[] | null>(null);
  const [refSummary, setRefSummary] = useState<ReferenceSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [{ applications: apps }, { summary }] = await Promise.all([
        apiRequest<{ applications: JanSunwaiSummary[] }>("/jansunwai/pending"),
        apiRequest<{ summary: ReferenceSummaryRow[] }>("/jansunwai/reference-summary"),
      ]);
      setApplications(apps);
      setRefSummary(summary);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load Jan Sunwai pendency.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const ioGroups = useMemo(() => (applications ? groupByIo(applications) : []), [applications]);
  const sandarbhGroups = useMemo(() => (applications ? groupBySandarbh(applications) : []), [applications]);
  const defaulterSoonTotal = useMemo(
    () => refSummary.reduce((sum, r) => sum + r.defaulter3DayCount, 0),
    [refSummary]
  );

  return (
    <ScreenContainer title="Pending IGRS" subtitle="जनसुनवाई पेंडेंसी अवलोकन — IO व संदर्भ-वार">
      {/* Allotment button — primary action at top */}
      <Pressable
        onPress={() => router.push("/(app)/igrs/allotment")}
        className="mb-5 flex-row items-center justify-between overflow-hidden rounded-2xl bg-indigo-600 px-5 py-4 active:bg-indigo-700"
      >
        <View className="flex-1 pr-3">
          <Text className="text-base font-bold text-white">IGRS Allotment</Text>
          <Text className="mt-0.5 text-xs text-indigo-100">
            View pending applications and allot to Investigating Officers
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="rounded-full bg-white/20 p-2">
            <MaterialIcons name="assignment-ind" size={20} color="#fff" />
          </View>
          <MaterialIcons name="chevron-right" size={20} color="#c7d2fe" />
        </View>
      </Pressable>

      <Banner message={error} variant="error" />

      {loading && !applications ? (
        <ActivityIndicator color="#1d4ed8" />
      ) : (
        <>
          {/* Defaulter in 3 days — urgent stat card */}
          <Pressable
            onPress={() => router.push({ pathname: "/(app)/igrs/pending-list", params: { defaulterSoon: "true" } })}
            className="mb-4 overflow-hidden rounded-2xl bg-rose-600 p-5 active:bg-rose-700"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-white">अगले 3 दिवसों में डिफाल्टर</Text>
                <Text className="mt-0.5 text-xs text-rose-100">Defaulter in next 3 days</Text>
              </View>
              <Text className="text-4xl font-extrabold text-white">{defaulterSoonTotal}</Text>
            </View>
            <View className="mt-3 flex-row items-center gap-1">
              <Text className="text-xs font-medium text-rose-100">View list</Text>
              <MaterialIcons name="chevron-right" size={14} color="#fee2e2" />
            </View>
          </Pressable>

          {/* IO-wise pendency */}
          <PendencyGroupCard
            title="IO-wise Pendency"
            subtitle="Tap an officer to view their pending आवेदन"
            headerBg="#eef2ff"
            headerText="#4338ca"
            badgeBg="#4f46e5"
            rows={ioGroups.map((g) => ({ key: g.name, label: g.name, count: g.count }))}
            onPress={(key) => router.push({ pathname: "/(app)/igrs/pending-list", params: { io: key } })}
          />

          {/* Sandarbh-wise pendency */}
          <PendencyGroupCard
            title="Sandarbh-wise Pendency (संदर्भ प्रकार)"
            subtitle="Tap a category to view its pending आवेदन"
            headerBg="#f5f3ff"
            headerText="#6d28d9"
            badgeBg="#7c3aed"
            rows={sandarbhGroups.map((g) => ({
              key: g.code != null ? String(g.code) : "unclassified",
              label: g.name,
              count: g.count,
            }))}
            onPress={(key, label) =>
              router.push({
                pathname: "/(app)/igrs/pending-list",
                params: { category: key, categoryLabel: label },
              })
            }
          />
        </>
      )}
    </ScreenContainer>
  );
}

function PendencyGroupCard({
  title,
  subtitle,
  headerBg,
  headerText,
  badgeBg,
  rows,
  onPress,
}: {
  title: string;
  subtitle: string;
  headerBg: string;
  headerText: string;
  badgeBg: string;
  rows: { key: string; label: string; count: number }[];
  onPress: (key: string, label: string) => void;
}) {
  return (
    <View className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <View style={{ backgroundColor: headerBg }} className="px-4 py-3">
        <Text style={{ color: headerText }} className="text-sm font-bold">
          {title}
        </Text>
        <Text className="mt-0.5 text-xs text-slate-500">{subtitle}</Text>
      </View>
      {rows.length === 0 ? (
        <Text className="px-4 py-4 text-xs text-slate-400">No pending आवेदन right now.</Text>
      ) : (
        rows.map((row, idx) => (
          <Pressable
            key={row.key}
            onPress={() => onPress(row.key, row.label)}
            className={`flex-row items-center justify-between px-4 py-3 active:bg-slate-50 ${idx > 0 ? "border-t border-slate-100" : ""}`}
          >
            <Text className="flex-1 pr-3 text-sm font-medium text-slate-800" numberOfLines={1}>
              {row.label}
            </Text>
            <View className="flex-row items-center gap-2">
              <View
                style={{ backgroundColor: badgeBg, minWidth: 28, height: 28, borderRadius: 14 }}
                className="items-center justify-center px-2"
              >
                <Text className="text-xs font-bold text-white">{row.count}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={18} color="#94a3b8" />
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}

import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { Text } from "../../../components/Text";
import { router, useFocusEffect } from "expo-router";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
import { apiRequest, ApiError } from "../../../lib/api";

interface IoSummaryRow {
  ioName: string;
  pendingCount: number;
}

function badgeStyle(count: number): { bg: string; text: string } {
  if (count >= 10) return { bg: "#dc2626", text: "#fff" };
  if (count >= 5)  return { bg: "#f97316", text: "#fff" };
  return { bg: "#1d4ed8", text: "#fff" };
}

/** Colorful intensity band behind each row based on rank (top → red, fade to blue). */
function rowAccent(index: number, total: number): string {
  const pct = total > 1 ? index / (total - 1) : 0;
  if (pct < 0.25) return "#fef2f2"; // rose tint — most overloaded
  if (pct < 0.5)  return "#fff7ed"; // amber tint
  if (pct < 0.75) return "#f0fdf4"; // green tint
  return "#eff6ff";                  // blue tint — lightest load
}

export default function IoSummaryScreen() {
  const [rows, setRows] = useState<IoSummaryRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setError("");
      apiRequest<{ summary: IoSummaryRow[]; total: number }>("/investigations/io-summary")
        .then((d) => { setRows(d.summary); setTotal(d.total); })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load data."))
        .finally(() => setLoading(false));
    }, [])
  );

  return (
    <ScreenContainer
      title="IO-wise Pendency"
      subtitle={`CCTNS pending FIRs — ${total} cases across ${rows?.length ?? 0} IOs`}
    >
      <Banner message={error} variant="error" />

      {loading && !rows ? (
        <ActivityIndicator color="#1d4ed8" />
      ) : rows && rows.length > 0 ? (
        <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {/* Header */}
          <View className="flex-row items-center border-b border-slate-100 bg-slate-800 px-4 py-3">
            <Text className="w-8 text-xs font-bold text-slate-300">#</Text>
            <Text className="flex-1 text-xs font-bold uppercase tracking-wide text-slate-200">
              Investigating Officer
            </Text>
            <Text className="text-xs font-bold uppercase tracking-wide text-slate-200">
              Pending
            </Text>
          </View>

          {rows.map((row, idx) => {
            const badge = badgeStyle(row.pendingCount);
            const bg = rowAccent(idx, rows.length);
            return (
              <Pressable
                key={row.ioName}
                onPress={() => router.push({
                  pathname: "/(app)/investigations",
                  params: { io: row.ioName },
                })}
                style={{ backgroundColor: bg }}
                className={`flex-row items-center px-4 py-3.5 active:opacity-70 ${
                  idx > 0 ? "border-t border-slate-100" : ""
                }`}
              >
                <Text className="w-8 text-sm font-bold text-slate-400">{idx + 1}</Text>

                <View className="flex-1 pr-3">
                  <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>
                    {row.ioName}
                  </Text>
                </View>

                <View className="flex-row items-center gap-2">
                  <View
                    style={{ backgroundColor: badge.bg, minWidth: 36, borderRadius: 18 }}
                    className="h-9 items-center justify-center px-3"
                  >
                    <Text style={{ color: badge.text }} className="text-sm font-extrabold">
                      {row.pendingCount}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color="#94a3b8" />
                </View>
              </Pressable>
            );
          })}

          {/* Summary footer */}
          <View className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            <Text className="text-center text-xs font-medium text-slate-500">
              Total: {total} pending FIRs across {rows.length} IOs
            </Text>
          </View>
        </View>
      ) : (
        <Text className="mt-2 text-sm text-slate-500">No pending investigation data available.</Text>
      )}
    </ScreenContainer>
  );
}

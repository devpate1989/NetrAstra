import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Text, TextInput } from "../../../components/Text";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
import { OfflineBanner } from "../../../components/OfflineBanner";
import { ApiError } from "../../../lib/api";
import { searchBnsMappings } from "../../../lib/legalAnalysis";
import { cacheBnsMappings, getCachedBnsMappings } from "../../../lib/offlineCache";
import type { BnsSectionMapping } from "../../../types/legal";

const ACT_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "IPC → BNS", value: "IPC" },
  { label: "CrPC → BNSS", value: "CrPC" },
  { label: "Evidence Act → BSA", value: "Evidence Act" },
];

export default function BnsLookupScreen() {
  const [mappings, setMappings] = useState<BnsSectionMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [actFilter, setActFilter] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await searchBnsMappings("");
      setMappings(data);
      cacheBnsMappings(data).catch(() => {});
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        // Likely offline — fall back to the cached reference table.
        const cached = await getCachedBnsMappings();
        if (cached.length > 0) {
          setMappings(cached);
        } else {
          setError("Could not load BNS section reference data. Connect to the internet and try again.");
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = mappings.filter((m) => {
      if (actFilter && m.oldAct !== actFilter) return false;
      if (!q) return true;
      return (
        m.oldSection.toLowerCase().includes(q) ||
        m.newSection.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
      );
    });

    const groups: { category: string; items: BnsSectionMapping[] }[] = [];
    for (const item of filtered) {
      const last = groups[groups.length - 1];
      if (last && last.category === item.category) {
        last.items.push(item);
      } else {
        groups.push({ category: item.category, items: [item] });
      }
    }
    return groups;
  }, [mappings, query, actFilter]);

  return (
    <ScreenContainer title="BNS / IPC Section Lookup" subtitle="Curated IPC, CrPC & Evidence Act → BNS, BNSS & BSA reference">
      <OfflineBanner />
      <Banner message={error} variant="error" />

      <Banner
        message="This is a curated reference for common sections, not the full criminal code. Always verify against the bare act / official gazette before citing in an official document."
        variant="info"
      />

      <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <MaterialIcons name="search" size={18} color="#94a3b8" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by section number or keyword (e.g. 420, theft, FIR)…"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          className="flex-1 text-sm text-slate-800"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")}>
            <MaterialIcons name="close" size={18} color="#94a3b8" />
          </Pressable>
        )}
      </View>

      <View className="mb-4 flex-row flex-wrap gap-2">
        {ACT_FILTERS.map((f) => (
          <Pressable
            key={f.value}
            onPress={() => setActFilter(f.value)}
            className={`rounded-full border px-3 py-1.5 ${actFilter === f.value ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white"}`}
          >
            <Text className={`text-xs font-semibold ${actFilter === f.value ? "text-brand-700" : "text-slate-600"}`}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View className="items-center py-10">
          <ActivityIndicator size="large" color="#1d4ed8" />
        </View>
      ) : grouped.length === 0 ? (
        <Banner message="No matching sections found." variant="info" />
      ) : (
        grouped.map((group) => (
          <View key={group.category} className="mb-4">
            <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{group.category}</Text>
            {group.items.map((item) => (
              <View key={item.id} className="mb-2 rounded-xl border border-slate-200 bg-white p-3">
                <View className="flex-row items-center gap-2">
                  <View className="rounded-full bg-slate-100 px-3 py-1">
                    <Text className="text-xs font-bold text-slate-600">
                      {item.oldAct} {item.oldSection}
                    </Text>
                  </View>
                  <MaterialIcons name="arrow-forward" size={14} color="#94a3b8" />
                  <View className="rounded-full bg-brand-50 px-3 py-1">
                    <Text className="text-xs font-bold text-brand-700">
                      {item.newAct} {item.newSection}
                    </Text>
                  </View>
                </View>
                <Text className="mt-2 text-sm text-slate-700">{item.title}</Text>
              </View>
            ))}
          </View>
        ))
      )}
    </ScreenContainer>
  );
}

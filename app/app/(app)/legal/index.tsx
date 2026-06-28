import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import { Text, TextInput } from "../../../components/Text";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Card } from "../../../components/Card";
import { Banner } from "../../../components/Banner";
import { OfflineBanner } from "../../../components/OfflineBanner";
import { ApiError } from "../../../lib/api";
import { analyzeLegalText, listLegalAnalyses } from "../../../lib/legalAnalysis";
import { cacheLegalAnalyses, getCachedLegalAnalyses } from "../../../lib/offlineCache";
import { useOffline } from "../../../context/OfflineContext";
import type { AnalysisMode, LegalAnalysis } from "../../../types/legal";

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

const MODE_LABELS: Record<AnalysisMode, { label: string; description: string }> = {
  quick: { label: "Quick", description: "Fast classification + applicable sections" },
  deep: { label: "Deep Research", description: "Thorough multi-section legal report" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LegalHubScreen() {
  const { isOnline } = useOffline();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<AnalysisMode>("quick");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const [recent, setRecent] = useState<LegalAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listLegalAnalyses(1, 5);
      setRecent(data.analyses);
      cacheLegalAnalyses(data.analyses).catch(() => {});
    } catch {
      // Likely offline — fall back to the local cache.
      const cached = await getCachedLegalAnalyses();
      setRecent(cached.slice(0, 5));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleAnalyze() {
    const trimmed = text.trim();
    if (!trimmed) return;

    setError("");
    setAnalyzing(true);
    try {
      const analysis = await analyzeLegalText({ text: trimmed, mode });
      setText("");
      setAnalyzing(false);
      load();
      router.push({ pathname: "/(app)/legal/[id]", params: { id: analysis.id } });
    } catch (err) {
      setAnalyzing(false);
      setError(err instanceof ApiError ? err.message : "Could not analyze this text.");
    }
  }

  return (
    <ScreenContainer title="Legal Analysis" subtitle="AI-assisted analysis under BNS / BNSS / BSA (2023)">
      <OfflineBanner />
      <Banner message={error} variant="error" />

      <Banner
        message="AI-generated legal analysis is a reference aid only. Always verify section numbers and reasoning against the bare act before relying on it in an official report."
        variant="info"
      />

      {analyzing && (
        <View className="mb-4 flex-row items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <ActivityIndicator size="small" color="#1d4ed8" />
          <Text className="text-sm font-medium text-brand-700">
            {mode === "deep" ? "Running deep research analysis…" : "Analyzing…"}
          </Text>
        </View>
      )}

      <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Paste a complaint, FIR, or case description
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Paste or type the text you want analyzed (Hindi or English)…"
        placeholderTextColor="#94a3b8"
        multiline
        numberOfLines={8}
        textAlignVertical="top"
        className="mb-3 min-h-[140px] rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
      />

      <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Mode</Text>
      <View className="mb-4 flex-row gap-2">
        {(Object.keys(MODE_LABELS) as AnalysisMode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            className={`flex-1 rounded-xl border p-3 ${mode === m ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white"}`}
          >
            <Text className={`text-sm font-semibold ${mode === m ? "text-brand-700" : "text-slate-800"}`}>
              {MODE_LABELS[m].label}
            </Text>
            <Text className="mt-0.5 text-xs text-slate-500">{MODE_LABELS[m].description}</Text>
          </Pressable>
        ))}
      </View>

      <View className="mb-6">
        <Pressable
          onPress={handleAnalyze}
          disabled={analyzing || !text.trim() || !isOnline}
          className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${
            analyzing || !text.trim() || !isOnline ? "bg-slate-200" : "bg-brand-600"
          }`}
        >
          {analyzing ? <ActivityIndicator size="small" color="#ffffff" /> : <MaterialIcons name="gavel" size={18} color="#ffffff" />}
          <Text className={`text-sm font-semibold ${analyzing || !text.trim() || !isOnline ? "text-slate-400" : "text-white"}`}>
            {analyzing ? "Analyzing…" : "Analyze"}
          </Text>
        </Pressable>
        {!isOnline && (
          <Text className="mt-2 text-xs text-slate-400">Connect to the internet to run legal analysis.</Text>
        )}
      </View>

      <Card
        title="BNS / IPC Section Lookup"
        description="Search the IPC, CrPC, and Evidence Act sections you know and find their BNS, BNSS, and BSA equivalents."
        meta="Search"
        icon="menu-book"
        onPress={() => router.push("/(app)/legal/bns-lookup")}
      />

      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent Analyses</Text>
        {recent.length > 0 && (
          <Pressable onPress={() => router.push("/(app)/legal/history")}>
            <Text className="text-sm font-semibold text-brand-600">View all</Text>
          </Pressable>
        )}
      </View>

      <View className="mt-3">
        {isLoading ? (
          <View className="items-center py-6">
            <ActivityIndicator size="small" color="#1d4ed8" />
          </View>
        ) : recent.length === 0 ? (
          <Banner message="No analyses yet. Paste some text above to get started." variant="info" />
        ) : (
          recent.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => router.push({ pathname: "/(app)/legal/[id]", params: { id: item.id } })}
              className="mb-3 w-full rounded-xl border border-slate-200 bg-white p-4 active:bg-slate-50"
            >
              <View className="flex-row items-center">
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                  <MaterialIcons name="gavel" size={20} color="#1d4ed8" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>
                    {item.caseType || "Legal Analysis"}
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-400">
                    {MODE_LABELS[item.mode].label} · {formatDate(item.createdAt)}
                  </Text>
                </View>
                <MaterialIcons name={STATUS_ICON[item.status] ?? "help"} size={18} color={STATUS_COLOR[item.status] ?? "#94a3b8"} />
              </View>
            </Pressable>
          ))
        )}
      </View>
    </ScreenContainer>
  );
}

import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Text } from "../../../components/Text";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
import { OfflineBanner } from "../../../components/OfflineBanner";
import { apiRequest, ApiError } from "../../../lib/api";
import { analyzeLegalText } from "../../../lib/legalAnalysis";
import { cacheScan, getCachedScan } from "../../../lib/offlineCache";
import { useOffline } from "../../../context/OfflineContext";
import type { OcrEntities, ScannedDocument } from "../../../types/document";
import type { AnalysisMode } from "../../../types/legal";

const LANGUAGE_LABELS: Record<string, string> = {
  hindi: "Hindi",
  english: "English",
  mixed: "Hindi + English",
  unknown: "Unknown",
};

const ENTITY_LABELS: Record<keyof OcrEntities, string> = {
  names: "Names",
  dates: "Dates",
  addresses: "Addresses",
  phoneNumbers: "Phone Numbers",
  firNumbers: "FIR Numbers",
  actsAndSections: "Acts & Sections",
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

export default function ScanResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isOnline } = useOffline();

  const [doc, setDoc] = useState<ScannedDocument | null>(null);
  const [isOfflineCopy, setIsOfflineCopy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [analyzing, setAnalyzing] = useState<AnalysisMode | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError("");
    try {
      const data = await apiRequest<{ document: ScannedDocument }>(`/documents/${id}`);
      setDoc(data.document);
      setIsOfflineCopy(false);
      cacheScan(data.document).catch(() => {});
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        // Likely offline — fall back to the local cache.
        const cached = await getCachedScan(id);
        if (cached) {
          setDoc(cached);
          setIsOfflineCopy(true);
        } else {
          setError("Could not load this scan. Connect to the internet and try again.");
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleCopy() {
    if (!doc?.extractedText) return;
    await Clipboard.setStringAsync(doc.extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete() {
    if (!doc) return;
    setDeleting(true);
    try {
      await apiRequest(`/documents/${doc.id}`, { method: "DELETE" });
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete this scan.");
      setDeleting(false);
    }
  }

  async function handleAnalyze(mode: AnalysisMode) {
    if (!doc) return;
    setError("");
    setAnalyzing(mode);
    try {
      const analysis = await analyzeLegalText({ documentId: doc.id, mode });
      setAnalyzing(null);
      router.push({ pathname: "/(app)/legal/[id]", params: { id: analysis.id } });
    } catch (err) {
      setAnalyzing(null);
      setError(err instanceof ApiError ? err.message : "Could not analyze this document.");
    }
  }

  if (isLoading) {
    return (
      <ScreenContainer title="Scan Result">
        <View className="items-center py-10">
          <ActivityIndicator size="large" color="#1d4ed8" />
        </View>
      </ScreenContainer>
    );
  }

  if (error || !doc) {
    return (
      <ScreenContainer title="Scan Result">
        <Banner message={error || "Scan not found."} variant="error" />
      </ScreenContainer>
    );
  }

  const entities = doc.entities;
  const hasEntities = entities ? Object.values(entities).some((values) => values.length > 0) : false;
  const hasKeywords = Boolean(doc.keywords && doc.keywords.length > 0);

  return (
    <ScreenContainer title={doc.fileName} subtitle={formatDate(doc.createdAt)}>
      <OfflineBanner />

      {isOfflineCopy && (
        <Banner message="You're offline — showing a cached copy from your last sync." variant="info" />
      )}

      {(doc.ocrStatus === "pending" || doc.ocrStatus === "processing") && (
        <View className="mb-4 flex-row items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <ActivityIndicator size="small" color="#d97706" />
          <Text className="text-sm font-medium text-amber-700">Still processing — pull down to refresh.</Text>
        </View>
      )}

      {doc.ocrStatus === "failed" && (
        <Banner message={doc.errorMessage || "OCR failed for this document."} variant="error" />
      )}

      {doc.previewUrl && doc.mimeType !== "application/pdf" && (
        <Image source={{ uri: doc.previewUrl }} className="mb-4 h-48 w-full rounded-xl bg-slate-100" resizeMode="contain" />
      )}

      {doc.ocrStatus === "completed" && (
        <>
          <View className="mb-4 flex-row gap-2">
            <View className="flex-1 rounded-xl border border-slate-200 bg-white p-3">
              <Text className="text-xs uppercase tracking-wide text-slate-400">Language</Text>
              <Text className="mt-1 text-sm font-semibold text-slate-800">
                {LANGUAGE_LABELS[doc.languageDetected ?? "unknown"]}
              </Text>
            </View>
            <View className="flex-1 rounded-xl border border-slate-200 bg-white p-3">
              <Text className="text-xs uppercase tracking-wide text-slate-400">Confidence</Text>
              <Text className="mt-1 text-sm font-semibold text-slate-800">
                {doc.confidence != null ? `${Math.round(doc.confidence * 100)}%` : "—"}
              </Text>
            </View>
          </View>

          <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-slate-900">Extracted Text</Text>
              <Pressable onPress={handleCopy} className="flex-row items-center gap-1">
                <MaterialIcons name={copied ? "check" : "content-copy"} size={16} color="#1d4ed8" />
                <Text className="text-xs font-semibold text-brand-600">{copied ? "Copied" : "Copy"}</Text>
              </Pressable>
            </View>
            <Text className="text-sm text-slate-700">{doc.extractedText || "No text found."}</Text>
          </View>

          {doc.extractedText ? (
            <View className="mb-4">
              <Text className="mb-2 text-sm font-semibold text-slate-900">Legal Analysis</Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => handleAnalyze("quick")}
                  disabled={analyzing !== null || !isOnline}
                  className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border px-4 py-3 ${
                    analyzing !== null || !isOnline ? "border-slate-200 bg-slate-100" : "border-brand-200 bg-brand-50"
                  }`}
                >
                  {analyzing === "quick" ? (
                    <ActivityIndicator size="small" color="#1d4ed8" />
                  ) : (
                    <MaterialIcons name="gavel" size={18} color={isOnline ? "#1d4ed8" : "#94a3b8"} />
                  )}
                  <Text className={`text-sm font-semibold ${isOnline ? "text-brand-700" : "text-slate-400"}`}>
                    {analyzing === "quick" ? "Analyzing…" : "Quick Analysis"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleAnalyze("deep")}
                  disabled={analyzing !== null || !isOnline}
                  className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border px-4 py-3 ${
                    analyzing !== null || !isOnline ? "border-slate-200 bg-slate-100" : "border-brand-600 bg-brand-600"
                  }`}
                >
                  {analyzing === "deep" ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <MaterialIcons name="travel-explore" size={18} color={isOnline ? "#ffffff" : "#94a3b8"} />
                  )}
                  <Text className={`text-sm font-semibold ${analyzing !== null || !isOnline ? "text-slate-400" : "text-white"}`}>
                    {analyzing === "deep" ? "Researching…" : "Deep Research"}
                  </Text>
                </Pressable>
              </View>
              {!isOnline && (
                <Text className="mt-2 text-xs text-slate-400">Connect to the internet to run legal analysis.</Text>
              )}
            </View>
          ) : null}

          {hasKeywords && (
            <View className="mb-4">
              <Text className="mb-2 text-sm font-semibold text-slate-900">Keywords</Text>
              <View className="flex-row flex-wrap gap-2">
                {doc.keywords!.map((keyword) => (
                  <View key={keyword} className="rounded-full bg-brand-50 px-3 py-1">
                    <Text className="text-xs font-medium text-brand-700">{keyword}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {hasEntities && entities && (
            <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
              <Text className="mb-2 text-sm font-semibold text-slate-900">Entities</Text>
              {(Object.keys(ENTITY_LABELS) as Array<keyof OcrEntities>).map((key) =>
                entities[key].length > 0 ? (
                  <View key={key} className="mb-2">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">{ENTITY_LABELS[key]}</Text>
                    <Text className="mt-0.5 text-sm text-slate-700">{entities[key].join(", ")}</Text>
                  </View>
                ) : null
              )}
            </View>
          )}
        </>
      )}

      <Pressable
        onPress={handleDelete}
        disabled={deleting}
        className="mt-2 flex-row items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
      >
        {deleting ? <ActivityIndicator size="small" color="#dc2626" /> : <MaterialIcons name="delete-outline" size={18} color="#dc2626" />}
        <Text className="text-sm font-semibold text-red-600">{deleting ? "Deleting…" : "Delete this scan"}</Text>
      </Pressable>
    </ScreenContainer>
  );
}

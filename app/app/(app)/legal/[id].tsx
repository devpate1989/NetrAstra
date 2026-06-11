import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Text } from "../../../components/Text";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
import { OfflineBanner } from "../../../components/OfflineBanner";
import { ApiError } from "../../../lib/api";
import { deleteLegalAnalysis, getLegalAnalysis } from "../../../lib/legalAnalysis";
import { cacheLegalAnalysis, getCachedLegalAnalysis } from "../../../lib/offlineCache";
import type { KeyFacts, LegalAnalysis, SectionRef } from "../../../types/legal";

const MODE_LABELS: Record<string, string> = {
  quick: "Quick Analysis",
  deep: "Deep Research",
};

const KEY_FACT_LABELS: Record<keyof KeyFacts, string> = {
  parties: "Parties",
  dates: "Dates",
  locations: "Locations",
  amounts: "Amounts",
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

function SectionCard({ section }: { section: SectionRef }) {
  return (
    <View className="mb-2 rounded-xl border border-slate-200 bg-white p-3">
      <View className="flex-row items-center justify-between">
        <View className="rounded-full bg-brand-50 px-3 py-1">
          <Text className="text-xs font-bold text-brand-700">
            {section.act} {section.section}
          </Text>
        </View>
        {section.oldEquivalent && (
          <Text className="text-xs text-slate-400">
            formerly {section.oldEquivalent.act} {section.oldEquivalent.section}
          </Text>
        )}
      </View>
      {section.title ? <Text className="mt-2 text-sm font-semibold text-slate-900">{section.title}</Text> : null}
      {section.relevance ? <Text className="mt-1 text-sm text-slate-600">{section.relevance}</Text> : null}
    </View>
  );
}

export default function LegalAnalysisResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [analysis, setAnalysis] = useState<LegalAnalysis | null>(null);
  const [isOfflineCopy, setIsOfflineCopy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError("");
    try {
      const data = await getLegalAnalysis(id);
      setAnalysis(data);
      setIsOfflineCopy(false);
      cacheLegalAnalysis(data).catch(() => {});
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        // Likely offline — fall back to the local cache.
        const cached = await getCachedLegalAnalysis(id);
        if (cached) {
          setAnalysis(cached);
          setIsOfflineCopy(true);
        } else {
          setError("Could not load this analysis. Connect to the internet and try again.");
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

  async function handleDelete() {
    if (!analysis) return;
    setDeleting(true);
    try {
      await deleteLegalAnalysis(analysis.id);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete this analysis.");
      setDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <ScreenContainer title="Legal Analysis">
        <View className="items-center py-10">
          <ActivityIndicator size="large" color="#1d4ed8" />
        </View>
      </ScreenContainer>
    );
  }

  if (error || !analysis) {
    return (
      <ScreenContainer title="Legal Analysis">
        <Banner message={error || "Analysis not found."} variant="error" />
      </ScreenContainer>
    );
  }

  const keyFacts = analysis.keyFacts;
  const hasKeyFacts = keyFacts ? Object.values(keyFacts).some((values) => values.length > 0) : false;
  const hasSections = Boolean(analysis.applicableSections && analysis.applicableSections.length > 0);
  const hasActions = Boolean(analysis.recommendedActions && analysis.recommendedActions.length > 0);
  const detailed = analysis.detailedAnalysis;
  const hasSimilar = Boolean(detailed?.similarProvisions && detailed.similarProvisions.length > 0);

  return (
    <ScreenContainer title={analysis.caseType || "Legal Analysis"} subtitle={`${MODE_LABELS[analysis.mode]} · ${formatDate(analysis.createdAt)}`}>
      <OfflineBanner />

      {isOfflineCopy && (
        <Banner message="You're offline — showing a cached copy from your last sync." variant="info" />
      )}

      {analysis.status === "processing" && (
        <View className="mb-4 flex-row items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <ActivityIndicator size="small" color="#d97706" />
          <Text className="text-sm font-medium text-amber-700">Still processing — pull down to refresh.</Text>
        </View>
      )}

      {analysis.status === "failed" && (
        <Banner message={analysis.errorMessage || "Legal analysis failed."} variant="error" />
      )}

      {analysis.status === "completed" && (
        <>
          {analysis.summary ? (
            <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
              <Text className="mb-1 text-sm font-semibold text-slate-900">Summary</Text>
              <Text className="text-sm text-slate-700">{analysis.summary}</Text>
            </View>
          ) : null}

          <View className="mb-4">
            <Text className="mb-2 text-sm font-semibold text-slate-900">Applicable Sections</Text>
            {hasSections ? (
              analysis.applicableSections!.map((section, idx) => <SectionCard key={`${section.act}-${section.section}-${idx}`} section={section} />)
            ) : (
              <Banner message="No specific sections were identified for this text." variant="info" />
            )}
          </View>

          {hasKeyFacts && keyFacts && (
            <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
              <Text className="mb-2 text-sm font-semibold text-slate-900">Key Facts</Text>
              {(Object.keys(KEY_FACT_LABELS) as Array<keyof KeyFacts>).map((key) =>
                keyFacts[key].length > 0 ? (
                  <View key={key} className="mb-2">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">{KEY_FACT_LABELS[key]}</Text>
                    <Text className="mt-0.5 text-sm text-slate-700">{keyFacts[key].join(", ")}</Text>
                  </View>
                ) : null
              )}
            </View>
          )}

          {hasActions && (
            <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
              <Text className="mb-2 text-sm font-semibold text-slate-900">Recommended Actions</Text>
              {analysis.recommendedActions!.map((action, idx) => (
                <View key={idx} className="mb-1.5 flex-row items-start gap-2">
                  <MaterialIcons name="arrow-right" size={16} color="#1d4ed8" style={{ marginTop: 2 }} />
                  <Text className="flex-1 text-sm text-slate-700">{action}</Text>
                </View>
              ))}
            </View>
          )}

          {detailed && (
            <>
              {detailed.detailedReasoning ? (
                <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                  <Text className="mb-1 text-sm font-semibold text-slate-900">Detailed Reasoning</Text>
                  <Text className="text-sm text-slate-700">{detailed.detailedReasoning}</Text>
                </View>
              ) : null}

              {detailed.proceduralRequirements.length > 0 && (
                <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                  <Text className="mb-2 text-sm font-semibold text-slate-900">Procedural Requirements (BNSS)</Text>
                  {detailed.proceduralRequirements.map((item, idx) => (
                    <View key={idx} className="mb-1.5 flex-row items-start gap-2">
                      <MaterialIcons name="checklist" size={16} color="#1d4ed8" style={{ marginTop: 2 }} />
                      <Text className="flex-1 text-sm text-slate-700">{item}</Text>
                    </View>
                  ))}
                </View>
              )}

              {detailed.evidentiaryConsiderations.length > 0 && (
                <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                  <Text className="mb-2 text-sm font-semibold text-slate-900">Evidentiary Considerations (BSA)</Text>
                  {detailed.evidentiaryConsiderations.map((item, idx) => (
                    <View key={idx} className="mb-1.5 flex-row items-start gap-2">
                      <MaterialIcons name="fact-check" size={16} color="#1d4ed8" style={{ marginTop: 2 }} />
                      <Text className="flex-1 text-sm text-slate-700">{item}</Text>
                    </View>
                  ))}
                </View>
              )}

              {hasSimilar && (
                <View className="mb-4">
                  <Text className="mb-2 text-sm font-semibold text-slate-900">Other Provisions to Consider</Text>
                  {detailed.similarProvisions.map((section, idx) => (
                    <SectionCard key={`${section.act}-${section.section}-${idx}`} section={section} />
                  ))}
                </View>
              )}

              {detailed.draftingNotes ? (
                <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                  <Text className="mb-1 text-sm font-semibold text-slate-900">Drafting Notes</Text>
                  <Text className="text-sm text-slate-700">{detailed.draftingNotes}</Text>
                </View>
              ) : null}
            </>
          )}
        </>
      )}

      <Pressable
        onPress={handleDelete}
        disabled={deleting}
        className="mt-2 flex-row items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
      >
        {deleting ? <ActivityIndicator size="small" color="#dc2626" /> : <MaterialIcons name="delete-outline" size={18} color="#dc2626" />}
        <Text className="text-sm font-semibold text-red-600">{deleting ? "Deleting…" : "Delete this analysis"}</Text>
      </Pressable>
    </ScreenContainer>
  );
}

import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Card } from "../../../components/Card";
import { Banner } from "../../../components/Banner";
import { Text } from "../../../components/Text";
import { apiRequest, ApiError } from "../../../lib/api";
import type { JanSunwaiSummary } from "../../../types/jansunwai";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  report_started: "Report started",
  closed: "Closed",
};

/**
 * Drill-down list for the "Pending IGRS" pendency dashboard
 * (app/(app)/igrs/pendency.tsx) — filters the same `/jansunwai/pending`
 * list client-side by whichever of io / category / defaulterSoon was
 * tapped, so the count shown there always matches what's listed here.
 */
export default function IgrsPendingListScreen() {
  const { io, category, categoryLabel, defaulterSoon } = useLocalSearchParams<{
    io?: string;
    category?: string;
    categoryLabel?: string;
    defaulterSoon?: string;
  }>();

  const [applications, setApplications] = useState<JanSunwaiSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { applications: data } = await apiRequest<{ applications: JanSunwaiSummary[] }>("/jansunwai/pending");
      setApplications(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load Jan Sunwai applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    if (!applications) return [];
    if (io) return applications.filter((a) => (a.assignedIoName ?? "Unassigned") === io);
    if (category) {
      if (category === "unclassified") return applications.filter((a) => a.referenceTypeCode == null);
      return applications.filter((a) => String(a.referenceTypeCode) === category);
    }
    if (defaulterSoon === "true") return applications.filter((a) => a.isDefaulterSoon);
    return applications;
  }, [applications, io, category, defaulterSoon]);

  const title = io || categoryLabel || (defaulterSoon === "true" ? "अगले 3 दिवसों में डिफाल्टर" : "Pending IGRS");
  const subtitle = io
    ? "IO-wise pendency"
    : category
      ? "Sandarbh-wise pendency"
      : defaulterSoon === "true"
        ? "Defaulter in next 3 days"
        : "";

  return (
    <ScreenContainer title={title} subtitle={subtitle}>
      <Banner message={error} variant="error" />

      {loading && !applications ? (
        <ActivityIndicator color="#1d4ed8" />
      ) : filtered.length > 0 ? (
        <>
          <Text className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            {filtered.length} pending application{filtered.length === 1 ? "" : "s"}
          </Text>
          {filtered.map((app) => (
            <Card
              key={app.id}
              title={`आवेदन संख्या: ${app.applicationNumber}`}
              description={`${app.petitionerName ?? "Unknown petitioner"}${app.subject ? ` — ${app.subject}` : ""}`}
              meta={`${STATUS_LABELS[app.status] ?? app.status}${app.assignedIoName ? ` · ${app.assignedIoName}` : ""}`}
              onPress={() => router.push({ pathname: "/(app)/jansunwai/[id]", params: { id: app.id } })}
            />
          ))}
        </>
      ) : (
        <Text className="mt-2 text-sm text-slate-500">No matching pending applications.</Text>
      )}
    </ScreenContainer>
  );
}

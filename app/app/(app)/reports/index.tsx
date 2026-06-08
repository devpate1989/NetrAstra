import { useCallback, useState } from "react";
import { ActivityIndicator } from "react-native";
import { Text } from "../../../components/Text";
import { router, useFocusEffect } from "expo-router";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Card } from "../../../components/Card";
import { Banner } from "../../../components/Banner";
import { apiRequest, ApiError } from "../../../lib/api";
import type { ReportSummary } from "../../../types/report";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pdf_generated: "PDF generated",
};

function formatDate(value?: string | null) {
  if (!value) return "No date set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ReportsListScreen() {
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { reports: data } = await apiRequest<{ reports: ReportSummary[] }>("/reports");
      setReports(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScreenContainer
      title="Inquiry Reports"
      subtitle="जाँच हेतु बिन्दुकृत कार्यवाही का विवरण — your submitted & in-progress reports"
    >
      <Card
        title="Start a new report"
        description="Fill the 23-point inquiry form and General Diary details, then generate the matching PDF."
        meta="Create"
        icon="add-circle"
        onPress={() => router.push("/(app)/reports/new")}
      />

      <Banner message={error} variant="error" />

      {loading && !reports ? (
        <ActivityIndicator color="#1d4ed8" />
      ) : reports && reports.length > 0 ? (
        reports.map((report) => (
          <Card
            key={report.id}
            title={report.referenceNumber || `${report.complainantName ?? "Untitled"} — ${formatDate(report.reportDate)}`}
            description={`${report.complainantName ?? "—"} vs ${report.oppositePartyName ?? "—"}`}
            meta={`${STATUS_LABELS[report.status] ?? report.status}${report.hasPdf ? " · PDF ready" : ""}`}
            onPress={() => router.push({ pathname: "/(app)/reports/[id]", params: { id: report.id } })}
          />
        ))
      ) : (
        <Text className="mt-2 text-sm text-slate-500">
          You haven't started any inquiry reports yet. Tap "Start a new report" to begin the 23-point form —
          it autosaves as a draft so you can return and finish it later.
        </Text>
      )}
    </ScreenContainer>
  );
}

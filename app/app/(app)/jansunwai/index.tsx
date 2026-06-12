import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Text } from "../../../components/Text";
import { router, useFocusEffect } from "expo-router";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Card } from "../../../components/Card";
import { Banner } from "../../../components/Banner";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { apiRequest, ApiError } from "../../../lib/api";
import type { JanSunwaiSummary } from "../../../types/jansunwai";
import type { ScrapeRefreshResult } from "../../../types/investigation";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  report_started: "Report started",
  closed: "Closed",
};

// The portal sync pages through all 14 संदर्भ प्रकार categories server-side,
// which can take well over the default API timeout.
const SYNC_TIMEOUT_MS = 180_000;

export default function JanSunwaiListScreen() {
  const [applications, setApplications] = useState<JanSunwaiSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  const handleRefresh = async () => {
    setRefreshing(true);
    setError("");
    setNotice("");
    try {
      const { result } = await apiRequest<{ result: ScrapeRefreshResult }>("/jansunwai/refresh", {
        method: "POST",
        timeoutMs: SYNC_TIMEOUT_MS,
      });
      if ("started" in result) {
        setNotice("Sync started in the background — check back in a minute.");
      } else if (result.skipped) {
        setNotice(result.reason || "The Jan Sunwai portal is not configured yet.");
      } else {
        setNotice(`Refreshed — stored ${result.stored} of ${result.scraped} applications.`);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not refresh from the Jan Sunwai portal.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScreenContainer title="Jan Sunwai (जनसुनवाई)" subtitle="Pending आवेदन संख्या assigned to you">
      <View className="mb-4">
        <PrimaryButton
          label={refreshing ? "Refreshing…" : "Refresh from Jan Sunwai portal"}
          onPress={handleRefresh}
          loading={refreshing}
          variant="outline"
          icon="sync"
        />
      </View>

      <Banner message={error} variant="error" />
      <Banner message={notice} variant="info" />

      {loading && !applications ? (
        <ActivityIndicator color="#1d4ed8" />
      ) : applications && applications.length > 0 ? (
        applications.map((app) => (
          <Card
            key={app.id}
            title={`आवेदन संख्या: ${app.applicationNumber}`}
            description={`${app.petitionerName ?? "Unknown petitioner"}${app.subject ? ` — ${app.subject}` : ""}`}
            meta={`${STATUS_LABELS[app.status] ?? app.status} · ${app.petitionFormat === "pdf" ? "PDF" : "Text"} petition`}
            onPress={() => router.push({ pathname: "/(app)/jansunwai/[id]", params: { id: app.id } })}
          />
        ))
      ) : (
        <Text className="mt-2 text-sm text-slate-500">
          You have no pending जनसुनवाई आवेदन right now. Once the Jan Sunwai portal is configured on
          the server, applications assigned to you will appear here — tap an आवेदन संख्या to read the
          प्रार्थना पत्र and start an inquiry report pre-filled from it.
        </Text>
      )}
    </ScreenContainer>
  );
}

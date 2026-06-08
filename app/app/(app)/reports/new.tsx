import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { apiRequest, ApiError } from "../../../lib/api";
import type { ReportDetail } from "../../../types/report";

/**
 * Creates a draft report (optionally pre-filled from a Jan Sunwai application
 * via ?jansunwaiApplicationId=, see module 9 / [[jansunwai pre-fill flow]])
 * and immediately hands off to the full 23-point form at /reports/[id].
 */
export default function NewReportScreen() {
  const { jansunwaiApplicationId } = useLocalSearchParams<{ jansunwaiApplicationId?: string }>();
  const [error, setError] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const created = await apiRequest<ReportDetail>("/reports", {
          method: "POST",
          body: jansunwaiApplicationId ? { jansunwaiApplicationId } : {},
        });
        router.replace({ pathname: "/(app)/reports/[id]", params: { id: created.id } });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not start a new report.");
      }
    })();
  }, [jansunwaiApplicationId]);

  return (
    <ScreenContainer title="New Inquiry Report" subtitle="जाँच हेतु बिन्दुकृत कार्यवाही का विवरण">
      <Banner message={error} variant="error" />
      {error ? (
        <PrimaryButton label="Back to reports" onPress={() => router.replace("/(app)/reports")} variant="outline" />
      ) : (
        <View className="items-center py-10">
          <ActivityIndicator color="#1d4ed8" size="large" />
        </View>
      )}
    </ScreenContainer>
  );
}

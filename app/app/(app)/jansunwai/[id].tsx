import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, View } from "react-native";
import { Text } from "../../../components/Text";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { apiRequest, ApiError } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import type { JanSunwaiDetail } from "../../../types/jansunwai";

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View className="mb-3">
      <Text className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</Text>
      <Text className="mt-0.5 text-sm text-slate-800">{value}</Text>
    </View>
  );
}

export default function JanSunwaiDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [application, setApplication] = useState<JanSunwaiDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [startingReport, setStartingReport] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<JanSunwaiDetail>(`/jansunwai/${id}`);
      setApplication(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this application.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleOpenPetition = async () => {
    if (!application?.petitionDownloadUrl) return;
    setOpening(true);
    try {
      await Linking.openURL(application.petitionDownloadUrl);
    } catch {
      setError("Could not open the प्रार्थना पत्र PDF.");
    } finally {
      setOpening(false);
    }
  };

  const handleCreateReport = async () => {
    if (!application) return;
    setStartingReport(true);
    setError("");
    try {
      if (application.reportId) {
        router.push({ pathname: "/(app)/reports/[id]", params: { id: application.reportId } });
        return;
      }
      router.push({ pathname: "/(app)/reports/new", params: { jansunwaiApplicationId: application.id } });
    } finally {
      setStartingReport(false);
    }
  };

  if (loading && !application) {
    return (
      <ScreenContainer title="जनसुनवाई आवेदन" subtitle="Loading…">
        <ActivityIndicator color="#1d4ed8" />
      </ScreenContainer>
    );
  }

  if (error && !application) {
    return (
      <ScreenContainer title="जनसुनवाई आवेदन">
        <Banner message={error} variant="error" />
        <PrimaryButton label="Back to list" variant="outline" onPress={() => router.replace("/(app)/jansunwai")} />
      </ScreenContainer>
    );
  }

  if (!application) return null;

  const canCreateReport = user?.role === "io" && application.assignedIoId === user.id;

  return (
    <ScreenContainer
      title={`आवेदन संख्या: ${application.applicationNumber}`}
      subtitle={application.subject || "प्रार्थना पत्र विवरण"}
    >
      <Banner message={error} variant="error" />

      <View className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <Field label="प्रार्थी का नाम (Petitioner)" value={application.petitionerName} />
        <Field label="पता (Address)" value={application.petitionerAddress} />
        <Field label="मोबाइल (Mobile)" value={application.petitionerMobile} />
        <Field label="विषय (Subject)" value={application.subject} />
        <Field label="सौंपा गया IO (Assigned IO)" value={application.assignedIoName} />
        <Field
          label="चौकी/हल्का (Beat)"
          value={
            application.assignedChowkiName
              ? `${application.assignedChowkiName}${application.assignmentSource === "ai_chowki" ? " (AI auto-assigned)" : ""}`
              : null
          }
        />
      </View>

      <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">प्रार्थना पत्र (Petition)</Text>
      <View className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        {application.petitionFormat === "pdf" ? (
          application.petitionDownloadUrl ? (
            <PrimaryButton
              label={opening ? "Opening…" : "View / download PDF"}
              onPress={handleOpenPetition}
              loading={opening}
              variant="outline"
              icon="picture-as-pdf"
            />
          ) : (
            <Text className="text-sm text-slate-500">The PDF could not be retrieved from the portal yet.</Text>
          )
        ) : application.petitionText ? (
          <Text className="text-sm leading-6 text-slate-800">{application.petitionText}</Text>
        ) : (
          <Text className="text-sm text-slate-500">No petition text is available for this application.</Text>
        )}
      </View>

      {canCreateReport ? (
        <PrimaryButton
          label={
            startingReport
              ? "Opening…"
              : application.reportId
              ? "Open linked report"
              : "Create Report (pre-filled from this application)"
          }
          onPress={handleCreateReport}
          loading={startingReport}
          icon={application.reportId ? "open-in-new" : "edit-note"}
        />
      ) : null}
    </ScreenContainer>
  );
}

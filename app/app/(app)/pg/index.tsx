import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { Text } from "../../../components/Text";
import { useFocusEffect } from "expo-router";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { apiRequest, ApiError } from "../../../lib/api";
import type { PgComplaint } from "../../../types/pg";

function formatDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string | null }) {
  const s = (status || "").toLowerCase();
  const bg = s.includes("pending") || s.includes("लम्बित") ? "#dc2626"
    : s.includes("disposed") || s.includes("निस्तारित") ? "#16a34a"
    : "#f97316";
  return (
    <View style={{ backgroundColor: bg }} className="rounded-full px-2 py-0.5 self-start">
      <Text className="text-[10px] font-semibold text-white">{status || "Unknown"}</Text>
    </View>
  );
}

function PdfButton({ complaintId }: { complaintId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const handlePdf = async () => {
    setState("loading");
    try {
      const data = await apiRequest<{ url: string | null; message?: string }>(`/pg/${complaintId}/pdf`);
      if (data.url) {
        await Linking.openURL(data.url);
        setState("idle");
      } else {
        setState("error");
        setTimeout(() => setState("idle"), 3000);
      }
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  };

  return (
    <Pressable
      onPress={handlePdf}
      disabled={state === "loading"}
      className="flex-row items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 active:opacity-70"
    >
      <MaterialIcons
        name={state === "loading" ? "hourglass-empty" : state === "error" ? "error-outline" : "picture-as-pdf"}
        size={14}
        color={state === "error" ? "#dc2626" : "#7c3aed"}
      />
      <Text className={`text-xs font-semibold ${state === "error" ? "text-red-600" : "text-violet-700"}`}>
        {state === "loading" ? "Loading…" : state === "error" ? "Not available" : "View PDF"}
      </Text>
    </Pressable>
  );
}

function ComplaintCard({ item }: { item: PgComplaint }) {
  return (
    <View className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Header ribbon */}
      <View className="flex-row items-center justify-between bg-violet-600 px-4 py-2">
        <Text className="text-xs font-bold text-white">{item.complaintNo}</Text>
        <StatusBadge status={item.status} />
      </View>
      <View className="p-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-semibold text-slate-900">{item.applicantName || "Unknown Applicant"}</Text>
            {item.mobile ? (
              <View className="mt-1 flex-row items-center gap-1">
                <MaterialIcons name="phone" size={12} color="#64748b" />
                <Text className="text-xs text-slate-500">{item.mobile}</Text>
              </View>
            ) : null}
          </View>
          <Text className="text-xs text-slate-400">{formatDate(item.dateOfComplaint || item.scrapedAt)}</Text>
        </View>

        {item.complaintCategory ? (
          <View className="mt-2 rounded-lg bg-violet-50 px-3 py-1.5">
            <Text className="text-xs font-medium text-violet-700">{item.complaintCategory}</Text>
          </View>
        ) : null}

        {item.complaintDetails ? (
          <Text className="mt-2 text-xs text-slate-500" numberOfLines={2}>{item.complaintDetails}</Text>
        ) : null}

        {item.assignedIo ? (
          <View className="mt-2 flex-row items-center gap-1">
            <MaterialIcons name="assignment-ind" size={12} color="#64748b" />
            <Text className="text-xs text-slate-500">{item.assignedIo}</Text>
          </View>
        ) : null}

        {/* PDF download button */}
        <View className="mt-3">
          <PdfButton complaintId={item.id} />
        </View>
      </View>
    </View>
  );
}

export default function PgPendingScreen() {
  const [complaints, setComplaints] = useState<PgComplaint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<{ complaints: PgComplaint[] }>("/pg/pending");
      setComplaints(
        data.complaints.map((c: any) => ({
          id: c.id,
          complaintNo: c.complaint_no,
          applicantName: c.applicant_name,
          mobile: c.mobile,
          complaintCategory: c.complaint_category,
          complaintDetails: c.complaint_details,
          status: c.status,
          assignedIo: c.assigned_io,
          dateOfComplaint: c.date_of_complaint,
          scrapedAt: c.scraped_at,
        }))
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load public grievances.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(""); setNotice("");
    try {
      const { result } = await apiRequest<{ result: any }>("/pg/refresh", { method: "POST" });
      if ("started" in result) setNotice("Sync started in background — check back in a minute.");
      else setNotice(`Synced — ${result.complaints?.stored ?? 0} grievances updated.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not refresh from portal.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScreenContainer scrollable={false} title="Public Grievances" subtitle="पब्लिक ग्रीवांस — पेंडिंग शिकायतें">
      <View className="mb-4">
        <PrimaryButton
          label={refreshing ? "Refreshing…" : "Refresh from portal"}
          onPress={handleRefresh}
          loading={refreshing}
          variant="outline"
          icon="sync"
        />
      </View>

      <Banner message={error} variant="error" />
      <Banner message={notice} variant="info" />

      {loading && !complaints ? (
        <ActivityIndicator color="#7c3aed" />
      ) : complaints && complaints.length > 0 ? (
        <FlatList
          data={complaints}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <ComplaintCard item={item} />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              {complaints.length} complaint{complaints.length !== 1 ? "s" : ""}
            </Text>
          }
        />
      ) : (
        <Text className="mt-2 text-sm text-slate-500">
          No public grievances found. Tap "Refresh from portal" to sync.
        </Text>
      )}
    </ScreenContainer>
  );
}

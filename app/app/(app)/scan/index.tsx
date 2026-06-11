import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { Text } from "../../../components/Text";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Card } from "../../../components/Card";
import { Banner } from "../../../components/Banner";
import { OfflineBanner } from "../../../components/OfflineBanner";
import { apiRequest, ApiError } from "../../../lib/api";
import { captureDocument, pickScanImage, pickScanPdf, uploadScan } from "../../../lib/documentScan";
import { cacheScans, getCachedScans } from "../../../lib/offlineCache";
import { enqueueScan, listOutbox, removeFromOutbox, type OutboxItem } from "../../../lib/scanOutbox";
import { useOffline } from "../../../context/OfflineContext";
import type { ScannedDocument } from "../../../types/document";

type ScanKind = "camera" | "image" | "pdf";

const STATUS_ICON: Record<string, React.ComponentProps<typeof MaterialIcons>["name"]> = {
  pending: "hourglass-empty",
  processing: "hourglass-top",
  completed: "check-circle",
  failed: "error",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "#94a3b8",
  processing: "#f59e0b",
  completed: "#059669",
  failed: "#dc2626",
};

const SOURCE_ICON: Record<string, React.ComponentProps<typeof MaterialIcons>["name"]> = {
  camera: "photo-camera",
  image: "image",
  pdf: "picture-as-pdf",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ScanHubScreen() {
  const { refreshOutboxCount } = useOffline();
  const [recent, setRecent] = useState<ScannedDocument[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scanning, setScanning] = useState<ScanKind | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiRequest<{ documents: ScannedDocument[] }>("/documents?page=1&limit=5");
      setRecent(data.documents);
      cacheScans(data.documents).catch(() => {});
    } catch (err) {
      if (!(err instanceof ApiError)) {
        // Likely offline — fall back to the local cache.
        const cached = await getCachedScans();
        setRecent(cached.slice(0, 5));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadOutbox = useCallback(async () => {
    setOutbox(await listOutbox());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadOutbox();
    }, [load, loadOutbox])
  );

  async function handleScan(kind: ScanKind) {
    setError("");
    setInfo("");
    setScanning(kind);
    try {
      const picked =
        kind === "camera" ? await captureDocument() : kind === "image" ? await pickScanImage() : await pickScanPdf();

      if (!picked) {
        setScanning(null);
        return;
      }

      try {
        const document = await uploadScan(picked);
        setScanning(null);
        load();
        router.push({ pathname: "/(app)/scan/[id]", params: { id: document.id } });
      } catch (err) {
        if (err instanceof ApiError) throw err;
        // Likely offline — queue the scan for upload once connectivity returns.
        await enqueueScan(picked);
        await loadOutbox();
        await refreshOutboxCount();
        setScanning(null);
        setInfo("You're offline — this scan has been saved and will upload automatically once you're back online.");
      }
    } catch (err) {
      setScanning(null);
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not process the document.");
    }
  }

  async function handleRemoveOutboxItem(id: string) {
    await removeFromOutbox(id);
    await loadOutbox();
    await refreshOutboxCount();
  }

  return (
    <ScreenContainer title="Scan Documents" subtitle="Scan or upload a document to extract its text with OCR">
      <OfflineBanner />
      <Banner message={error} variant="error" />
      <Banner message={info} variant="info" />

      {scanning && (
        <View className="mb-4 flex-row items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <ActivityIndicator size="small" color="#1d4ed8" />
          <Text className="text-sm font-medium text-brand-700">Reading document and extracting text…</Text>
        </View>
      )}

      <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Scan Options</Text>
      <Card
        title="Scan with Camera"
        description="Capture a document with your camera, crop, and extract its text."
        meta="Scan"
        icon="photo-camera"
        onPress={() => handleScan("camera")}
      />
      <Card
        title="Upload Image"
        description="Choose a photo of a document from your gallery."
        meta="Upload"
        icon="image"
        onPress={() => handleScan("image")}
      />
      <Card
        title="Upload PDF"
        description="Choose a PDF file to extract its text."
        meta="Upload"
        icon="picture-as-pdf"
        onPress={() => handleScan("pdf")}
      />

      {outbox.length > 0 && (
        <View className="mt-2">
          <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Pending Uploads</Text>
          {outbox.map((item) => (
            <View key={item.id} className="mb-3 w-full rounded-xl border border-slate-200 bg-white p-4">
              <View className="flex-row items-center">
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                  <MaterialIcons name={SOURCE_ICON[item.source] ?? "description"} size={20} color="#64748b" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>
                    {item.fileName}
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-400">
                    {item.status === "failed" ? "Upload failed — will retry when online" : "Queued — will upload when online"}
                  </Text>
                  {item.errorMessage ? (
                    <Text className="mt-0.5 text-xs text-red-500" numberOfLines={1}>
                      {item.errorMessage}
                    </Text>
                  ) : null}
                </View>
                <Pressable onPress={() => handleRemoveOutboxItem(item.id)} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color="#94a3b8" />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent Scans</Text>
        {recent.length > 0 && (
          <Pressable onPress={() => router.push("/(app)/scan/history")}>
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
          <Banner message="No scans yet. Use one of the options above to get started." variant="info" />
        ) : (
          recent.map((doc) => (
            <Pressable
              key={doc.id}
              onPress={() => router.push({ pathname: "/(app)/scan/[id]", params: { id: doc.id } })}
              className="mb-3 w-full rounded-xl border border-slate-200 bg-white p-4 active:bg-slate-50"
            >
              <View className="flex-row items-center">
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                  <MaterialIcons name={SOURCE_ICON[doc.source] ?? "description"} size={20} color="#1d4ed8" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>
                    {doc.fileName}
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-400">{formatDate(doc.createdAt)}</Text>
                </View>
                <MaterialIcons name={STATUS_ICON[doc.ocrStatus] ?? "help"} size={18} color={STATUS_COLOR[doc.ocrStatus] ?? "#94a3b8"} />
              </View>
            </Pressable>
          ))
        )}
      </View>
    </ScreenContainer>
  );
}

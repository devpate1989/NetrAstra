import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { apiRequest } from "./api";
import type { AttachmentKind, ReportAttachment } from "../types/report";

interface PickedFile {
  base64: string;
  fileName: string;
  mimeType: string;
}

async function pickImage(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library permission is required to choose a photo.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
    base64: true,
  });

  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset?.base64) return null;

  const ext = (asset.fileName?.split(".").pop() || asset.uri.split(".").pop() || "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return {
    base64: asset.base64,
    fileName: asset.fileName ?? `photo.${ext || "jpg"}`,
    mimeType: asset.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext || "jpeg"}`,
  };
}

async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/*"],
    base64: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  // expo-document-picker only returns `base64` directly on web; on iOS/Android
  // we read the cached file's bytes ourselves via expo-file-system.
  const base64 =
    Platform.OS === "web"
      ? (asset as unknown as { base64?: string }).base64
      : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });

  if (!base64) {
    throw new Error("Could not read the selected file. Please try a different one.");
  }

  return {
    base64,
    fileName: asset.name,
    mimeType: asset.mimeType ?? "application/octet-stream",
  };
}

export interface UploadReportFileResult {
  path: string;
  kind: AttachmentKind;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  previewUrl: string | null;
}

interface UploadOptions {
  caption?: string;
  latitude?: number;
  longitude?: number;
  /** "image" opens the photo library; "document" opens the file/document picker (PDF or image). */
  source?: "image" | "document";
}

/**
 * Lets the officer pick a photo or document, base64-encodes it (works
 * uniformly across web/iOS/Android), and POSTs it to the Express API which
 * stores it in the private `report-attachments` bucket and records it on the
 * report. Returns null if the user cancels the picker.
 */
export async function pickAndUploadReportFile(
  reportId: string,
  kind: AttachmentKind,
  options: UploadOptions = {}
): Promise<UploadReportFileResult | null> {
  const picked = options.source === "document" ? await pickDocument() : await pickImage();
  if (!picked) return null;

  return apiRequest<UploadReportFileResult>(`/reports/${reportId}/files`, {
    method: "POST",
    body: {
      kind,
      fileName: picked.fileName,
      mimeType: picked.mimeType,
      base64: picked.base64,
      caption: options.caption,
      latitude: options.latitude,
      longitude: options.longitude,
    },
  });
}

export type { ReportAttachment };

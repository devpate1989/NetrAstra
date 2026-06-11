import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";
import { apiRequest } from "./api";
import type { DocumentSource, ScannedDocument } from "../types/document";

// Documents are downscaled to this max edge before upload — large enough for
// OCR to read small print, small enough to stay well under the API body limit.
const MAX_DIMENSION = 2000;

// Mirrors the server's MAX_UPLOAD_BYTES (documents.controller.ts) — checked
// up front so we don't read a huge file into memory as base64 just to have
// the upload rejected.
const MAX_PDF_BYTES = 12 * 1024 * 1024;

export interface PickedScan {
  source: DocumentSource;
  fileName: string;
  mimeType: string;
  base64: string;
}

// Re-encodes to JPEG (also converts HEIC) and downscales oversized photos.
async function compressImage(asset: { uri: string; width?: number; height?: number }): Promise<string> {
  const actions = asset.width && asset.width > MAX_DIMENSION ? [{ resize: { width: MAX_DIMENSION } }] : [];

  const manipulated = await manipulateAsync(asset.uri, actions, {
    compress: 0.7,
    format: SaveFormat.JPEG,
    base64: true,
  });

  if (!manipulated.base64) {
    throw new Error("Could not process the image.");
  }
  return manipulated.base64;
}

/** Opens the camera so the user can capture a document, with built-in crop/retake. */
export async function captureDocument(): Promise<PickedScan | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Camera permission is required to scan a document.");
  }

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.9,
    allowsEditing: true,
    exif: false,
  });

  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;

  const base64 = await compressImage(asset);
  return { source: "camera", fileName: `scan-${Date.now()}.jpg`, mimeType: "image/jpeg", base64 };
}

/** Lets the user pick an existing photo of a document from their gallery. */
export async function pickScanImage(): Promise<PickedScan | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library permission is required to choose an image.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
    allowsEditing: true,
  });

  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;

  const base64 = await compressImage(asset);
  return { source: "image", fileName: `scan-${Date.now()}.jpg`, mimeType: "image/jpeg", base64 };
}

/** Lets the user pick a PDF document to OCR. */
export async function pickScanPdf(): Promise<PickedScan | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    base64: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  let size = asset.size;
  if (size == null && Platform.OS !== "web") {
    const info = await FileSystem.getInfoAsync(asset.uri);
    size = info.exists ? info.size : undefined;
  }
  if (size != null && size > MAX_PDF_BYTES) {
    throw new Error("This PDF is too large (max 12 MB). Please choose a smaller file.");
  }

  const base64 =
    Platform.OS === "web"
      ? (asset as unknown as { base64?: string }).base64
      : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });

  if (!base64) {
    throw new Error("Could not read the selected PDF. Please try a different file.");
  }

  return { source: "pdf", fileName: asset.name, mimeType: "application/pdf", base64 };
}

/** Uploads a picked scan for OCR and returns the stored document with results. */
export async function uploadScan(file: PickedScan): Promise<ScannedDocument> {
  // OCR runs synchronously server-side and can take longer than the default
  // timeout for large/multi-page documents.
  const { document } = await apiRequest<{ document: ScannedDocument }>("/documents/scan", {
    method: "POST",
    body: file,
    timeoutMs: 60_000,
  });
  return document;
}

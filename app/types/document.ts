export type DocumentSource = "camera" | "image" | "pdf";
export type OcrStatus = "pending" | "processing" | "completed" | "failed";
export type LanguageDetected = "hindi" | "english" | "mixed" | "unknown";

export interface OcrEntities {
  names: string[];
  dates: string[];
  addresses: string[];
  phoneNumbers: string[];
  firNumbers: string[];
  actsAndSections: string[];
}

/** Mirrors `toDocumentDto` in server/src/controllers/documents.controller.ts */
export interface ScannedDocument {
  id: string;
  source: DocumentSource;
  fileName: string;
  mimeType: string;
  fileSize: number;
  ocrStatus: OcrStatus;
  extractedText: string | null;
  confidence: number | null;
  languageDetected: LanguageDetected | null;
  entities: OcrEntities | null;
  keywords: string[] | null;
  errorMessage: string | null;
  previewUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

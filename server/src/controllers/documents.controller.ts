import { randomUUID } from "crypto";
import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { runOcr } from "../services/ocr.service";
import { logAudit } from "../services/audit.service";

const BUCKET = "scanned-documents";
const SIGNED_URL_TTL_SECONDS = 60 * 10;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

async function signPath(pathValue: string | null | undefined): Promise<string | null> {
  if (!pathValue) return null;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(pathValue, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function toDocumentDto(row: Record<string, any>, previewUrl: string | null) {
  return {
    id: row.id,
    source: row.source,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    ocrStatus: row.ocr_status,
    extractedText: row.extracted_text,
    confidence: row.confidence,
    languageDetected: row.language_detected,
    entities: row.entities,
    keywords: row.keywords,
    errorMessage: row.error_message,
    previewUrl,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const scanSchema = z.object({
  source: z.enum(["camera", "image", "pdf"]),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  base64: z.string().min(1),
});

// The client sends raw bytes as base64 JSON (mirrors app/lib/reportFiles.ts) for a
// single cross-platform upload path on web/iOS/Android. OCR runs synchronously via
// Claude vision/document support so the client gets results in the same response.
export const scanDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const input = scanSchema.parse(req.body ?? {});
  const buffer = Buffer.from(input.base64, "base64");

  if (buffer.length === 0) {
    throw new HttpError(400, "Uploaded file is empty");
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, "Uploaded file exceeds the 12 MB limit");
  }

  const ext = (input.fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const objectPath = `${user.id}/${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(objectPath, buffer, { contentType: input.mimeType, upsert: false });

  if (uploadError) {
    throw new HttpError(400, uploadError.message);
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("scanned_documents")
    .insert({
      user_id: user.id,
      source: input.source,
      file_path: objectPath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      file_size: buffer.length,
      ocr_status: "processing",
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    await supabaseAdmin.storage.from(BUCKET).remove([objectPath]);
    throw new HttpError(400, insertError?.message ?? "Could not save scanned document");
  }

  let updateFields: Record<string, unknown>;
  try {
    const result = await runOcr(buffer, input.mimeType);
    updateFields = {
      ocr_status: "completed",
      extracted_text: result.extractedText,
      confidence: result.confidence,
      language_detected: result.languageDetected,
      entities: result.entities,
      keywords: result.keywords,
    };
  } catch (err) {
    updateFields = {
      ocr_status: "failed",
      error_message: err instanceof Error ? err.message : "OCR failed",
    };
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("scanned_documents")
    .update(updateFields)
    .eq("id", inserted.id)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new HttpError(400, updateError?.message ?? "Could not save OCR result");
  }

  // Audit log deliberately excludes the extracted text itself (PII safety).
  await logAudit({
    actor: user,
    action: "document.scan",
    targetTable: "scanned_documents",
    targetId: updated.id,
    details: { source: input.source, fileName: input.fileName, ocrStatus: updated.ocr_status },
  });

  const previewUrl = await signPath(updated.file_path);
  res.status(201).json({ document: toDocumentDto(updated, previewUrl) });
});

export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from("scanned_documents")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new HttpError(400, error.message);

  const rows = data ?? [];
  const signedByPath = new Map<string, string>();
  if (rows.length > 0) {
    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrls(rows.map((r) => r.file_path), SIGNED_URL_TTL_SECONDS);
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl);
    }
  }

  res.json({
    documents: rows.map((row) => toDocumentDto(row, signedByPath.get(row.file_path) ?? null)),
    total: count ?? 0,
    page,
    limit,
  });
});

export const getDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const { data, error } = await supabaseAdmin
    .from("scanned_documents")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) throw new HttpError(404, "Scanned document not found");

  const previewUrl = await signPath(data.file_path);
  res.json({ document: toDocumentDto(data, previewUrl) });
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const { data, error } = await supabaseAdmin
    .from("scanned_documents")
    .select("id, file_path")
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) throw new HttpError(404, "Scanned document not found");

  await supabaseAdmin.storage.from(BUCKET).remove([data.file_path]);

  const { error: deleteError } = await supabaseAdmin.from("scanned_documents").delete().eq("id", data.id);
  if (deleteError) throw new HttpError(400, deleteError.message);

  res.json({ ok: true });
});

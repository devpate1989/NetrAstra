import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { analyzeLegalText, MAX_INPUT_CHARS } from "../services/legal.service";
import { logAudit } from "../services/audit.service";

function toAnalysisDto(row: Record<string, any>) {
  return {
    id: row.id,
    sourceDocumentId: row.source_document_id,
    mode: row.mode,
    status: row.status,
    inputText: row.input_text,
    caseType: row.case_type,
    summary: row.summary,
    applicableSections: row.applicable_sections,
    keyFacts: row.key_facts,
    recommendedActions: row.recommended_actions,
    detailedAnalysis: row.detailed_analysis,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMappingDto(row: Record<string, any>) {
  return {
    id: row.id,
    category: row.category,
    oldAct: row.old_act,
    oldSection: row.old_section,
    newAct: row.new_act,
    newSection: row.new_section,
    title: row.title,
  };
}

const analyzeSchema = z
  .object({
    text: z.string().trim().min(1).optional(),
    documentId: z.string().uuid().optional(),
    mode: z.enum(["quick", "deep"]),
  })
  .refine((data) => Boolean(data.text || data.documentId), {
    message: "Provide either 'text' or 'documentId'",
  });

// Analyzes either pasted text or a previously OCR'd scanned document. Runs
// synchronously (mirrors documents.controller.ts's scan flow) so the client
// gets the result in the same response.
export const analyzeText = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const input = analyzeSchema.parse(req.body ?? {});

  let sourceText: string;
  let sourceDocumentId: string | null = null;

  if (input.documentId) {
    const { data, error } = await supabaseAdmin
      .from("scanned_documents")
      .select("id, ocr_status, extracted_text")
      .eq("id", input.documentId)
      .eq("user_id", user.id)
      .single();

    if (error || !data) throw new HttpError(404, "Scanned document not found");
    if (data.ocr_status !== "completed" || !data.extracted_text) {
      throw new HttpError(400, "This document does not have completed OCR text to analyze");
    }
    sourceText = data.extracted_text;
    sourceDocumentId = data.id;
  } else {
    sourceText = input.text!;
  }

  const truncated = sourceText.slice(0, MAX_INPUT_CHARS);

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("legal_analyses")
    .insert({
      user_id: user.id,
      source_document_id: sourceDocumentId,
      mode: input.mode,
      status: "processing",
      input_text: truncated,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw new HttpError(400, insertError?.message ?? "Could not start legal analysis");
  }

  let updateFields: Record<string, unknown>;
  try {
    const result = await analyzeLegalText(truncated, input.mode);
    updateFields = {
      status: "completed",
      case_type: result.caseType,
      summary: result.summary,
      applicable_sections: result.applicableSections,
      key_facts: result.keyFacts,
      recommended_actions: result.recommendedActions,
      detailed_analysis: result.detailedAnalysis,
    };
  } catch (err) {
    updateFields = {
      status: "failed",
      error_message: err instanceof Error ? err.message : "Legal analysis failed",
    };
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("legal_analyses")
    .update(updateFields)
    .eq("id", inserted.id)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new HttpError(400, updateError?.message ?? "Could not save legal analysis");
  }

  // Audit log deliberately excludes the analyzed text itself (PII safety).
  await logAudit({
    actor: user,
    action: "legal.analyze",
    targetTable: "legal_analyses",
    targetId: updated.id,
    details: { mode: input.mode, sourceDocumentId, status: updated.status, caseType: updated.case_type },
  });

  res.status(201).json({ analysis: toAnalysisDto(updated) });
});

export const listAnalyses = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from("legal_analyses")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new HttpError(400, error.message);

  res.json({
    analyses: (data ?? []).map(toAnalysisDto),
    total: count ?? 0,
    page,
    limit,
  });
});

export const getAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const { data, error } = await supabaseAdmin
    .from("legal_analyses")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) throw new HttpError(404, "Legal analysis not found");
  res.json({ analysis: toAnalysisDto(data) });
});

export const deleteAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const { data, error } = await supabaseAdmin
    .from("legal_analyses")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error || !data) throw new HttpError(404, "Legal analysis not found");
  res.json({ ok: true });
});

const ACT_VALUES = new Set(["IPC", "BNS", "CrPC", "BNSS", "Evidence Act", "BSA"]);

// Read-only search over the curated bns_section_mappings reference table.
export const searchBnsMappings = asyncHandler(async (req: Request, res: Response) => {
  const rawQuery = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const act = typeof req.query.act === "string" ? req.query.act.trim() : "";

  let query = supabaseAdmin.from("bns_section_mappings").select("*").order("sort_order", { ascending: true });

  if (ACT_VALUES.has(act)) {
    query = query.or(`old_act.eq.${act},new_act.eq.${act}`);
  }

  if (rawQuery) {
    // PostgREST's .or() treats "," and "()" as syntax — strip them from free-text input.
    const safe = rawQuery.replace(/[,()]/g, "");
    if (safe) {
      query = query.or(
        `old_section.ilike.%${safe}%,new_section.ilike.%${safe}%,title.ilike.%${safe}%,category.ilike.%${safe}%`
      );
    }
  }

  // The curated reference table is small (~100-150 rows) — return it in full
  // so the client can browse-by-category as well as search.
  const { data, error } = await query.limit(200);
  if (error) throw new HttpError(400, error.message);

  res.json({ mappings: (data ?? []).map(toMappingDto) });
});

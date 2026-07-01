import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { runCctnsInvestigationsScrape, runCctnsFirPdfScrape } from "../services/scraping/cctnsPortal.service";
import { matchIoName } from "../services/ai.service";
import { raceOrBackground } from "../utils/backgroundRefresh";

function paramId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

function toInvestigationDto(row: Record<string, any>) {
  return {
    id: row.id,
    externalReference: row.external_reference,
    policeStation: row.police_station,
    district: row.district,
    ioName: row.io_name,
    section: row.section,
    complainantName: row.complainant_name,
    caseSummary: row.case_summary,
    caseStatus: row.case_status,
    registeredOn: row.registered_on,
    scrapedAt: row.scraped_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  "id, source, external_reference, police_station, district, io_name, section, " +
  "complainant_name, case_summary, case_status, registered_on, scraped_at, updated_at";

/**
 * IO-categorized pending-investigations view (prompt.md module 8) — read-only
 * for SHO, editable (IO name & धारा/Section) for Admin. Reads from `investigations`,
 * which the scraper keeps in sync with the external CCTNS portal.
 */
export const listInvestigations = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;

  let query = supabaseAdmin
    .from("investigations")
    .select(SELECT_COLUMNS)
    .order("io_name", { ascending: true, nullsFirst: false })
    .order("registered_on", { ascending: false, nullsFirst: false });

  if (user.role === "io") {
    const { data: nameRows } = await supabaseAdmin
      .from("investigations")
      .select("io_name")
      .not("io_name", "is", null);

    const distinctNames = [...new Set((nameRows ?? []).map((r: any) => r.io_name as string).filter(Boolean))];
    const matched = await matchIoName(user.fullName ?? "", distinctNames);

    if (!matched) {
      return res.json({ investigations: [], groupedByIo: [] });
    }

    query = query.eq("io_name", matched);
  }

  const { data, error } = await query;

  if (error) {
    throw new HttpError(400, error.message);
  }

  const rows = (data ?? []).map(toInvestigationDto);

  const groupOrder: string[] = [];
  const groups = new Map<string, ReturnType<typeof toInvestigationDto>[]>();
  for (const row of rows) {
    const key = row.ioName?.trim() || "Unassigned";
    if (!groups.has(key)) {
      groups.set(key, []);
      groupOrder.push(key);
    }
    groups.get(key)!.push(row);
  }

  res.json({
    investigations: rows,
    groupedByIo: groupOrder.map((ioName) => ({ ioName, cases: groups.get(ioName)! })),
  });
});

const updateInvestigationSchema = z
  .object({
    ioName: z.string().trim().min(1).max(200).optional(),
    section: z.string().trim().min(1).max(200).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, { message: "Provide at least one field to update" });

/** Admin-only correction of the scraped IO name / धारा (Section) for a case. */
export const updateInvestigation = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const input = updateInvestigationSchema.parse(req.body);

  const updates: Record<string, unknown> = {};
  if (input.ioName !== undefined) updates.io_name = input.ioName;
  if (input.section !== undefined) updates.section = input.section;

  const { data, error } = await supabaseAdmin
    .from("investigations")
    .update(updates)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new HttpError(404, "Investigation not found");
  }

  res.json({ investigation: toInvestigationDto(data as unknown as Record<string, any>) });
});

/** On-demand re-scrape of the CCTNS portal (in addition to the scheduled cron run). */
export const refreshInvestigations = asyncHandler(async (_req: Request, res: Response) => {
  const result = await raceOrBackground(runCctnsInvestigationsScrape(), "cctns", (r) => {
    if (r.skipped) console.log(`[cctns] on-demand refresh skipped: ${r.reason}`);
    else console.log(`[cctns] on-demand refresh stored ${r.stored}/${r.scraped}`);
  });
  res.json({ result });
});

/** POST /investigations/pdf-sync — download FIR PDFs from CCTNS FIRViewDetail.aspx */
export const syncFirPdfs = asyncHandler(async (_req: Request, res: Response) => {
  const result = await raceOrBackground(runCctnsFirPdfScrape(), "cctns-pdf", (r) => {
    console.log(`[cctns-pdf] sync: stored=${r.stored}/${r.scraped}`);
  });
  res.json({ result });
});

/**
 * GET /investigations/io-summary — IO-wise pending count with name normalization.
 * Strips trailing " -" / whitespace from scraped IO names so the same officer
 * doesn't appear as two rows (e.g. "AAKIL HUSAIN -" and "AAKIL HUSAIN").
 */
export const getIoSummary = asyncHandler(async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("investigations")
    .select("io_name");

  if (error) throw new HttpError(400, error.message);

  // Count per normalized IO name
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const raw = (row.io_name as string | null)?.trim() ?? "Unassigned";
    const clean = raw.replace(/\s*-\s*$/, "").trim() || "Unassigned";
    counts.set(clean, (counts.get(clean) ?? 0) + 1);
  }

  const result = [...counts.entries()]
    .map(([ioName, pendingCount]) => ({ ioName, pendingCount }))
    .sort((a, b) => b.pendingCount - a.pendingCount);

  res.json({ summary: result, total: (data ?? []).length });
});

const FIR_PDF_SIGNED_URL_TTL = 60 * 60; // 1 hour

/** GET /investigations/fir-pdf/:externalRef — returns signed URL for a downloaded FIR PDF */
export const getFirPdfUrl = asyncHandler(async (req: Request, res: Response) => {
  const ref = req.params.externalRef;
  const { data: firFile } = await supabaseAdmin
    .from("cctns_fir_files")
    .select("file_path")
    .eq("external_reference", ref)
    .single();

  if (!firFile?.file_path) {
    res.json({ url: null, message: "FIR PDF not yet downloaded." });
    return;
  }

  const { data, error } = await supabaseAdmin.storage
    .from("cctns-firs")
    .createSignedUrl(firFile.file_path, FIR_PDF_SIGNED_URL_TTL);

  if (error || !data?.signedUrl) {
    res.json({ url: null, message: "Could not generate FIR PDF link." });
    return;
  }
  res.json({ url: data.signedUrl, externalReference: ref });
});

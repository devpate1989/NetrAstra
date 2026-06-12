import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { runCctnsInvestigationsScrape } from "../services/scraping/cctnsPortal.service";
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

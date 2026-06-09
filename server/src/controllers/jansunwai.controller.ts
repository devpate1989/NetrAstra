import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { JANSUNWAI_PETITIONS_BUCKET, runJanSunwaiScrape } from "../services/scraping/janSunwaiPortal.service";

const SIGNED_URL_TTL_SECONDS = 60 * 10;

const SELECT_COLUMNS =
  "id, application_number, source, assigned_io_id, assigned_io_name, petitioner_name, " +
  "petitioner_address, petitioner_mobile, subject, description, petition_format, petition_url, " +
  "petition_text, status, report_id, scraped_at, created_at, updated_at";

function paramId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

function toSummaryDto(row: Record<string, any>) {
  return {
    id: row.id,
    applicationNumber: row.application_number,
    assignedIoName: row.assigned_io_name,
    petitionerName: row.petitioner_name,
    subject: row.subject,
    status: row.status,
    petitionFormat: row.petition_format,
    reportId: row.report_id,
    scrapedAt: row.scraped_at,
  };
}

function toAllotmentDto(row: Record<string, any>) {
  return {
    id: row.id,
    applicationNumber: row.application_number,
    assignedIoId: row.assigned_io_id,
    assignedIoName: row.assigned_io_name,
    petitionerName: row.petitioner_name,
    petitionerMobile: row.petitioner_mobile,
    subject: row.subject,
    description: row.description,
    status: row.status,
    scrapedAt: row.scraped_at,
  };
}

async function toDetailDto(row: Record<string, any>) {
  let petitionDownloadUrl: string | null = null;
  if (row.petition_format === "pdf" && row.petition_url) {
    const { data, error } = await supabaseAdmin.storage
      .from(JANSUNWAI_PETITIONS_BUCKET)
      .createSignedUrl(row.petition_url, SIGNED_URL_TTL_SECONDS);
    petitionDownloadUrl = error ? null : data?.signedUrl ?? null;
  }

  return {
    id: row.id,
    applicationNumber: row.application_number,
    assignedIoId: row.assigned_io_id,
    assignedIoName: row.assigned_io_name,
    petitionerName: row.petitioner_name,
    petitionerAddress: row.petitioner_address,
    petitionerMobile: row.petitioner_mobile,
    subject: row.subject,
    description: row.description,
    petitionFormat: row.petition_format,
    petitionText: row.petition_text,
    petitionDownloadUrl,
    status: row.status,
    reportId: row.report_id,
    scrapedAt: row.scraped_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Pending आवेदन संख्या list (prompt.md module 9). IOs see only their own
 * assigned applications; SHO/Admin get the full oversight view (mirrors the
 * `jansunwai_applications` RLS policy).
 */
export const listPendingApplications = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;

  let query = supabaseAdmin
    .from("jansunwai_applications")
    .select(SELECT_COLUMNS)
    .in("status", ["pending", "report_started"])
    .order("scraped_at", { ascending: false });

  if (user.role === "io") {
    query = query.eq("assigned_io_id", user.id);
  }

  const { data, error } = await query;
  if (error) {
    throw new HttpError(400, error.message);
  }

  res.json({ applications: (data ?? []).map(toSummaryDto) });
});

/**
 * Single प्रार्थना पत्र (petition) detail — renders as a signed PDF download
 * link or plain text, plus enough fields for the "Create Report" pre-fill flow.
 */
export const getApplication = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const id = paramId(req);

  const { data, error } = await supabaseAdmin.from("jansunwai_applications").select(SELECT_COLUMNS).eq("id", id).single();
  if (error || !data) {
    throw new HttpError(404, "Application not found");
  }

  const row = data as unknown as Record<string, any>;
  const canRead = row.assigned_io_id === user.id || user.role === "sho" || user.role === "admin";
  if (!canRead) {
    throw new HttpError(403, "This application is not assigned to you");
  }

  res.json(await toDetailDto(row));
});

/** On-demand re-scrape of the Jan Sunwai portal (in addition to the scheduled cron run). */
export const refreshApplications = asyncHandler(async (_req: Request, res: Response) => {
  const result = await runJanSunwaiScrape();
  res.json({ result });
});

/**
 * All applications visible to SHO/Admin, with optional allotment filter.
 * filter=all (default) | unallotted | allotted
 */
export const listAllApplications = asyncHandler(async (req: Request, res: Response) => {
  const filter = (req.query.filter as string) ?? "all";
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = (page - 1) * limit;

  const ALLOTMENT_COLUMNS =
    "id, application_number, assigned_io_id, assigned_io_name, petitioner_name, " +
    "petitioner_mobile, subject, description, status, scraped_at";

  let query = supabaseAdmin
    .from("jansunwai_applications")
    .select(ALLOTMENT_COLUMNS, { count: "exact" })
    .order("scraped_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filter === "unallotted") query = query.is("assigned_io_id", null);
  else if (filter === "allotted") query = query.not("assigned_io_id", "is", null);

  const { data, error, count } = await query;
  if (error) throw new HttpError(400, error.message);

  res.json({
    applications: (data ?? []).map(toAllotmentDto),
    total: count ?? 0,
    page,
    limit,
  });
});

/** IO officers list for the allotment dropdown. */
export const listIoOfficers = asyncHandler(async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, username")
    .eq("role", "io")
    .order("full_name");

  if (error) throw new HttpError(400, error.message);

  res.json({
    officers: (data ?? []).map((p) => ({
      id: p.id,
      fullName: p.full_name as string | null,
      username: p.username as string,
    })),
  });
});

const allotSchema = z.object({ ioId: z.string().uuid() });

/** Allot a pending application to an IO officer. SHO/Admin only. */
export const allotApplication = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const { ioId } = allotSchema.parse(req.body);

  const { data: io, error: ioError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .eq("id", ioId)
    .eq("role", "io")
    .single();

  if (ioError || !io) throw new HttpError(404, "IO officer not found");

  const { data, error } = await supabaseAdmin
    .from("jansunwai_applications")
    .update({ assigned_io_id: ioId, assigned_io_name: io.full_name })
    .eq("id", id)
    .select(
      "id, application_number, assigned_io_id, assigned_io_name, petitioner_name, " +
        "petitioner_mobile, subject, description, status, scraped_at"
    )
    .single();

  if (error || !data) throw new HttpError(404, "Application not found");

  res.json({ application: toAllotmentDto(data as unknown as Record<string, any>) });
});

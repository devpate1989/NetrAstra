import { Request, Response } from "express";
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
    .eq("status", "pending")
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

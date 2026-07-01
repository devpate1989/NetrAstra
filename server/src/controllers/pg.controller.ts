import { Request, Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import { asyncHandler } from "../middleware/errorHandler";
import { raceOrBackground } from "../utils/backgroundRefresh";
import { runPgSummaryScrape, runPgComplaintsScrape, getLatestPgSummary } from "../services/scraping/pgPortal.service";

/** GET /pg/summary — latest cached pg_summary row, no scraping. */
export const getPgSummary = asyncHandler(async (_req: Request, res: Response) => {
  const summary = await getLatestPgSummary();
  res.json({ summary });
});

/** GET /pg/pending — list of public_grievances with status pending */
export const listPgComplaints = asyncHandler(async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("public_grievances")
    .select("id,complaint_no,applicant_name,mobile,complaint_category,complaint_details,status,assigned_io,date_of_complaint,scraped_at")
    .order("scraped_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  res.json({ complaints: data ?? [] });
});

/** POST /pg/refresh — on-demand rescrape of both summary + complaints */
export const refreshPg = asyncHandler(async (_req: Request, res: Response) => {
  // Run sequentially and return a flat result matching raceOrBackground's expected shape
  const run = async () => {
    const summary = await runPgSummaryScrape();
    const complaints = await runPgComplaintsScrape();
    return {
      skipped: summary.skipped && complaints.skipped,
      reason: summary.reason,
      summary,
      complaints,
    };
  };

  const result = await raceOrBackground(run(), "pg", (r) => {
    console.log(`[pg] refresh: summary stored=${r.summary?.stored}, complaints stored=${r.complaints?.stored}`);
  });
  res.json({ result });
});

import { runPgPdfScrape } from "../services/scraping/pgPortal.service";

/** POST /pg/pdf-sync — download PDFs for all PG complaints lacking petition_url */
export const syncPgPdfs = asyncHandler(async (_req: Request, res: Response) => {
  const result = await raceOrBackground(runPgPdfScrape(), "pg-pdf", (r) => {
    console.log(`[pg-pdf] sync complete: stored=${r.stored}/${r.scraped}`);
  });
  res.json({ result });
});

const PDF_SIGNED_URL_TTL = 60 * 60; // 1 hour

/** GET /pg/:id/pdf — returns a signed URL for a PG complaint's petition PDF */
export const getPgPdfUrl = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { data: complaint } = await supabaseAdmin
    .from("public_grievances")
    .select("petition_url, complaint_no")
    .eq("id", id)
    .single();

  if (!complaint?.petition_url) {
    res.json({ url: null, message: "PDF not yet downloaded — tap 'Refresh' to sync portal PDFs." });
    return;
  }

  const { data, error } = await supabaseAdmin.storage
    .from("pg-complaints")
    .createSignedUrl(complaint.petition_url, PDF_SIGNED_URL_TTL);

  if (error || !data?.signedUrl) {
    res.json({ url: null, message: "Could not generate PDF link." });
    return;
  }
  res.json({ url: data.signedUrl, complaintNo: complaint.complaint_no });
});

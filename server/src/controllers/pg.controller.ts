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

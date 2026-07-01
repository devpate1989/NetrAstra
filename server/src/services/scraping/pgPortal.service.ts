import fs from "fs";
import os from "os";
import path from "path";
import { WebDriver } from "selenium-webdriver";
import { env } from "../../config/env";
import { supabaseAdmin } from "../../config/supabase";
import { withDriver, withDownloadDriver } from "./browser";

/**
 * ──────────────────────────────────────────────────────────────────────────
 * SITE ADAPTER — Public Grievance Review Portal (पब्लिक ग्रीवांस पोर्टल)
 * URL: https://ts.uppolice.gov.in/PublicGrievance/
 *
 * Login uses the same CUG credentials as CCTNS (CCTNS_USERNAME / CCTNS_PASSWORD).
 * No CAPTCHA — straightforward ASP.NET Web Forms login.
 * Selectors verified from live DOM on 2026-07-01.
 * ──────────────────────────────────────────────────────────────────────────
 */
const PG = {
  loginPath:     "/PublicGrievance/Login.aspx",
  dashboardPath: "/PublicGrievance/PS_DASHBOARD",
  allListPath:   "/PublicGrievance/DisplayAllComplaints.aspx",

  usernameSelector: "#txtCug",
  passwordSelector: "#txtPassword",
  loginButton:      "#btnSubmit",

  // Dashboard stat labels
  totalSpan:       "#ContentPlaceHolder1_lblTotalApplication",
  disposedSpan:    "#ContentPlaceHolder1_lblDisposedApplication",
  pendingSpan:     "#ContentPlaceHolder1_lblPendingApplication",
  above10Span:     "#ContentPlaceHolder1_lblPendingAboveTenDaysApplication",
  psNameSpan:      "#ContentPlaceHolder1_lblPSName",

  // All-complaints listing page (no date filter needed)
  complaintTable:  "#ContentPlaceHolder1_grvComplainantDetail",
} as const;

export interface PgScrapeResult {
  ranAt: string;
  scraped: number;
  stored: number;
  skipped: boolean;
  reason?: string;
}

export interface PgSummary {
  policeStation: string;
  totalApplications: number;
  disposed: number;
  pending: number;
  pendingAbove10Days: number;
  scrapedAt: string;
}

function isConfigured(): boolean {
  return Boolean(env.pgPortalUrl && env.cctnsUsername && env.cctnsPassword);
}

function base(): string {
  return env.pgPortalUrl.replace(/\/$/, "");
}

/** Reads text content of an element by CSS selector, returns "" if not found. */
async function readText(driver: WebDriver, selector: string): Promise<string> {
  try {
    const el = await driver.findElement({ css: selector });
    return (await el.getText()).trim();
  } catch {
    return "";
  }
}

async function login(driver: WebDriver): Promise<boolean> {
  await driver.get(base() + PG.loginPath);
  await driver.sleep(2_500);

  try {
    const u = await driver.findElement({ css: PG.usernameSelector });
    const p = await driver.findElement({ css: PG.passwordSelector });
    const b = await driver.findElement({ css: PG.loginButton });
    await u.clear(); await u.sendKeys(env.cctnsUsername);
    await p.clear(); await p.sendKeys(env.cctnsPassword);
    await b.click();
  } catch (err) {
    console.error("[pg-scraper] Could not find login fields:", err);
    return false;
  }

  await driver.sleep(3_500);
  const url = await driver.getCurrentUrl();
  const ok = url.includes("PS_DASHBOARD") || url.includes("DASHBOARD") || url.includes("DisplayAll");
  if (!ok) console.warn("[pg-scraper] Login may have failed. URL:", url);
  return ok;
}

/**
 * Scrapes the PS_DASHBOARD summary counts and stores them in pg_summary.
 * This is the lightweight sync run every 30 min alongside CCTNS/Jan Sunwai.
 */
export async function runPgSummaryScrape(): Promise<PgScrapeResult> {
  const ranAt = new Date().toISOString();

  if (!isConfigured()) {
    return { ranAt, scraped: 0, stored: 0, skipped: true, reason: "PG_PORTAL_URL / CCTNS_USERNAME / CCTNS_PASSWORD not configured" };
  }

  try {
    return await withDriver(async (driver) => {
      const loggedIn = await login(driver);
      if (!loggedIn) {
        return { ranAt, scraped: 0, stored: 0, skipped: true, reason: "PG portal login failed" };
      }

      await driver.get(base() + PG.dashboardPath);
      await driver.sleep(2_000);

      const psName       = await readText(driver, PG.psNameSpan);
      const totalStr     = await readText(driver, PG.totalSpan);
      const disposedStr  = await readText(driver, PG.disposedSpan);
      const pendingStr   = await readText(driver, PG.pendingSpan);
      const above10Str   = await readText(driver, PG.above10Span);

      const total       = parseInt(totalStr,    10) || 0;
      const disposed    = parseInt(disposedStr, 10) || 0;
      const pending     = parseInt(pendingStr,  10) || 0;
      const above10     = parseInt(above10Str,  10) || 0;

      console.log(`[pg-scraper] ${psName || "PS"}: total=${total} disposed=${disposed} pending=${pending} above10=${above10}`);

      const { error } = await supabaseAdmin.from("pg_summary").insert({
        police_station:         psName || env.policeStationName || "Unknown",
        total_applications:     total,
        disposed,
        pending,
        pending_above_10_days:  above10,
        scraped_at:             ranAt,
      });

      if (error) {
        console.error("[pg-scraper] Failed to store summary:", error.message);
        return { ranAt, scraped: 1, stored: 0, skipped: false };
      }

      return { ranAt, scraped: 1, stored: 1, skipped: false };
    });
  } catch (err) {
    console.error("[pg-scraper] Summary scrape failed:", err);
    return { ranAt, scraped: 0, stored: 0, skipped: true, reason: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Scrapes the full pending complaints list from DisplayAllComplaints.aspx
 * and upserts each one into public_grievances.
 */
export async function runPgComplaintsScrape(): Promise<PgScrapeResult> {
  const ranAt = new Date().toISOString();

  if (!isConfigured()) {
    return { ranAt, scraped: 0, stored: 0, skipped: true, reason: "Not configured" };
  }

  try {
    return await withDriver(async (driver) => {
      const loggedIn = await login(driver);
      if (!loggedIn) {
        return { ranAt, scraped: 0, stored: 0, skipped: true, reason: "Login failed" };
      }

      // DisplayAllComplaints.aspx shows ALL pending complaints with no date filter.
      // Confirmed from live DOM: table is #ContentPlaceHolder1_grvComplainantDetail,
      // columns: serial, complaint_no (link), name, PS, district, date, IO name/mobile, PDF.
      await driver.get(base() + PG.allListPath);
      await driver.sleep(3_000);

      interface PgRow { complaintNo: string; applicantName: string; policeStation: string; district: string; date: string; ioNameMobile: string; }
      const rows = await driver.executeScript<PgRow[]>(`
        const table = document.querySelector('#ContentPlaceHolder1_grvComplainantDetail');
        if (!table) return [];
        const result = [];
        for (let i = 1; i < table.rows.length; i++) {
          const cells = Array.from(table.rows[i].cells);
          if (cells.length < 6) continue;
          const complaintLink = cells[1].querySelector('a');
          const complaintNo = complaintLink ? complaintLink.textContent.trim() : cells[1].textContent.trim();
          if (!complaintNo) continue;
          result.push({
            complaintNo:   complaintNo,
            applicantName: cells[2].textContent.trim(),
            policeStation: cells[3].textContent.trim(),
            district:      cells[4].textContent.trim(),
            date:          cells[5].textContent.trim(),
            ioNameMobile:  cells[6] ? cells[6].textContent.trim() : '',
          });
        }
        return result;
      `);

      if (!rows || rows.length === 0) {
        console.log("[pg-scraper] No complaint rows found in listing page");
        return { ranAt, scraped: 0, stored: 0, skipped: false };
      }

      console.log(`[pg-scraper] Found ${rows.length} complaints in listing`);

      let stored = 0;
      for (const row of rows) {
        if (!row.complaintNo) continue;

        // Parse date: "DD/MM/YYYY" → ISO
        let dateIso: string | null = null;
        if (row.date) {
          const parts = row.date.trim().split("/");
          if (parts.length === 3) dateIso = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }

        // IO name and mobile are combined "नाम /MOBILE" — split on last space
        const ioRaw = row.ioNameMobile || "";
        const slashIdx = ioRaw.lastIndexOf("/");
        const ioName   = slashIdx > 0 ? ioRaw.slice(0, slashIdx).trim() : ioRaw.trim();
        const ioMobile = slashIdx > 0 ? ioRaw.slice(slashIdx + 1).trim() : null;

        const { error } = await supabaseAdmin.from("public_grievances").upsert(
          {
            complaint_no:      row.complaintNo,
            applicant_name:    row.applicantName || null,
            mobile:            ioMobile,
            police_station:    row.policeStation || null,
            district:          row.district || null,
            assigned_io:       ioName || null,
            date_of_complaint: dateIso,
            status:            "pending",
            raw_data:          row,
            scraped_at:        ranAt,
          },
          { onConflict: "complaint_no" }
        );

        if (error) console.error(`[pg-scraper] Failed to store ${row.complaintNo}:`, error.message);
        else stored++;
      }

      return { ranAt, scraped: rows.length, stored, skipped: false };
    });
  } catch (err) {
    console.error("[pg-scraper] Complaints scrape failed:", err);
    return { ranAt, scraped: 0, stored: 0, skipped: true, reason: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Downloads complaint form PDFs for all PG complaints that don't yet have
 * a petition_url. Uses Chrome auto-download (the PostBack must fire in a
 * real browser session — a plain HTTP POST returns HTML, not the PDF).
 *
 * For 7 complaints this takes ~3-4 min (login + 7 downloads).
 */
export async function runPgPdfScrape(): Promise<PgScrapeResult> {
  const ranAt = new Date().toISOString();

  if (!isConfigured()) {
    return { ranAt, scraped: 0, stored: 0, skipped: true, reason: "Not configured" };
  }

  // Fetch complaints that still need a PDF
  const { data: pending } = await supabaseAdmin
    .from("public_grievances")
    .select("id,complaint_no")
    .is("petition_url", null)
    .order("date_of_complaint", { ascending: false });

  if (!pending || pending.length === 0) {
    return { ranAt, scraped: 0, stored: 0, skipped: false };
  }

  const downloadDir = path.join(os.tmpdir(), "pg-pdfs");
  fs.mkdirSync(downloadDir, { recursive: true });

  try {
    return await withDownloadDriver(downloadDir, async (driver) => {
      const loggedIn = await login(driver);
      if (!loggedIn) {
        return { ranAt, scraped: 0, stored: 0, skipped: true, reason: "Login failed" };
      }

      await driver.get(base() + PG.allListPath);
      await driver.sleep(3_000);

      // Get row count in table to compute ctlXX index
      const rowCount = await driver.executeScript<number>(
        `const t = document.querySelector('#ContentPlaceHolder1_grvComplainantDetail'); return t ? t.rows.length - 1 : 0;`
      );
      console.log(`[pg-pdf] Found ${rowCount} rows, ${pending.length} complaints need PDFs`);

      let stored = 0;

      for (let i = 0; i < Math.min(rowCount, pending.length); i++) {
        const complaint = pending[i];
        const ctlIndex = `ctl0${(i + 2).toString().padStart(i >= 8 ? 2 : 1, "0")}`;
        const eventTarget = `ctl00$ContentPlaceHolder1$grvComplainantDetail$${ctlIndex}$lnkComplaintFileDownload`;

        // Clear download dir before each download
        fs.readdirSync(downloadDir).forEach(f => fs.unlinkSync(path.join(downloadDir, f)));

        try {
          await driver.executeScript(`__doPostBack(arguments[0], '')`, eventTarget);
          await driver.sleep(500);
          // Dismiss any alert
          try { const a = await driver.switchTo().alert(); await a.accept(); } catch {}
        } catch (err) {
          console.error(`[pg-pdf] PostBack failed for ${complaint.complaint_no}:`, err);
          continue;
        }

        // Wait for the PDF to land in the download dir (up to 15s)
        const deadline = Date.now() + 15_000;
        let downloadedPath: string | null = null;
        while (Date.now() < deadline) {
          const files = fs.readdirSync(downloadDir).filter(f => !f.endsWith(".crdownload") && !f.endsWith(".tmp"));
          if (files.length > 0) { downloadedPath = path.join(downloadDir, files[0]); break; }
          await new Promise(r => setTimeout(r, 500));
        }

        if (!downloadedPath) {
          console.warn(`[pg-pdf] No download for complaint ${complaint.complaint_no} (may not have a PDF attachment)`);
          continue;
        }

        const pdfBytes = fs.readFileSync(downloadedPath);
        const storagePath = `${complaint.complaint_no}/${path.basename(downloadedPath)}`;

        const { error: uploadErr } = await supabaseAdmin.storage
          .from("pg-complaints")
          .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

        if (uploadErr) {
          console.error(`[pg-pdf] Upload failed for ${complaint.complaint_no}:`, uploadErr.message);
          continue;
        }

        // Store storagePath (not publicUrl) — the bucket is private so we generate
        // signed URLs on demand from /pg/:id/pdf when the app needs to open it.
        await supabaseAdmin
          .from("public_grievances")
          .update({ petition_url: storagePath })
          .eq("id", complaint.id);

        console.log(`[pg-pdf] Stored PDF for ${complaint.complaint_no}: ${storagePath}`);
        stored++;
      }

      return { ranAt, scraped: pending.length, stored, skipped: false };
    });
  } catch (err) {
    console.error("[pg-pdf] PDF scrape failed:", err);
    return { ranAt, scraped: 0, stored: 0, skipped: true, reason: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Returns the latest pg_summary row from DB (fast, no scraping). */
export async function getLatestPgSummary(): Promise<PgSummary | null> {
  const { data } = await supabaseAdmin
    .from("pg_summary")
    .select("police_station,total_applications,disposed,pending,pending_above_10_days,scraped_at")
    .order("scraped_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;
  return {
    policeStation:     data.police_station,
    totalApplications: data.total_applications,
    disposed:          data.disposed,
    pending:           data.pending,
    pendingAbove10Days: data.pending_above_10_days,
    scrapedAt:         data.scraped_at,
  };
}

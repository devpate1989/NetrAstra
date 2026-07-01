import { WebDriver } from "selenium-webdriver";
import { env } from "../../config/env";
import { supabaseAdmin } from "../../config/supabase";
import { withDriver } from "./browser";

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

  // Dashboard date-range search for complaint listing
  fromDateInput:   "#ContentPlaceHolder1_txtFromDate",
  toDateInput:     "#ContentPlaceHolder1_txtEndDate",
  searchBtn:       "#ContentPlaceHolder1_btnSearch",
  complaintTable:  "#ContentPlaceHolder1_gdvComplaintDetails",
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

      // Use the dashboard with a wide date range (01/01/2020 → today) to get all complaints
      await driver.get(base() + PG.dashboardPath);
      await driver.sleep(2_500);

      const today = new Date();
      const todayStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
      // Portal minimum allowed from-date is 01/01/2023
      const fromDateStr = "01/01/2023";

      // Set date fields via JS to bypass masked-input controls
      await driver.executeScript(`
        const fromEl = document.querySelector('#ContentPlaceHolder1_txtFromDate');
        const toEl   = document.querySelector('#ContentPlaceHolder1_txtEndDate');
        if (fromEl) fromEl.value = arguments[0];
        if (toEl)   toEl.value   = arguments[1];
      `, fromDateStr, todayStr);
      await driver.sleep(500);

      // Submit the search
      const searchBtn = await driver.findElement({ css: PG.searchBtn }).catch(() => null);
      if (searchBtn) {
        await driver.executeScript("arguments[0].click()", searchBtn);
        await driver.sleep(1_000);
        // Dismiss any validation alert that might appear
        try {
          const alert = await driver.switchTo().alert();
          const alertText = await alert.getText();
          console.log(`[pg-scraper] Alert dismissed: ${alertText}`);
          await alert.accept();
          await driver.sleep(500);
        } catch {
          // no alert
        }
        await driver.sleep(3_000);
      }

      const rows = await driver.executeScript<Record<string, string>[]>(`
        const table = document.querySelector('#ContentPlaceHolder1_gdvComplaintDetails');
        if (!table) return [];
        const headers = Array.from(table.rows[0]?.cells || []).map(c => c.textContent.trim());
        const result = [];
        for (let i = 1; i < table.rows.length; i++) {
          const cells = Array.from(table.rows[i].cells).map(c => c.textContent.trim());
          if (cells.every(c => !c)) continue; // skip empty rows
          const row = {};
          headers.forEach((h, j) => { row[h || 'col' + j] = cells[j] || ''; });
          result.push(row);
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
        const complaintNo = row["Complaint No"] || row["आवेदन क्र."] || row["Sr.No"] || Object.values(row)[0];
        if (!complaintNo?.trim()) continue;

        const { error } = await supabaseAdmin.from("public_grievances").upsert(
          {
            complaint_no:       complaintNo.trim(),
            applicant_name:     row["Applicant Name"] || row["आवेदक का नाम"] || null,
            mobile:             row["Mobile"] || row["मोबाइल"] || null,
            complaint_category: row["Category"] || row["श्रेणी"] || null,
            complaint_details:  row["Details"] || row["विवरण"] || null,
            status:             row["Status"] || row["स्थिति"] || "pending",
            assigned_io:        row["Assigned IO"] || row["विवेचक"] || null,
            date_of_complaint:  null,
            raw_data:           row,
            scraped_at:         ranAt,
          },
          { onConflict: "complaint_no" }
        );

        if (error) console.error(`[pg-scraper] Failed to store complaint ${complaintNo}:`, error.message);
        else stored++;
      }

      return { ranAt, scraped: rows.length, stored, skipped: false };
    });
  } catch (err) {
    console.error("[pg-scraper] Complaints scrape failed:", err);
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

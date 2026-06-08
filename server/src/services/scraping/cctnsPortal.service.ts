import type { Page } from "puppeteer";
import { env } from "../../config/env";
import { supabaseAdmin } from "../../config/supabase";
import { withPage } from "./browser";
import { solveCaptchaElement } from "./captcha.service";

/**
 * ──────────────────────────────────────────────────────────────────────────
 * SITE ADAPTER — CCTNS / FIR pending-investigations portal (prompt.md module 8)
 *
 * Everything that depends on the *target site's* markup lives in this single
 * block so the scrape logic below never has to change when the portal's HTML
 * does — only update these selectors/paths to match the real site once its
 * URL is known.
 * ──────────────────────────────────────────────────────────────────────────
 */
const ADAPTER = {
  /** Path appended to CCTNS_PORTAL_URL to reach the login page (often "/" or "/login"). */
  loginPath: "/login",
  /** Path appended to CCTNS_PORTAL_URL to reach the pending-investigations listing. */
  listingPath: "/pending-investigations",

  usernameSelector: "#username, input[name='username'], input[name='loginid']",
  passwordSelector: "#password, input[name='password']",
  /** CAPTCHA <img>/<canvas>, if the login form has one — solved via Gemini (see captcha.service). */
  captchaImageSelector: "#captchaImage, img.captcha, canvas.captcha",
  captchaInputSelector: "#captcha, input[name='captcha']",
  submitSelector: "button[type='submit'], input[type='submit']",

  /** A selector that only appears once logged in — used to confirm success. */
  loggedInMarkerSelector: "#logoutBtn, a[href*='logout'], .dashboard",

  /** Each pending-investigation row in the listing table/list. */
  rowSelector: "table.pending-investigations tbody tr, .investigation-row",
  fields: {
    externalReference: ".case-no, td:nth-child(1)",
    ioName: ".io-name, td:nth-child(2)",
    complainantName: ".complainant, td:nth-child(3)",
    section: ".section, td:nth-child(4)",
    caseSummary: ".summary, td:nth-child(5)",
    caseStatus: ".status, td:nth-child(6)",
    registeredOn: ".registered-on, td:nth-child(7)",
  },
} as const;

interface ScrapedInvestigationRow {
  externalReference: string | null;
  ioName: string | null;
  complainantName: string | null;
  section: string | null;
  caseSummary: string | null;
  caseStatus: string | null;
  registeredOn: string | null;
  raw: Record<string, string | null>;
}

export interface CctnsScrapeResult {
  ranAt: string;
  scraped: number;
  stored: number;
  skipped: boolean;
  reason?: string;
}

function isConfigured(): boolean {
  return Boolean(env.cctnsPortalUrl && env.cctnsUsername && env.cctnsPassword);
}

async function login(page: Page): Promise<boolean> {
  const loginUrl = new URL(ADAPTER.loginPath, env.cctnsPortalUrl).toString();
  await page.goto(loginUrl, { waitUntil: "networkidle2" });

  await page.waitForSelector(ADAPTER.usernameSelector, { timeout: 15_000 });
  await page.type(ADAPTER.usernameSelector, env.cctnsUsername, { delay: 20 });
  await page.type(ADAPTER.passwordSelector, env.cctnsPassword, { delay: 20 });

  const captcha = await page.$(ADAPTER.captchaImageSelector);
  if (captcha) {
    const answer = await solveCaptchaElement(page, ADAPTER.captchaImageSelector);
    if (!answer) {
      console.warn("[cctns-scraper] CAPTCHA present but could not be solved (Gemini unavailable or unreadable)");
      return false;
    }
    await page.type(ADAPTER.captchaInputSelector, answer, { delay: 20 });
  }

  await Promise.all([
    page.click(ADAPTER.submitSelector),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => null),
  ]);

  const loggedIn = await page
    .waitForSelector(ADAPTER.loggedInMarkerSelector, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  return loggedIn;
}

async function scrapeListing(page: Page): Promise<ScrapedInvestigationRow[]> {
  const listingUrl = new URL(ADAPTER.listingPath, env.cctnsPortalUrl).toString();
  await page.goto(listingUrl, { waitUntil: "networkidle2" });
  await page.waitForSelector(ADAPTER.rowSelector, { timeout: 20_000 }).catch(() => null);

  return page.evaluate(
    // Runs in the browser context, where DOM globals (document, Element, ...)
    // exist but aren't in this project's (Node-only) `lib` — hence `any`.
    (rowSelector: string, fields: Record<string, string>) => {
      const doc = (globalThis as any).document;
      const text = (root: any, selector: string): string | null => {
        const el = root.querySelector(selector);
        const value = el?.textContent?.replace(/\s+/g, " ").trim();
        return value && value.length > 0 ? value : null;
      };

      return Array.from(doc.querySelectorAll(rowSelector)).map((row: any) => {
        const raw: Record<string, string | null> = {};
        for (const [key, selector] of Object.entries(fields)) {
          raw[key] = text(row, selector as string);
        }
        return {
          externalReference: raw.externalReference,
          ioName: raw.ioName,
          complainantName: raw.complainantName,
          section: raw.section,
          caseSummary: raw.caseSummary,
          caseStatus: raw.caseStatus,
          registeredOn: raw.registeredOn,
          raw,
        };
      });
    },
    ADAPTER.rowSelector,
    ADAPTER.fields
  );
}

/** Normalizes loosely-formatted scraped dates ("12-06-2026", "12 Jun 2026", ...) to ISO `YYYY-MM-DD`, or null. */
function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

async function storeRows(rows: ScrapedInvestigationRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const records = rows
    .filter((row) => row.externalReference)
    .map((row) => ({
      source: "cctns_portal",
      external_reference: row.externalReference,
      police_station: env.policeStationName || "Unknown",
      district: env.policeDistrictName || null,
      io_name: row.ioName,
      section: row.section,
      complainant_name: row.complainantName,
      case_summary: row.caseSummary,
      case_status: row.caseStatus,
      registered_on: normalizeDate(row.registeredOn),
      raw_data: row.raw,
      scraped_at: new Date().toISOString(),
    }));

  if (records.length === 0) return 0;

  const { error } = await supabaseAdmin
    .from("investigations")
    .upsert(records, { onConflict: "source,external_reference" });

  if (error) {
    console.error("[cctns-scraper] Failed to store scraped rows:", error.message);
    return 0;
  }

  return records.length;
}

/**
 * Logs into the CCTNS portal, scrapes the pending-investigations list for the
 * configured police station, normalizes it, and upserts it into
 * `public.investigations` (so dashboards read from Supabase, not the live
 * site). Safe to call on a schedule (cron) or on demand — returns a summary
 * either way, and never throws (errors are logged + reflected in the result).
 */
export async function runCctnsInvestigationsScrape(): Promise<CctnsScrapeResult> {
  const ranAt = new Date().toISOString();

  if (!isConfigured()) {
    return {
      ranAt,
      scraped: 0,
      stored: 0,
      skipped: true,
      reason: "CCTNS_PORTAL_URL / CCTNS_USERNAME / CCTNS_PASSWORD are not configured",
    };
  }

  try {
    return await withPage(async (page) => {
      const loggedIn = await login(page);
      if (!loggedIn) {
        return { ranAt, scraped: 0, stored: 0, skipped: true, reason: "Login to the CCTNS portal failed" };
      }

      const rows = await scrapeListing(page);
      const stored = await storeRows(rows);
      return { ranAt, scraped: rows.length, stored, skipped: false };
    });
  } catch (err) {
    console.error("[cctns-scraper] Scrape run failed:", err);
    return {
      ranAt,
      scraped: 0,
      stored: 0,
      skipped: true,
      reason: err instanceof Error ? err.message : "Unknown scrape error",
    };
  }
}

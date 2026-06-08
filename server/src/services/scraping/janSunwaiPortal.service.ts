import type { Page } from "puppeteer";
import { env } from "../../config/env";
import { supabaseAdmin } from "../../config/supabase";
import { withPage } from "./browser";
import { solveCaptchaElement } from "./captcha.service";

/**
 * ──────────────────────────────────────────────────────────────────────────
 * SITE ADAPTER — Jan Sunwai / जनसुनवाई public-grievance portal (prompt.md module 9)
 *
 * Site-specific markup lives only in this block — update these to match the
 * real portal once its URL is known; the orchestration logic below stays the same.
 * ──────────────────────────────────────────────────────────────────────────
 */
const ADAPTER = {
  loginPath: "/login",
  /** Listing of applications (आवेदन) pending against this office/station. */
  listingPath: "/pending-applications",

  usernameSelector: "#username, input[name='username'], input[name='loginid']",
  passwordSelector: "#password, input[name='password']",
  captchaImageSelector: "#captchaImage, img.captcha, canvas.captcha",
  captchaInputSelector: "#captcha, input[name='captcha']",
  submitSelector: "button[type='submit'], input[type='submit']",
  loggedInMarkerSelector: "#logoutBtn, a[href*='logout'], .dashboard",

  /** Each pending आवेदन row in the listing. */
  rowSelector: "table.pending-applications tbody tr, .application-row",
  fields: {
    /** आवेदन संख्या (application number) — also used as the de-dup key. */
    applicationNumber: ".application-no, td:nth-child(1)",
    assignedIoName: ".assigned-io, td:nth-child(2)",
    petitionerName: ".petitioner-name, td:nth-child(3)",
    petitionerAddress: ".petitioner-address, td:nth-child(4)",
    petitionerMobile: ".petitioner-mobile, td:nth-child(5)",
    subject: ".subject, td:nth-child(6)",
    description: ".description, td:nth-child(7)",
  },
  /** Link/button in each row that opens the प्रार्थना पत्र (petition) detail/document. */
  detailLinkSelector: "a.view-petition, a[href*='petition']",
  /** On the detail page: an <a>/<iframe> pointing at a PDF, or a text container holding the petition body. */
  petitionPdfLinkSelector: "a[href$='.pdf'], iframe[src$='.pdf']",
  petitionTextSelector: ".petition-text, .petition-body, article",
} as const;

interface ScrapedApplicationRow {
  applicationNumber: string | null;
  assignedIoName: string | null;
  petitionerName: string | null;
  petitionerAddress: string | null;
  petitionerMobile: string | null;
  subject: string | null;
  description: string | null;
  detailHref: string | null;
  raw: Record<string, string | null>;
}

interface ScrapedPetition {
  format: "pdf" | "text";
  /** Storage path within JANSUNWAI_PETITIONS_BUCKET (PDFs only — see `downloadAndStorePdf`). */
  storagePath: string | null;
  text: string | null;
}

/** Private bucket the प्रार्थना पत्र PDFs are mirrored into (the portal's own URLs require its login session). */
export const JANSUNWAI_PETITIONS_BUCKET = "jansunwai-petitions";

export interface JanSunwaiScrapeResult {
  ranAt: string;
  scraped: number;
  stored: number;
  skipped: boolean;
  reason?: string;
}

function isConfigured(): boolean {
  return Boolean(env.jansunwaiPortalUrl && env.jansunwaiUsername && env.jansunwaiPassword);
}

async function login(page: Page): Promise<boolean> {
  const loginUrl = new URL(ADAPTER.loginPath, env.jansunwaiPortalUrl).toString();
  await page.goto(loginUrl, { waitUntil: "networkidle2" });

  await page.waitForSelector(ADAPTER.usernameSelector, { timeout: 15_000 });
  await page.type(ADAPTER.usernameSelector, env.jansunwaiUsername, { delay: 20 });
  await page.type(ADAPTER.passwordSelector, env.jansunwaiPassword, { delay: 20 });

  const captcha = await page.$(ADAPTER.captchaImageSelector);
  if (captcha) {
    const answer = await solveCaptchaElement(page, ADAPTER.captchaImageSelector);
    if (!answer) {
      console.warn("[jansunwai-scraper] CAPTCHA present but could not be solved (Gemini unavailable or unreadable)");
      return false;
    }
    await page.type(ADAPTER.captchaInputSelector, answer, { delay: 20 });
  }

  await Promise.all([
    page.click(ADAPTER.submitSelector),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => null),
  ]);

  return page
    .waitForSelector(ADAPTER.loggedInMarkerSelector, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
}

async function scrapeListing(page: Page): Promise<ScrapedApplicationRow[]> {
  const listingUrl = new URL(ADAPTER.listingPath, env.jansunwaiPortalUrl).toString();
  await page.goto(listingUrl, { waitUntil: "networkidle2" });
  await page.waitForSelector(ADAPTER.rowSelector, { timeout: 20_000 }).catch(() => null);

  return page.evaluate(
    // Runs in the browser context, where DOM globals (document, Element, ...)
    // exist but aren't in this project's (Node-only) `lib` — hence `any`.
    (rowSelector: string, fields: Record<string, string>, detailLinkSelector: string) => {
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
        const link = row.querySelector(detailLinkSelector);
        return {
          applicationNumber: raw.applicationNumber,
          assignedIoName: raw.assignedIoName,
          petitionerName: raw.petitionerName,
          petitionerAddress: raw.petitionerAddress,
          petitionerMobile: raw.petitionerMobile,
          subject: raw.subject,
          description: raw.description,
          detailHref: link?.getAttribute("href") ?? null,
          raw,
        };
      });
    },
    ADAPTER.rowSelector,
    ADAPTER.fields,
    ADAPTER.detailLinkSelector
  );
}

/**
 * Downloads a PDF the scraper's authenticated session can see and mirrors it
 * into our own private bucket — the portal's own URL requires its login
 * session/cookies, which the officer's browser/app won't have. Returns the
 * storage path (signed URLs are generated on demand by the controller, same
 * pattern as `report-pdfs`), or null if the download/upload fails.
 */
async function downloadAndStorePdf(page: Page, pdfUrl: string, applicationNumber: string): Promise<string | null> {
  try {
    const response = await page.goto(pdfUrl, { waitUntil: "networkidle2" });
    if (!response || !response.ok()) return null;

    const buffer = await response.buffer();
    const safeName = applicationNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
    const path = `${safeName}/${Date.now()}.pdf`;

    const { error } = await supabaseAdmin.storage
      .from(JANSUNWAI_PETITIONS_BUCKET)
      .upload(path, buffer, { contentType: "application/pdf", upsert: true });

    if (error) {
      console.error(`[jansunwai-scraper] Could not store petition PDF for ${applicationNumber}:`, error.message);
      return null;
    }

    return path;
  } catch (err) {
    console.error(`[jansunwai-scraper] Could not download petition PDF for ${applicationNumber}:`, err);
    return null;
  }
}

/** Visits an application's detail page and works out whether its प्रार्थना पत्र is a PDF or plain text. */
async function scrapePetition(page: Page, detailHref: string | null, applicationNumber: string): Promise<ScrapedPetition> {
  if (!detailHref) return { format: "text", storagePath: null, text: null };

  const detailUrl = new URL(detailHref, env.jansunwaiPortalUrl).toString();
  await page.goto(detailUrl, { waitUntil: "networkidle2" });

  const pdfHref = await page
    .$eval(ADAPTER.petitionPdfLinkSelector, (el) => el.getAttribute("href") ?? el.getAttribute("src"))
    .catch(() => null);

  if (pdfHref) {
    const pdfUrl = new URL(pdfHref, env.jansunwaiPortalUrl).toString();
    const storagePath = await downloadAndStorePdf(page, pdfUrl, applicationNumber);
    if (storagePath) {
      return { format: "pdf", storagePath, text: null };
    }
    // Fall through to text extraction if the PDF couldn't be mirrored — better
    // to surface something readable than nothing at all.
  }

  const bodyText = await page
    .$eval(ADAPTER.petitionTextSelector, (el) => el.textContent?.replace(/\s+/g, " ").trim() ?? null)
    .catch(() => null);

  return { format: "text", storagePath: null, text: bodyText };
}

/**
 * Matches a scraped IO name to a `profiles` row so the application can be
 * linked to the actual officer (used for the per-IO "pending Jan Sunwai" view
 * and the report pre-fill flow). Falls back to a name-only record if no exact
 * match is found — an admin can reassign later.
 */
async function resolveIoId(ioName: string | null): Promise<string | null> {
  if (!ioName) return null;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .eq("role", "io")
    .ilike("full_name", ioName.trim())
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}

async function storeRows(
  page: Page,
  rows: ScrapedApplicationRow[]
): Promise<number> {
  let stored = 0;

  for (const row of rows) {
    if (!row.applicationNumber) continue;

    const petition = await scrapePetition(page, row.detailHref, row.applicationNumber);
    const assignedIoId = await resolveIoId(row.assignedIoName);

    const record = {
      application_number: row.applicationNumber,
      source: "jansunwai_portal",
      assigned_io_id: assignedIoId,
      assigned_io_name: row.assignedIoName,
      petitioner_name: row.petitionerName,
      petitioner_address: row.petitionerAddress,
      petitioner_mobile: row.petitionerMobile,
      subject: row.subject,
      description: row.description,
      petition_format: petition.format,
      // `petition_url` stores a *storage path* within JANSUNWAI_PETITIONS_BUCKET
      // (not a public URL) — the controller mints short-lived signed URLs on
      // demand, mirroring the report-pdfs pattern (see reports.controller.ts).
      petition_url: petition.storagePath,
      petition_text: petition.text,
      raw_data: row.raw,
      scraped_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("jansunwai_applications")
      .upsert(record, { onConflict: "source,application_number" });

    if (error) {
      console.error(`[jansunwai-scraper] Failed to store application ${row.applicationNumber}:`, error.message);
      continue;
    }
    stored += 1;
  }

  return stored;
}

/**
 * Logs into the Jan Sunwai portal, scrapes pending आवेदन for this office,
 * resolves each to an IO (`profiles` row) where possible, fetches each
 * petition (PDF link or text body), and upserts everything into
 * `public.jansunwai_applications`. Safe for cron and on-demand use — never
 * throws; failures are logged and reflected in the returned summary.
 */
export async function runJanSunwaiScrape(): Promise<JanSunwaiScrapeResult> {
  const ranAt = new Date().toISOString();

  if (!isConfigured()) {
    return {
      ranAt,
      scraped: 0,
      stored: 0,
      skipped: true,
      reason: "JANSUNWAI_PORTAL_URL / JANSUNWAI_USERNAME / JANSUNWAI_PASSWORD are not configured",
    };
  }

  try {
    return await withPage(async (page) => {
      const loggedIn = await login(page);
      if (!loggedIn) {
        return { ranAt, scraped: 0, stored: 0, skipped: true, reason: "Login to the Jan Sunwai portal failed" };
      }

      const rows = await scrapeListing(page);
      const stored = await storeRows(page, rows);
      return { ranAt, scraped: rows.length, stored, skipped: false };
    });
  } catch (err) {
    console.error("[jansunwai-scraper] Scrape run failed:", err);
    return {
      ranAt,
      scraped: 0,
      stored: 0,
      skipped: true,
      reason: err instanceof Error ? err.message : "Unknown scrape error",
    };
  }
}

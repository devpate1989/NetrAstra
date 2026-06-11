import axios from "axios";
import { WebDriver, until } from "selenium-webdriver";
import { env } from "../../config/env";
import { supabaseAdmin } from "../../config/supabase";
import { waitForElement, withDriver } from "./browser";
import { solveCaptchaImage } from "./captcha.service";

/**
 * ──────────────────────────────────────────────────────────────────────────
 * SITE ADAPTER — Jan Sunwai / जनसुनवाई public-grievance portal (IGRS UP)
 *
 * Selectors verified against live DOM on 2026-06-09.
 * ──────────────────────────────────────────────────────────────────────────
 */
const ADAPTER = {
  loginPath: "/login",
  listingPath: "/igrs/officeLevelReferences",
  unmarkPath: "/igrs/UnmarkRefrence",

  usernameSelector: "input[name='username']",
  passwordSelector: "input[name='password']",
  // CAPTCHA is served as JPEG at /Captcha.jpg — fetched via HTTP with session cookies
  captchaImagePath: "/Captcha.jpg",
  captchaInputSelector: "input[name='captcha']",
  submitSelector: "button[type='submit']",

  // Each pending application has one of these links in its card header
  cardLinkSelector: "a[onclick*='showPopupComplaintDetails']",

  // Pagination data stored in data-pagination JSON attribute
  paginationSelector: "[data-pagination]",
} as const;

interface ScrapedApplicationRow {
  applicationNumber: string | null;
  assignedIoName: string | null;
  petitionerName: string | null;
  petitionerAddress: string | null;
  petitionerMobile: string | null;
  subject: string | null;
  description: string | null;
  receivedDate: string | null;
  raw: Record<string, string | null>;
}

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

async function fetchCaptchaBuffer(driver: WebDriver): Promise<Buffer | null> {
  try {
    const cookies = await driver.manage().getCookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const captchaUrl = new URL(ADAPTER.captchaImagePath, env.jansunwaiPortalUrl).toString();
    const response = await axios.get<ArrayBuffer>(captchaUrl, {
      responseType: "arraybuffer",
      headers: { Cookie: cookieHeader },
    });
    return Buffer.from(response.data);
  } catch (err) {
    console.warn("[jansunwai-scraper] Could not fetch CAPTCHA image:", err);
    return null;
  }
}

async function login(driver: WebDriver): Promise<boolean> {
  const loginUrl = new URL(ADAPTER.loginPath, env.jansunwaiPortalUrl).toString();
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await driver.get(loginUrl);
    await waitForElement(driver, ADAPTER.usernameSelector, 15_000);

    await (await driver.findElement({ css: ADAPTER.usernameSelector })).sendKeys(env.jansunwaiUsername);
    await (await driver.findElement({ css: ADAPTER.passwordSelector })).sendKeys(env.jansunwaiPassword);

    const captchaBuffer = await fetchCaptchaBuffer(driver);
    if (captchaBuffer) {
      const answer = await solveCaptchaImage(captchaBuffer);
      if (!answer) {
        console.warn(`[jansunwai-scraper] Attempt ${attempt}: CAPTCHA could not be solved`);
        continue;
      }
      console.log(`[jansunwai-scraper] Attempt ${attempt}: CAPTCHA answer = "${answer}"`);
      await (await driver.findElement({ css: ADAPTER.captchaInputSelector })).sendKeys(answer);
    }

    await (await driver.findElement({ css: ADAPTER.submitSelector })).click();
    await driver.sleep(2_000);

    const currentUrl = await driver.getCurrentUrl();
    if (!currentUrl.includes("/login")) {
      console.log(`[jansunwai-scraper] Logged in on attempt ${attempt}`);
      return true;
    }

    console.warn(`[jansunwai-scraper] Attempt ${attempt} failed — URL still: ${currentUrl}`);
  }

  return false;
}

/**
 * Extracts all application cards visible on the current listing page.
 * Each card is a pair of sibling <div> elements: a header div (with class
 * "box-title text-warning") followed by a body div containing petitioner
 * details, description, and other fields.
 */
async function extractCardsFromPage(driver: WebDriver): Promise<ScrapedApplicationRow[]> {
  return driver.executeScript<ScrapedApplicationRow[]>(function () {
    const doc = (globalThis as any).document;

    function findColContaining(parent: any, text: string): any {
      return (
        Array.from(parent.querySelectorAll(".col-sm-12")).find((el: any) =>
          el.textContent.includes(text)
        ) || null
      );
    }

    const links: any[] = Array.from(
      doc.querySelectorAll("a[onclick*='showPopupComplaintDetails']")
    );

    return links.map((link: any) => {
      const headerDiv = link.closest("div.box-title");
      const cardHeaderContainer = headerDiv?.parentElement;
      const cardBodyContainer = cardHeaderContainer?.nextElementSibling;

      const applicationNumber = link.textContent?.trim() || null;

      // Received date from header TD text: "N) APPNUM (type) प्राप्त दिनांक- DD/MM/YYYY"
      const headerTdText = link.parentElement?.textContent?.replace(/\s+/g, " ").trim() || "";
      const dateMatch = headerTdText.match(/प्राप्त दिनांक-\s*(\d{2}\/\d{2}\/\d{4})/);
      const receivedDate = dateMatch ? dateMatch[1] : null;

      if (!cardBodyContainer) {
        return {
          applicationNumber, assignedIoName: null, petitionerName: null,
          petitionerAddress: null, petitionerMobile: null, subject: null,
          description: null, receivedDate, raw: { headerTdText },
        };
      }

      // Department + category from first detail row
      const deptCatDiv = findColContaining(cardBodyContainer, "विभाग-");
      const deptCatText = deptCatDiv?.textContent?.replace(/\s+/g, " ").trim() || "";
      const deptMatch = deptCatText.match(/विभाग-\s*(.*?)(?:\s+सन्दर्भ श्रेणी|$)/);
      const catMatch = deptCatText.match(/सन्दर्भ श्रेणी\s*-\s*(.*?)$/);
      const subject =
        [deptMatch?.[1]?.trim(), catMatch?.[1]?.trim()].filter(Boolean).join(" — ") || null;

      // Petitioner details
      const petitionerDiv = findColContaining(cardBodyContainer, "आवेदनकर्ता का विवरण:");
      const petitionerRaw = petitionerDiv?.textContent?.replace(/\s+/g, " ").trim() || "";
      const petitionerContent = petitionerRaw.replace("आवेदनकर्ता का विवरण:", "").trim();

      const mobileMatch = petitionerContent.match(/मोबाइल नंबर\s*:([0-9,\s]+)/);
      const petitionerMobile = mobileMatch
        ? mobileMatch[1].split(",")[0].trim() || null
        : null;
      const beforeMobile = mobileMatch
        ? petitionerContent.slice(0, petitionerContent.indexOf("मोबाइल नंबर")).trim()
        : petitionerContent;

      const commaIdx = beforeMobile.indexOf(",");
      const petitionerName = commaIdx > 0 ? beforeMobile.slice(0, commaIdx).trim() || null : beforeMobile || null;
      const petitionerAddress = commaIdx > 0 ? beforeMobile.slice(commaIdx + 1).trim() || null : null;

      // Description
      const descDiv = cardBodyContainer.querySelector(".col-sm-12[align='justify']");
      const description =
        descDiv?.textContent
          ?.replace("आवेदन पत्र का विवरण:", "")
          .replace(/\s+/g, " ")
          .trim() || null;

      return {
        applicationNumber,
        assignedIoName: null,
        petitionerName,
        petitionerAddress,
        petitionerMobile,
        subject,
        description,
        receivedDate,
        raw: { receivedDate, deptCatText, petitionerRaw },
      };
    });
  });
}

/**
 * ──────────────────────────────────────────────────────────────────────────
 * संदर्भ प्रकार (reference type) categories — IGRS UP fixes 14 `complaitsType`
 * radio values, shared by /igrs/officeLevelReferences and /igrs/UnmarkRefrence.
 * The listing page only ever shows whichever category is selected, so every
 * category must be selected (and paginated) in turn to see all references.
 * ──────────────────────────────────────────────────────────────────────────
 */
const REFERENCE_TYPES: { code: number; name: string }[] = [
  { code: 1, name: "मुख्यमंत्री सन्दर्भ" },
  { code: 9, name: "मुख्यमंत्री हेल्पलाइन सन्दर्भ" },
  { code: 2, name: "जिलाधिकारी/पुलिस अधीक्षक/सी.एस" },
  { code: 3, name: "सम्पूर्ण समाधान दिवस" },
  { code: 4, name: "ऑनलाइन सन्दर्भ" },
  { code: 5, name: "मंडलायुक्त/IG/DIG सन्दर्भ" },
  { code: 6, name: "पी.जी. पोर्टल सन्दर्भ (भारत सरकार)" },
  { code: 7, name: "उप मुख्यमंत्री/मंत्री सन्दर्भ" },
  { code: 8, name: "शासन/राजस्व परिषद्/निदेशालय सन्दर्भ" },
  { code: 41, name: "अवैध भूमि कब्ज़ा सन्दर्भ" },
  { code: 21, name: "मुख्य विकास अधिकारी सन्दर्भ" },
  { code: 73, name: "मा० राज्यपाल सन्दर्भ" },
  { code: 88, name: "मुख्य सचिव सन्दर्भ" },
  { code: 31, name: "उप जिला अधिकारी/महिला हेल्प डेस्क सन्दर्भ" },
];

/** Reads `{ total, pageSize }` from the page's `[data-pagination]` element. */
async function readPagination(driver: WebDriver): Promise<{ total: number; pageSize: number }> {
  const pagination = await driver.executeScript<{ totals: string; pageSize: string } | null>(
    function () {
      const el = (globalThis as any).document.querySelector("[data-pagination]");
      if (!el) return null;
      try {
        return JSON.parse(el.getAttribute("data-pagination"));
      } catch {
        return null;
      }
    }
  );

  return {
    total: pagination ? parseInt(pagination.totals, 10) || 0 : 0,
    pageSize: pagination ? parseInt(pagination.pageSize, 10) || 10 : 10,
  };
}

/** Selects the संदर्भ प्रकार `complaitsType` radio for `code` and resubmits the search form, unless it's already selected. */
async function selectReferenceType(driver: WebDriver, code: number): Promise<void> {
  const radio = await driver.findElement({ css: `input[name='complaitsType'][value='${code}']` });
  if (await radio.isSelected()) return;

  await radio.click();
  await (await driver.findElement({ css: "#submitBtn" })).click();
  await driver.sleep(2_000);
}

/**
 * Scrapes every pending office-level आवेदन across all 14 संदर्भ प्रकार
 * categories — selecting each category in turn and paginating through its
 * results, since the listing page only ever shows one category at a time.
 */
async function scrapeListing(driver: WebDriver): Promise<ScrapedApplicationRow[]> {
  const listingUrl = new URL(ADAPTER.listingPath, env.jansunwaiPortalUrl).toString();
  await driver.get(listingUrl);
  await driver.sleep(2_500);

  const allRows: ScrapedApplicationRow[] = [];

  for (const { code, name } of REFERENCE_TYPES) {
    await selectReferenceType(driver, code);

    const { total, pageSize } = await readPagination(driver);
    if (total === 0) continue;

    const totalPages = Math.ceil(total / pageSize);
    console.log(`[jansunwai-scraper] ${name}: ${total} pending across ${totalPages} page(s)`);

    const page1Rows = await extractCardsFromPage(driver);
    allRows.push(...page1Rows);

    for (let page = 2; page <= totalPages; page++) {
      await driver.executeScript(`AjPagination(${page})`);
      // Wait for the card link selector to appear (AJAX replaces content)
      await driver
        .wait(until.elementLocated({ css: ADAPTER.cardLinkSelector }), 15_000)
        .catch(() => null);
      await driver.sleep(1_500);

      const pageRows = await extractCardsFromPage(driver);
      allRows.push(...pageRows);
    }
  }

  console.log(`[jansunwai-scraper] ${allRows.length} pending applications across all categories`);
  return allRows;
}


async function storeRows(rows: ScrapedApplicationRow[]): Promise<number> {
  let stored = 0;

  for (const row of rows) {
    if (!row.applicationNumber) continue;

    const { error } = await supabaseAdmin.from("jansunwai_applications").upsert(
      {
        application_number: row.applicationNumber,
        source: "jansunwai_portal",
        petitioner_name: row.petitionerName,
        petitioner_address: row.petitionerAddress,
        petitioner_mobile: row.petitionerMobile,
        subject: row.subject,
        description: row.description,
        petition_format: "text",
        petition_url: null,
        petition_text: row.description,
        raw_data: row.raw,
        scraped_at: new Date().toISOString(),
      },
      { onConflict: "source,application_number" }
    );

    if (error) {
      console.error(
        `[jansunwai-scraper] Failed to store application ${row.applicationNumber}:`,
        error.message
      );
      continue;
    }
    stored += 1;
  }

  return stored;
}

/**
 * Logs into the Jan Sunwai portal, scrapes all pending office-level आवेदन,
 * and upserts everything into `public.jansunwai_applications`.
 * Never throws — failures are logged and reflected in the returned summary.
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
    return await withDriver(async (driver) => {
      const loggedIn = await login(driver);
      if (!loggedIn) {
        return { ranAt, scraped: 0, stored: 0, skipped: true, reason: "Login to the Jan Sunwai portal failed" };
      }

      const rows = await scrapeListing(driver);
      const stored = await storeRows(rows);
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

/**
 * ──────────────────────────────────────────────────────────────────────────
 * REFERENCE-TYPE SUMMARY — category-wise (संदर्भ प्रकार) pending counts
 *
 * For each of the 14 fixed reference-type categories (REFERENCE_TYPES,
 * defined above), reads the result count (`pagination.totals`) from
 * /igrs/UnmarkRefrence (unmarked references) and /igrs/officeLevelReferences
 * (pending at office level), and stores both — plus their sum — in
 * `jansunwai_reference_summary`.
 * ──────────────────────────────────────────────────────────────────────────
 */
export interface JanSunwaiReferenceSummaryResult {
  ranAt: string;
  stored: number;
  skipped: boolean;
  reason?: string;
}

/**
 * Visits `path` and, for every संदर्भ प्रकार category, selects its
 * `complaitsType` radio, submits the search form, and reads the resulting
 * `pagination.totals`. Returns a map of category code -> count.
 */
async function collectReferenceTypeTotals(
  driver: WebDriver,
  path: string
): Promise<Record<number, number>> {
  const url = new URL(path, env.jansunwaiPortalUrl).toString();
  await driver.get(url);
  await driver.sleep(2_000);

  const totals: Record<number, number> = {};

  for (const { code } of REFERENCE_TYPES) {
    await selectReferenceType(driver, code);
    totals[code] = (await readPagination(driver)).total;
  }

  return totals;
}

async function storeReferenceSummary(
  unmarkTotals: Record<number, number>,
  officeTotals: Record<number, number>
): Promise<number> {
  let stored = 0;
  const scrapedAt = new Date().toISOString();

  for (const { code, name } of REFERENCE_TYPES) {
    const { error } = await supabaseAdmin.from("jansunwai_reference_summary").upsert(
      {
        complaint_type_code: code,
        complaint_type_name: name,
        unmark_count: unmarkTotals[code] ?? 0,
        office_pending_count: officeTotals[code] ?? 0,
        scraped_at: scrapedAt,
      },
      { onConflict: "complaint_type_code" }
    );

    if (error) {
      console.error(`[jansunwai-scraper] Failed to store reference summary for type ${code}:`, error.message);
      continue;
    }
    stored += 1;
  }

  return stored;
}

/**
 * Logs into the Jan Sunwai portal and, for each संदर्भ प्रकार category, scrapes
 * the unmarked-reference count and the office-level-pending count, storing
 * both — plus their sum — in `jansunwai_reference_summary`. Never throws.
 */
export async function runJanSunwaiReferenceSummaryScrape(): Promise<JanSunwaiReferenceSummaryResult> {
  const ranAt = new Date().toISOString();

  if (!isConfigured()) {
    return {
      ranAt,
      stored: 0,
      skipped: true,
      reason: "JANSUNWAI_PORTAL_URL / JANSUNWAI_USERNAME / JANSUNWAI_PASSWORD are not configured",
    };
  }

  try {
    return await withDriver(async (driver) => {
      const loggedIn = await login(driver);
      if (!loggedIn) {
        return { ranAt, stored: 0, skipped: true, reason: "Login to the Jan Sunwai portal failed" };
      }

      const unmarkTotals = await collectReferenceTypeTotals(driver, ADAPTER.unmarkPath);
      const officeTotals = await collectReferenceTypeTotals(driver, ADAPTER.listingPath);
      const stored = await storeReferenceSummary(unmarkTotals, officeTotals);

      return { ranAt, stored, skipped: false };
    });
  } catch (err) {
    console.error("[jansunwai-scraper] Reference summary scrape failed:", err);
    return {
      ranAt,
      stored: 0,
      skipped: true,
      reason: err instanceof Error ? err.message : "Unknown scrape error",
    };
  }
}

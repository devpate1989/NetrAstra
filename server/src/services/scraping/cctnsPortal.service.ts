import fs from "fs";
import path from "path";
import { WebDriver } from "selenium-webdriver";
import { env } from "../../config/env";
import { supabaseAdmin } from "../../config/supabase";
import { withDriver } from "./browser";

async function debugSnapshot(driver: WebDriver, tag: string): Promise<void> {
  try {
    const url = await driver.getCurrentUrl();
    const title = await driver.getTitle();
    const png = await driver.takeScreenshot();
    const dir = path.resolve(__dirname, "../../../../../debug-screenshots");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${tag}-${Date.now()}.png`);
    fs.writeFileSync(file, png, "base64");
    console.log(`[cctns-scraper] snapshot: url=${url} title="${title}" file=${file}`);
  } catch (e) {
    console.warn("[cctns-scraper] Could not take debug snapshot:", e);
  }
}

/**
 * ──────────────────────────────────────────────────────────────────────────
 * SITE ADAPTER — CCTNS / FIR pending-investigations portal
 * All selectors verified from live DOM inspection on 2026-06-09.
 *
 * Flow:
 *   1. Login (no CAPTCHA)
 *   2. FIRPendingInvestigation.aspx — set dates + cascade to Kumarganj PS
 *   3. Submit → summary table #gdvdata (1 row: 66 pending / 2764 total)
 *   4. Click the "66" link → PostBack → popup table #gdvPopUP
 *   5. Extract each page of #gdvPopUP (pagination via Page$N PostBack)
 *   6. Store individual FIR records (FIR No, Date, Sections, IO Name)
 * ──────────────────────────────────────────────────────────────────────────
 */
const ADAPTER = {
  loginPath: "/CCTNSWEB/Login.aspx",
  listingPath: "/CCTNSWEB/FIRPendingInvestigation.aspx",

  usernameSelector: "#txtUserName",
  passwordSelector: "#txtPassword",
  loginButtonSelector: "#btnLogin",
  loggedInUrlFragment: "home.aspx",

  // Date fields — bypass MaskedEdit via JS
  fromDateId: "txtStartDate",
  fromDateClientStateId: "meeFromDate_ClientState",
  toDateId: "txtEndDate",
  toDateClientStateId: "meeToDate_ClientState",
  fromDateValue: "01/01/1995",

  // Cascade dropdowns
  zoneDropdown: "ddlzone",
  rangeDropdown: "ddlrange",
  districtDropdown: "ddlDistrict",
  psDropdown: "ddlPoliceStation",
  reportTypeDropdown: "ddlReportType",
  reportTypePs: "2",

  // Summary search button (JS click to avoid StaleElementReferenceError)
  searchButtonId: "btnSearchFir",

  // Summary result table → click the pending-count link in col 5 of data row
  summaryTableId: "gdvdata",
  pendingCountLinkPostback: "gdvdata$ctl02$lnkFIRPSDetails",

  // Detailed popup table (appears after clicking the pending count link)
  popupTableId: "gdvPopUP",

  // Popup columns (0-based)
  popupCols: {
    firNo: 3,
    firDate: 4,
    actSection: 5,
    ioName: 6,
  },
} as const;

interface FirRecord {
  firNo: string;
  firDate: string;
  actSection: string;
  ioName: string;
  ioNameParsed: string; // just the person's name
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

function baseUrl(): string {
  return new URL(env.cctnsPortalUrl).origin;
}

function todayDDMMYYYY(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** "DD/MM/YYYY" → "YYYY-MM-DD" */
function parseFirDate(ddmmyyyy: string): string | null {
  const parts = ddmmyyyy.trim().split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  const iso = `${yyyy}-${mm}-${dd}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * "SI (Sub-Inspector) - ASHOK KUMAR PATHAK - 980500431" → "ASHOK KUMAR PATHAK"
 * "Dy. SP (Deputy Superintendant of Police) - CO MILKIPUR - 9454401395" → "CO MILKIPUR"
 */
function parseIoName(raw: string): string {
  const parts = raw.split(" - ");
  return parts.length >= 2 ? parts[1].trim() : raw.trim();
}

async function login(driver: WebDriver): Promise<boolean> {
  await driver.get(baseUrl() + ADAPTER.loginPath);
  await driver.sleep(3_000);

  try {
    const u = await driver.findElement({ css: ADAPTER.usernameSelector });
    const p = await driver.findElement({ css: ADAPTER.passwordSelector });
    const b = await driver.findElement({ css: ADAPTER.loginButtonSelector });
    await u.clear(); await u.sendKeys(env.cctnsUsername);
    await p.clear(); await p.sendKeys(env.cctnsPassword);
    await b.click();
  } catch (err) {
    console.error("[cctns-scraper] Could not find login fields:", err);
    await debugSnapshot(driver, "login-error");
    return false;
  }

  await driver.sleep(4_000);
  await debugSnapshot(driver, "post-login");

  const url = await driver.getCurrentUrl();
  if (!url.toLowerCase().includes(ADAPTER.loggedInUrlFragment)) {
    console.warn("[cctns-scraper] Login failed. URL:", url);
    return false;
  }
  return true;
}

async function selectDropdown(driver: WebDriver, id: string, value: string): Promise<void> {
  await driver.executeScript(
    `const s = document.getElementById(arguments[0]);
     if (!s) return;
     s.value = arguments[1];
     s.dispatchEvent(new Event('change', { bubbles: true }));`,
    id, value
  );
}

async function waitForDropdownReload(
  driver: WebDriver, id: string, previousCount: number, timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count: number = await driver.executeScript(
      `const s = document.getElementById(arguments[0]); return s ? s.options.length : 0;`, id
    );
    if (count !== previousCount && count > 1) return;
    await driver.sleep(500);
  }
  console.warn(`[cctns-scraper] Dropdown #${id} did not reload within ${timeoutMs}ms`);
}

async function applyFilters(driver: WebDriver): Promise<void> {
  const zoneId = env.cctnsZoneId || "76";
  const rangeId = env.cctnsRangeId || "240";
  const districtId = env.cctnsDistrictId || "31641";
  const psId = env.cctnsPsId || "31641033";

  const rc: number = await driver.executeScript(
    `const s = document.getElementById('ddlrange'); return s ? s.options.length : 0;`
  );
  await selectDropdown(driver, ADAPTER.zoneDropdown, zoneId);
  await waitForDropdownReload(driver, ADAPTER.rangeDropdown, rc);
  await driver.sleep(500);

  const dc: number = await driver.executeScript(
    `const s = document.getElementById('ddlDistrict'); return s ? s.options.length : 0;`
  );
  await selectDropdown(driver, ADAPTER.rangeDropdown, rangeId);
  await waitForDropdownReload(driver, ADAPTER.districtDropdown, dc);
  await driver.sleep(500);

  const pc: number = await driver.executeScript(
    `const s = document.getElementById('ddlPoliceStation'); return s ? s.options.length : 0;`
  );
  await selectDropdown(driver, ADAPTER.districtDropdown, districtId);
  await waitForDropdownReload(driver, ADAPTER.psDropdown, pc);
  await driver.sleep(500);

  await selectDropdown(driver, ADAPTER.psDropdown, psId);
  await driver.sleep(300);
  await selectDropdown(driver, ADAPTER.reportTypeDropdown, ADAPTER.reportTypePs);
}

/** Extract all FIR rows from the current page of #gdvPopUP. */
async function extractPopupPage(driver: WebDriver): Promise<FirRecord[]> {
  return driver.executeScript<FirRecord[]>(
    function (tableId: any, cols: any) {
      const table = (globalThis as any).document.getElementById(tableId) as any;
      if (!table) return [];

      const records: any[] = [];
      for (let i = 1; i < table.rows.length; i++) {
        const cells = table.rows[i].cells;
        if (cells.length < 7) continue;

        const text = (idx: number): string =>
          (cells[idx]?.textContent ?? "").replace(/\s+/g, " ").trim();

        const firNo = text(cols.firNo);
        if (!firNo) continue; // skip totals / empty rows

        const raw = text(cols.ioName);
        const parts = raw.split(" - ");
        const ioNameParsed = parts.length >= 2 ? parts[1].trim() : raw.trim();

        records.push({
          firNo,
          firDate: text(cols.firDate),
          actSection: text(cols.actSection),
          ioName: raw,
          ioNameParsed,
        });
      }
      return records;
    },
    ADAPTER.popupTableId,
    ADAPTER.popupCols
  );
}

/** Read total page count from the popup's pager row. */
async function getPopupPageCount(driver: WebDriver): Promise<number> {
  const count: number = await driver.executeScript(`
    const table = document.getElementById(arguments[0]);
    if (!table) return 1;
    // Pager row: last row of the table, containing page links
    const pagerRow = table.rows[table.rows.length - 1];
    if (!pagerRow) return 1;
    const links = pagerRow.querySelectorAll('a[href*="Page$"]');
    let max = 1;
    links.forEach(a => {
      const m = a.getAttribute('href').match(/Page\\$(\\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max;
  `, ADAPTER.popupTableId);
  return count;
}

async function scrapeListing(driver: WebDriver): Promise<FirRecord[]> {
  await driver.get(baseUrl() + ADAPTER.listingPath);
  await driver.sleep(3_000);
  await debugSnapshot(driver, "pending-inv-page");

  // Set date range via JS (sendKeys mangles MaskedEdit fields)
  try {
    await driver.executeScript(
      `function setMasked(inputId, csId, value) {
         const el = document.getElementById(inputId); if (el) el.value = value;
         const cs = document.getElementById(csId);   if (cs) cs.value = '';
       }
       setMasked(arguments[0], arguments[1], arguments[2]);
       setMasked(arguments[3], arguments[4], arguments[5]);`,
      ADAPTER.fromDateId, ADAPTER.fromDateClientStateId, ADAPTER.fromDateValue,
      ADAPTER.toDateId,   ADAPTER.toDateClientStateId,   todayDDMMYYYY()
    );
  } catch (err) {
    console.warn("[cctns-scraper] Could not set date range:", err);
  }

  await applyFilters(driver);

  // Wait for UpdatePanel re-render after ddlReportType change, then JS-click
  await driver.sleep(2_000);
  const clicked: boolean = await driver.executeScript(
    `const btn = document.getElementById(arguments[0]); if (btn) { btn.click(); return true; } return false;`,
    ADAPTER.searchButtonId
  );
  if (!clicked) {
    console.error("[cctns-scraper] Search button not found");
    return [];
  }

  await driver.sleep(6_000);
  await debugSnapshot(driver, "pending-inv-summary");

  // Check the summary table appeared
  const summaryFound: boolean = await driver.executeScript(
    `return !!document.getElementById(arguments[0])`, ADAPTER.summaryTableId
  );
  if (!summaryFound) {
    console.warn("[cctns-scraper] Summary table #gdvdata not found — form validation may have failed");
    await debugSnapshot(driver, "pending-inv-no-summary");
    return [];
  }

  // Click the pending-count link ("66") to trigger the detail PostBack
  await driver.executeScript(
    `__doPostBack(arguments[0], '')`, ADAPTER.pendingCountLinkPostback
  );
  await driver.sleep(5_000);
  await debugSnapshot(driver, "pending-inv-popup");

  // Check the popup table appeared
  const popupFound: boolean = await driver.executeScript(
    `return !!document.getElementById(arguments[0])`, ADAPTER.popupTableId
  );
  if (!popupFound) {
    console.warn("[cctns-scraper] Popup table #gdvPopUP not found after clicking detail link");
    await debugSnapshot(driver, "pending-inv-no-popup");
    return [];
  }

  // Extract all pages
  const allRecords: FirRecord[] = [];
  const totalPages = await getPopupPageCount(driver);
  console.log(`[cctns-scraper] Popup has ${totalPages} page(s)`);

  const page1 = await extractPopupPage(driver);
  allRecords.push(...page1);
  console.log(`[cctns-scraper] Page 1: ${page1.length} records`);

  for (let page = 2; page <= totalPages; page++) {
    const prevCount = allRecords.length;
    await driver.executeScript(
      `__doPostBack(arguments[0], arguments[1])`, ADAPTER.popupTableId, `Page$${page}`
    );
    await driver.sleep(4_000);

    const pageRecords = await extractPopupPage(driver);
    allRecords.push(...pageRecords);
    console.log(`[cctns-scraper] Page ${page}: ${pageRecords.length} records (total so far: ${allRecords.length})`);

    if (pageRecords.length === 0 || allRecords.length === prevCount) break;
  }

  return allRecords;
}

async function storeRows(records: FirRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  const scrapedAt = new Date().toISOString();
  const ps = env.policeStationName || "Kumarganj";
  const district = env.policeDistrictName || "Ayodhya";

  const rows = records
    .filter((r) => r.firNo)
    .map((r) => ({
      source: "cctns_portal",
      external_reference: r.firNo,    // FIR No is unique per station
      police_station: ps,
      district,
      io_name: r.ioNameParsed || null,
      section: r.actSection || null,
      complainant_name: null,
      case_summary: r.actSection || null,
      case_status: "pending",
      registered_on: parseFirDate(r.firDate),
      raw_data: r,
      scraped_at: scrapedAt,
    }));

  if (rows.length === 0) return 0;

  const { error } = await supabaseAdmin
    .from("investigations")
    .upsert(rows, { onConflict: "source,external_reference" });

  if (error) {
    console.error("[cctns-scraper] Failed to store rows:", error.message);
    return 0;
  }

  return rows.length;
}

/**
 * Logs into CCTNS, navigates Kumarganj PS pending-investigation report,
 * clicks the detail link to get all 66 individual FIR records across all
 * popup pages, and upserts them into `public.investigations`.
 */
export async function runCctnsInvestigationsScrape(): Promise<CctnsScrapeResult> {
  const ranAt = new Date().toISOString();

  if (!isConfigured()) {
    return { ranAt, scraped: 0, stored: 0, skipped: true, reason: "CCTNS credentials not configured" };
  }

  try {
    return await withDriver(async (driver) => {
      if (!(await login(driver))) {
        return { ranAt, scraped: 0, stored: 0, skipped: true, reason: "Login to CCTNS portal failed" };
      }

      const records = await scrapeListing(driver);
      const stored = await storeRows(records);
      return { ranAt, scraped: records.length, stored, skipped: false };
    });
  } catch (err) {
    console.error("[cctns-scraper] Scrape run failed:", err);
    return {
      ranAt, scraped: 0, stored: 0, skipped: true,
      reason: err instanceof Error ? err.message : "Unknown scrape error",
    };
  }
}

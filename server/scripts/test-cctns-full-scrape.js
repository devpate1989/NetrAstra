// Full end-to-end test: login → cascade → PS-wise → dump results for Kumarganj
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", "..", ".env");
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

const BASE_URL = new URL(process.env.CCTNS_PORTAL_URL || "https://cctnsup.gov.in").origin;
const USERNAME = process.env.CCTNS_USERNAME;
const PASSWORD = process.env.CCTNS_PASSWORD;
const ZONE_ID = process.env.CCTNS_ZONE_ID || "76";
const RANGE_ID = process.env.CCTNS_RANGE_ID || "240";
const DISTRICT_ID = process.env.CCTNS_DISTRICT_ID || "31641";
const PS_ID = process.env.CCTNS_PS_ID || "31641033";

function resolveChromedriverPath() {
  const smBin = path.join(path.dirname(require.resolve("selenium-webdriver")), "bin", "windows", "selenium-manager.exe");
  return JSON.parse(execFileSync(smBin, ["--browser", "chrome", "--skip-driver-in-path", "--output", "json"]).toString()).result.driver_path;
}

function save(driver, name) {
  return driver.takeScreenshot().then(png => {
    fs.writeFileSync(path.resolve(__dirname, "..", "..", `cctns-full-${name}.png`), png, "base64");
    console.log(`Screenshot: cctns-full-${name}.png`);
  }).catch(() => {});
}

async function selectDropdown(driver, id, value) {
  await driver.executeScript(
    `const s = document.getElementById(arguments[0]); if (s) { s.value = arguments[1]; s.dispatchEvent(new Event('change', {bubbles:true})); }`,
    id, value
  );
}

async function waitForDropdownReload(driver, id, prevCount, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const count = await driver.executeScript(`const s = document.getElementById(arguments[0]); return s ? s.options.length : 0;`, id);
    if (count !== prevCount && count > 1) { console.log(`  #${id} reloaded: ${prevCount} → ${count} options`); return; }
    await driver.sleep(500);
  }
  const count = await driver.executeScript(`const s = document.getElementById(arguments[0]); return s ? s.options.length : 0;`, id);
  console.warn(`  #${id} did NOT reload in time (still ${count} options)`);
}

async function main() {
  const driverPath = resolveChromedriverPath();
  const service = new chrome.ServiceBuilder(driverPath);
  const options = new chrome.Options();
  options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1400,900");
  options.addArguments("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

  const driver = await new Builder().forBrowser("chrome").setChromeService(service).setChromeOptions(options).build();

  try {
    // Login
    await driver.get(`${BASE_URL}/CCTNSWEB/Login.aspx`);
    await driver.wait(until.elementLocated(By.id("txtUserName")), 10000);
    await driver.findElement(By.id("txtUserName")).sendKeys(USERNAME);
    await driver.findElement(By.id("txtPassword")).sendKeys(PASSWORD);
    await driver.findElement(By.id("btnLogin")).click();
    await driver.sleep(4000);

    const loginUrl = await driver.getCurrentUrl();
    if (!loginUrl.toLowerCase().includes("home")) { console.error("Login failed!"); return; }
    console.log("Login OK");

    // Navigate to pending investigations
    await driver.get(`${BASE_URL}/CCTNSWEB/FIRPendingInvestigation.aspx`);
    await driver.sleep(3000);
    await save(driver, "0-page");

    // Set dates via JavaScript — bypass MaskedEdit which mangles sendKeys input
    // The MaskedEdit mask is DD/MM/YYYY; setting .value directly works if we
    // also clear the ClientState so the toolkit's validator re-reads the field.
    const d = new Date();
    const todayStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    await driver.executeScript(`
      function setMasked(inputId, csId, value) {
        const el = document.getElementById(inputId);
        if (el) el.value = value;
        const cs = document.getElementById(csId);
        if (cs) cs.value = '';
      }
      setMasked('txtStartDate', 'meeFromDate_ClientState', '01/01/1995');
      setMasked('txtEndDate',   'meeToDate_ClientState',   arguments[0]);
    `, todayStr);
    console.log(`Dates set: 01/01/1995 → ${todayStr}`);

    // Cascade: Zone → Range → District → PS
    console.log(`\nCascade selection:`);
    console.log(`  Zone: ${ZONE_ID}`);

    const rangeCount = await driver.executeScript(`return document.getElementById('ddlrange')?.options?.length || 0`);
    await selectDropdown(driver, "ddlzone", ZONE_ID);
    await waitForDropdownReload(driver, "ddlrange", rangeCount);

    console.log(`  Range: ${RANGE_ID}`);
    const distCount = await driver.executeScript(`return document.getElementById('ddlDistrict')?.options?.length || 0`);
    await selectDropdown(driver, "ddlrange", RANGE_ID);
    await waitForDropdownReload(driver, "ddlDistrict", distCount);

    console.log(`  District: ${DISTRICT_ID}`);
    const psCount = await driver.executeScript(`return document.getElementById('ddlPoliceStation')?.options?.length || 0`);
    await selectDropdown(driver, "ddlDistrict", DISTRICT_ID);
    await waitForDropdownReload(driver, "ddlPoliceStation", psCount);

    console.log(`  PS: ${PS_ID}`);
    await selectDropdown(driver, "ddlPoliceStation", PS_ID);
    await driver.sleep(300);

    // Report type → PS Wise
    await selectDropdown(driver, "ddlReportType", "2");
    await driver.sleep(300);
    await save(driver, "1-filters-set");

    // Current values confirmation
    const vals = await driver.executeScript(`
      return {
        zone: document.getElementById('ddlzone')?.value,
        range: document.getElementById('ddlrange')?.value,
        district: document.getElementById('ddlDistrict')?.value,
        ps: document.getElementById('ddlPoliceStation')?.value,
        reportType: document.getElementById('ddlReportType')?.value,
        fromDate: document.getElementById('txtStartDate')?.value,
        toDate: document.getElementById('txtEndDate')?.value,
      };
    `);
    console.log("\nCurrent form values:", JSON.stringify(vals, null, 2));

    // Submit
    await driver.findElement(By.id("btnSearchFir")).click();
    await driver.sleep(6000);
    await save(driver, "2-results");

    // Dump all tables
    const tables = await driver.executeScript(`
      return Array.from(document.querySelectorAll('table')).map((t, i) => ({
        index: i, id: t.id, className: t.className, rowCount: t.rows.length,
        headers: t.rows[0] ? Array.from(t.rows[0].cells).map(c => c.textContent.replace(/\\s+/g,' ').trim().slice(0,50)) : [],
        rows: Array.from(t.rows).slice(1, 20).map(r => Array.from(r.cells).map(c => c.textContent.replace(/\\s+/g,' ').trim().slice(0,60)))
      }));
    `);
    console.log("\n=== ALL TABLES AFTER SUBMIT ===");
    tables.forEach(t => {
      if (t.rowCount > 1) {
        console.log(`\nTable[${t.index}] id="${t.id}" class="${t.className}" rows=${t.rowCount}`);
        console.log("Headers:", t.headers);
        t.rows.forEach((r, ri) => console.log(`  Row ${ri+1}:`, r));
      }
    });

    // Save full HTML
    const html = await driver.getPageSource();
    fs.writeFileSync(path.resolve(__dirname, "..", "..", "cctns-full-results.html"), html.slice(0, 200000));
    console.log("\nHTML saved to cctns-full-results.html");

  } finally {
    await driver.quit();
  }
}

main().catch(console.error);

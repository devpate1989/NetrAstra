// Click the pending-investigation count cell to reveal the detail list
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
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
    const f = path.resolve(__dirname, "..", "..", `cctns-detail-${name}.png`);
    fs.writeFileSync(f, png, "base64");
    console.log(`Screenshot: cctns-detail-${name}.png`);
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
    if (count !== prevCount && count > 1) { console.log(`  #${id} reloaded → ${count} options`); return; }
    await driver.sleep(500);
  }
  console.warn(`  #${id} did NOT reload`);
}

async function main() {
  const driverPath = resolveChromedriverPath();
  const service = new chrome.ServiceBuilder(driverPath);
  const options = new chrome.Options();
  options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1400,900");
  options.addArguments("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

  const driver = await new Builder().forBrowser("chrome").setChromeService(service).setChromeOptions(options).build();

  try {
    // ── Login ────────────────────────────────────────────────────────────────
    await driver.get(`${BASE_URL}/CCTNSWEB/Login.aspx`);
    await driver.wait(until.elementLocated(By.id("txtUserName")), 10000);
    await driver.findElement(By.id("txtUserName")).sendKeys(USERNAME);
    await driver.findElement(By.id("txtPassword")).sendKeys(PASSWORD);
    await driver.findElement(By.id("btnLogin")).click();
    await driver.sleep(4000);
    if (!(await driver.getCurrentUrl()).toLowerCase().includes("home")) { console.error("Login failed"); return; }
    console.log("Login OK");

    // ── Navigate + Cascade ──────────────────────────────────────────────────
    await driver.get(`${BASE_URL}/CCTNSWEB/FIRPendingInvestigation.aspx`);
    await driver.sleep(3000);

    // Set dates via JS
    const d = new Date();
    const today = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    await driver.executeScript(`
      function sm(iid, cid, v) {
        const el = document.getElementById(iid); if (el) el.value = v;
        const cs = document.getElementById(cid); if (cs) cs.value = '';
      }
      sm('txtStartDate','meeFromDate_ClientState','01/01/1995');
      sm('txtEndDate','meeToDate_ClientState', arguments[0]);
    `, today);
    console.log(`Dates: 01/01/1995 → ${today}`);

    // Cascade
    const rc = await driver.executeScript(`return document.getElementById('ddlrange')?.options?.length || 0`);
    await selectDropdown(driver, "ddlzone", ZONE_ID);
    await waitForDropdownReload(driver, "ddlrange", rc);

    const dc = await driver.executeScript(`return document.getElementById('ddlDistrict')?.options?.length || 0`);
    await selectDropdown(driver, "ddlrange", RANGE_ID);
    await waitForDropdownReload(driver, "ddlDistrict", dc);

    const pc = await driver.executeScript(`return document.getElementById('ddlPoliceStation')?.options?.length || 0`);
    await selectDropdown(driver, "ddlDistrict", DISTRICT_ID);
    await waitForDropdownReload(driver, "ddlPoliceStation", pc);

    await selectDropdown(driver, "ddlPoliceStation", PS_ID);
    await driver.sleep(300);
    await selectDropdown(driver, "ddlReportType", "2");
    await driver.sleep(2000);

    // Submit
    await driver.executeScript(`document.getElementById('btnSearchFir')?.click()`);
    await driver.sleep(6000);
    await save(driver, "0-summary");

    // ── Inspect the summary table cell containing "66" ──────────────────────
    const cellInfo = await driver.executeScript(`
      const table = document.getElementById('gdvdata');
      if (!table) return null;
      const info = [];
      for (let r = 0; r < table.rows.length; r++) {
        const row = table.rows[r];
        for (let c = 0; c < row.cells.length; c++) {
          const cell = row.cells[c];
          const text = cell.textContent.trim();
          const link = cell.querySelector('a');
          info.push({
            row: r, col: c, text,
            hasLink: !!link,
            linkHref: link?.getAttribute('href'),
            linkOnclick: link?.getAttribute('onclick'),
            tagName: cell.tagName,
          });
        }
      }
      return info;
    `);
    console.log("\n=== gdvdata cell inspection ===");
    if (cellInfo) cellInfo.forEach(c => {
      if (c.hasLink || c.text) console.log(`  [r${c.row}c${c.col}] "${c.text}" hasLink=${c.hasLink} href="${c.linkHref}" onclick="${c.linkOnclick}"`);
    });

    // ── Try clicking the "66" / pending-investigation cell ──────────────────
    const clicked = await driver.executeScript(`
      const table = document.getElementById('gdvdata');
      if (!table) return {ok: false, reason: 'no table'};
      // Find the cell with the pending count (col 5 in PS-wise: "Pending Investigation")
      const dataRow = table.rows[1]; // first data row (skip header)
      if (!dataRow) return {ok: false, reason: 'no data row'};
      const pendingCell = dataRow.cells[5]; // col 5
      if (!pendingCell) return {ok: false, reason: 'no pending cell'};
      const link = pendingCell.querySelector('a');
      if (link) { link.click(); return {ok: true, via: 'link', text: link.textContent.trim()}; }
      // Try the cell itself if it has an onclick
      if (pendingCell.onclick || pendingCell.getAttribute('onclick')) {
        pendingCell.click();
        return {ok: true, via: 'cell-onclick', text: pendingCell.textContent.trim()};
      }
      return {ok: false, reason: 'no clickable element in cell', text: pendingCell.textContent.trim()};
    `);
    console.log("\nClick attempt:", JSON.stringify(clicked));

    await driver.sleep(4000);
    await save(driver, "1-after-click");

    // Check URL change
    const newUrl = await driver.getCurrentUrl();
    console.log("URL after click:", newUrl);

    // Check for any modal/popup
    const modalInfo = await driver.executeScript(`
      const modals = document.querySelectorAll('[class*="modal"],[id*="modal"],[id*="Modal"],[id*="popup"],[id*="Popup"],[id*="Panel"],[id*="panel"]');
      return Array.from(modals).filter(m => {
        const s = window.getComputedStyle(m);
        return s.display !== 'none' && s.visibility !== 'hidden';
      }).map(m => ({
        id: m.id, class: m.className, tag: m.tagName,
        text: m.textContent.trim().slice(0, 200)
      }));
    `);
    console.log("\nVisible modals/popups:", JSON.stringify(modalInfo, null, 2));

    // Dump all tables visible after click
    const tables = await driver.executeScript(`
      return Array.from(document.querySelectorAll('table')).map((t, i) => ({
        index: i, id: t.id, className: t.className,
        visible: window.getComputedStyle(t).display !== 'none',
        rowCount: t.rows.length,
        headers: t.rows[0] ? Array.from(t.rows[0].cells).map(c => c.textContent.replace(/\\s+/g,' ').trim().slice(0,40)) : [],
        rows: Array.from(t.rows).slice(1, 6).map(r => Array.from(r.cells).map(c => c.textContent.replace(/\\s+/g,' ').trim().slice(0,60)))
      })).filter(t => t.rowCount > 1);
    `);
    console.log("\n=== All tables after click ===");
    tables.forEach(t => {
      console.log(`\nTable[${t.index}] id="${t.id}" class="${t.className}" rows=${t.rowCount} visible=${t.visible}`);
      console.log("Headers:", t.headers);
      t.rows.forEach((r, ri) => console.log(`  Row ${ri+1}:`, r));
    });

    // Also look for iframes (popup might be in an iframe)
    const frames = await driver.executeScript(`
      return Array.from(document.querySelectorAll('iframe')).map(f => ({
        id: f.id, src: f.src, width: f.width, height: f.height,
        visible: window.getComputedStyle(f).display !== 'none'
      }));
    `);
    console.log("\nIframes:", JSON.stringify(frames));

    // Save full HTML to inspect
    const html = await driver.getPageSource();
    fs.writeFileSync(path.resolve(__dirname, "..", "..", "cctns-detail.html"), html.slice(0, 300000));
    console.log("HTML saved: cctns-detail.html");

    // ── If popup appeared: try to dump its table content ────────────────────
    const popupData = await driver.executeScript(`
      // Try the btnShowModalPopup popup
      const pop = document.getElementById('gvPSWiseData') ||
                  document.querySelector('[id*="popup"] table') ||
                  document.querySelector('[id*="Popup"] table') ||
                  document.querySelector('[id*="modal"] table') ||
                  document.querySelector('[id*="Modal"] table');
      if (!pop) return null;
      const rows = [];
      for (let i = 0; i < Math.min(pop.rows.length, 10); i++) {
        rows.push(Array.from(pop.rows[i].cells).map(c => c.textContent.replace(/\\s+/g,' ').trim().slice(0,60)));
      }
      return { id: pop.id, rows };
    `);
    if (popupData) {
      console.log("\n=== Popup table data ===");
      console.log(JSON.stringify(popupData, null, 2));
    }

  } finally {
    await driver.quit();
  }
}

main().catch(console.error);

// Focused exploration of PG portal complaint listing pages.
// Run: node scripts/explore-pg-complaints.js
const path = require("path");
const fs = require("fs");

function loadEnv() {
  const raw = fs.readFileSync(path.resolve(__dirname, "..", "..", ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    let k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const { Builder, By } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const { execFileSync } = require("child_process");

const PG_BASE = "https://ts.uppolice.gov.in";
const OUT = path.resolve(__dirname, "..", "..");

function resolveChromedriverPath() {
  const sm = path.join(path.dirname(require.resolve("selenium-webdriver")), "bin", "windows", "selenium-manager.exe");
  return JSON.parse(execFileSync(sm, ["--browser", "chrome", "--skip-driver-in-path", "--output", "json"]).toString()).result.driver_path;
}

function save(name, content, ext = "png") {
  const file = path.join(OUT, `explore-${name}.${ext}`);
  fs.writeFileSync(file, content, ext === "html" ? "utf8" : "base64");
  console.log(`Saved: explore-${name}.${ext}`);
}

async function dumpTable(driver, sel) {
  return driver.executeScript(`
    const t = document.querySelector(arguments[0]);
    if (!t) return { found: false };
    const headers = Array.from(t.rows[0]?.cells || []).map(c => c.textContent.trim());
    const rows = [];
    for (let i = 1; i < Math.min(t.rows.length, 6); i++) {
      const cells = Array.from(t.rows[i].cells).map(c => c.textContent.trim().slice(0,60));
      rows.push(cells);
    }
    return { found: true, totalRows: t.rows.length - 1, id: t.id, headers, rows };
  `, sel);
}

async function main() {
  const opts = new chrome.Options();
  opts.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,900");
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeService(new chrome.ServiceBuilder(resolveChromedriverPath()))
    .setChromeOptions(opts)
    .build();

  try {
    // ── LOGIN ─────────────────────────────────────────────────────────
    console.log("\n[1/6] Logging in...");
    await driver.get(`${PG_BASE}/PublicGrievance/Login.aspx`);
    await driver.sleep(2000);
    await driver.findElement({ css: "#txtCug" }).sendKeys(process.env.CCTNS_USERNAME);
    await driver.findElement({ css: "#txtPassword" }).sendKeys(process.env.CCTNS_PASSWORD);
    await driver.findElement({ css: "#btnSubmit" }).click();
    await driver.sleep(3500);
    console.log("Logged in. URL:", await driver.getCurrentUrl());

    // ── DisplayAllComplaints.aspx ─────────────────────────────────────
    console.log("\n[2/6] DisplayAllComplaints.aspx...");
    await driver.get(`${PG_BASE}/PublicGrievance/DisplayAllComplaints.aspx`);
    await driver.sleep(3000);
    save("pg-displayall", await driver.takeScreenshot());
    save("pg-displayall", (await driver.getPageSource()).slice(0, 80000), "html");

    // Find all tables + forms
    const displayAllInfo = await driver.executeScript(`
      const tables = Array.from(document.querySelectorAll("table")).map((t, i) => ({
        index: i, id: t.id, className: t.className.slice(0,30), rows: t.rows.length,
        h: t.rows[0] ? Array.from(t.rows[0].cells).map(c => c.textContent.trim().slice(0,40)).join(" | ") : "",
        r1: t.rows[1] ? Array.from(t.rows[1].cells).map(c => c.textContent.trim().slice(0,40)).join(" | ") : "",
        r2: t.rows[2] ? Array.from(t.rows[2].cells).map(c => c.textContent.trim().slice(0,40)).join(" | ") : "",
      }));
      const forms = Array.from(document.querySelectorAll("form")).map(f => ({
        id: f.id, action: f.action, method: f.method,
        inputs: Array.from(f.querySelectorAll("input[type!='hidden'],select")).map(el => ({
          id: el.id, name: el.name, type: el.type, placeholder: el.placeholder
        }))
      }));
      const links = Array.from(document.querySelectorAll("a")).slice(0, 20).map(a => ({
        text: a.textContent.trim().slice(0,50), href: a.href, onclick: a.getAttribute("onclick")
      })).filter(a => a.text || a.href);
      return { tables, forms, links };
    `);
    console.log("DisplayAll Tables:", JSON.stringify(displayAllInfo.tables, null, 2));
    console.log("DisplayAll Forms:", JSON.stringify(displayAllInfo.forms, null, 2));
    console.log("DisplayAll Links:", JSON.stringify(displayAllInfo.links, null, 2));

    // ── PS_DASHBOARD with JS-bypass search ───────────────────────────
    console.log("\n[3/6] PS_DASHBOARD with validation bypass...");
    await driver.get(`${PG_BASE}/PublicGrievance/PS_DASHBOARD`);
    await driver.sleep(2500);

    // Disable JS validation, set wide date range, fire postback directly
    const searchResult = await driver.executeScript(`
      // Override validation to allow any date range
      window.ValidateDailyReportDateRange = function() { return true; };

      // Set dates
      var fromEl = document.querySelector("#ContentPlaceHolder1_txtFromDate");
      var toEl   = document.querySelector("#ContentPlaceHolder1_txtEndDate");

      // Find the actual hidden state fields used by AjaxToolkit MaskedEdit
      var fromState = document.querySelector("input[id*='meeFromDate_ClientState']") ||
                      document.querySelector("input[id*='FromDate_ClientState']");
      var toState   = document.querySelector("input[id*='meeEndDate_ClientState']") ||
                      document.querySelector("input[id*='EndDate_ClientState']");

      if (fromEl) { fromEl.value = "01/01/2023"; }
      if (toEl)   { toEl.value   = "01/07/2026"; }

      // List all hidden inputs for debugging
      var hidden = Array.from(document.querySelectorAll("input[type='hidden']")).map(h => ({ id: h.id, name: h.name, value: h.value.slice(0,40) }));
      return { fromState: fromState ? fromState.id : null, toState: toState ? toState.id : null, hidden };
    `);
    console.log("Form state fields:", JSON.stringify(searchResult, null, 2));

    // Click search with bypass
    await driver.executeScript(`
      window.ValidateDailyReportDateRange = function() { return true; };
      document.querySelector("#ContentPlaceHolder1_btnSearch").click();
    `);
    await driver.sleep(500);
    // Dismiss any alert
    try {
      const a = await driver.switchTo().alert();
      console.log("Dismissed alert:", await a.getText());
      await a.accept();
      await driver.sleep(500);
    } catch {}
    await driver.sleep(4000);

    save("pg-bypassed", await driver.takeScreenshot());
    const bypassedTable = await dumpTable(driver, "#ContentPlaceHolder1_gdvComplaintDetails");
    console.log("Table after bypass:", JSON.stringify(bypassedTable, null, 2));

    // ── Try __doPostBack directly ─────────────────────────────────────
    console.log("\n[4/6] Trying __doPostBack with date PostBack...");
    await driver.get(`${PG_BASE}/PublicGrievance/PS_DASHBOARD`);
    await driver.sleep(2500);

    // Use the CalendarBehavior's internal Beh object to set date, then trigger postback
    await driver.executeScript(`
      window.ValidateDailyReportDateRange = function() { return true; };
      var btn = document.querySelector("input[id*='btnSearch']");
      var fromEl = document.querySelector("#ContentPlaceHolder1_txtFromDate");
      var toEl   = document.querySelector("#ContentPlaceHolder1_txtEndDate");
      if (fromEl) { fromEl.value = "01/01/2023"; fromEl.dispatchEvent(new Event("change")); }
      if (toEl)   { toEl.value   = "01/07/2026"; toEl.dispatchEvent(new Event("change")); }
    `);
    await driver.sleep(300);
    // Fire the form submit directly via __doPostBack
    await driver.executeScript(`__doPostBack("ctl00$ContentPlaceHolder1$btnSearch", "")`);
    await driver.sleep(4500);

    try { const a = await driver.switchTo().alert(); console.log("Alert:", await a.getText()); await a.accept(); await driver.sleep(500); } catch {}
    save("pg-postback", await driver.takeScreenshot());
    const postbackTable = await dumpTable(driver, "#ContentPlaceHolder1_gdvComplaintDetails");
    console.log("Table after postback:", JSON.stringify(postbackTable, null, 2));

    // ── AllReports.aspx ──────────────────────────────────────────────
    console.log("\n[5/6] AllReports.aspx...");
    await driver.get(`${PG_BASE}/PublicGrievance/AllReports.aspx`);
    await driver.sleep(3000);
    save("pg-allreports", await driver.takeScreenshot());
    const allReportsInfo = await driver.executeScript(`
      const tables = Array.from(document.querySelectorAll("table")).map((t,i) => ({
        index: i, id: t.id, rows: t.rows.length,
        h: t.rows[0] ? Array.from(t.rows[0].cells).map(c => c.textContent.trim().slice(0,40)).join(" | ") : "",
        r1: t.rows[1] ? Array.from(t.rows[1].cells).map(c => c.textContent.trim().slice(0,40)).join(" | ") : "",
      }));
      const inputs = Array.from(document.querySelectorAll("input,select,button")).map(el => ({
        id: el.id, name: el.name, type: el.type
      }));
      return { tables, inputs };
    `);
    console.log("AllReports:", JSON.stringify(allReportsInfo, null, 2));

    // ── PendingAboveTenDays.aspx ──────────────────────────────────────
    console.log("\n[6/6] PendingAboveTenDays.aspx (linked from dashboard >10 days count)...");
    await driver.get(`${PG_BASE}/PublicGrievance/PendingAboveTenDays.aspx`);
    await driver.sleep(3000);
    save("pg-above10", await driver.takeScreenshot());
    const above10Info = await driver.executeScript(`
      const tables = Array.from(document.querySelectorAll("table")).map((t,i) => ({
        index: i, id: t.id, rows: t.rows.length,
        h: t.rows[0] ? Array.from(t.rows[0].cells).map(c => c.textContent.trim().slice(0,40)).join(" | ") : "",
        r1: t.rows[1] ? Array.from(t.rows[1].cells).map(c => c.textContent.trim().slice(0,40)).join(" | ") : "",
        r2: t.rows[2] ? Array.from(t.rows[2].cells).map(c => c.textContent.trim().slice(0,40)).join(" | ") : "",
      }));
      return { url: location.href, title: document.title, tables };
    `);
    console.log("Above10Days:", JSON.stringify(above10Info, null, 2));

    console.log("\n\nDone. Check explore-pg-*.png and explore-pg-*.html files.");

  } finally {
    await driver.quit();
  }
}

main().catch(console.error);

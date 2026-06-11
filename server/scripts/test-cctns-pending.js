// After CCTNS login, navigate to FIRPendingInvestigation.aspx,
// set date range 01/01/1995 to today, submit, and dump the results table.
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

function resolveChromedriverPath() {
  const smBin = path.join(path.dirname(require.resolve("selenium-webdriver")), "bin", "windows", "selenium-manager.exe");
  return JSON.parse(execFileSync(smBin, ["--browser", "chrome", "--skip-driver-in-path", "--output", "json"]).toString()).result.driver_path;
}

function saveScreenshot(driver, name) {
  return driver.takeScreenshot().then(png => {
    const file = path.resolve(__dirname, "..", "..", `cctns-${name}.png`);
    fs.writeFileSync(file, png, "base64");
    console.log("Screenshot:", `cctns-${name}.png`);
  }).catch(() => {});
}

async function main() {
  const driverPath = resolveChromedriverPath();
  const service = new chrome.ServiceBuilder(driverPath);
  const options = new chrome.Options();
  options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1400,900");
  options.addArguments("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

  const driver = await new Builder().forBrowser("chrome").setChromeService(service).setChromeOptions(options).build();

  try {
    // ── Login ──────────────────────────────────────────────
    await driver.get(`${BASE_URL}/CCTNSWEB/Login.aspx`);
    await driver.wait(until.elementLocated(By.id("txtUserName")), 10000);
    await driver.findElement(By.id("txtUserName")).sendKeys(USERNAME);
    await driver.findElement(By.id("txtPassword")).sendKeys(PASSWORD);
    await driver.findElement(By.id("btnLogin")).click();
    await driver.sleep(3000);

    const afterLogin = await driver.getCurrentUrl();
    console.log("After login URL:", afterLogin);
    if (afterLogin.toLowerCase().includes("login")) {
      console.error("Login failed!"); return;
    }
    console.log("Login successful!");

    // ── Navigate to Pending Investigation page ─────────────
    const pendingUrl = `${BASE_URL}/CCTNSWEB/FIRPendingInvestigation.aspx`;
    console.log("\nNavigating to:", pendingUrl);
    await driver.get(pendingUrl);
    await driver.sleep(3000);

    console.log("URL:", await driver.getCurrentUrl());
    console.log("Title:", await driver.getTitle());
    await saveScreenshot(driver, "4-pending-inv-page");

    // Dump all form fields
    const forms = await driver.executeScript(`
      return Array.from(document.querySelectorAll('form')).map((f, i) => ({
        index: i,
        id: f.id,
        fields: Array.from(f.querySelectorAll('input,select,textarea')).map(el => ({
          tag: el.tagName,
          type: el.type || '',
          id: el.id,
          name: el.name,
          value: el.type === 'password' ? '***' : (el.value || ''),
          placeholder: el.placeholder || '',
          options: el.tagName === 'SELECT' ? Array.from(el.options).slice(0,10).map(o => ({ value: o.value, text: o.text })) : undefined,
        }))
      }));
    `);
    console.log("\nForm fields on pending investigation page:");
    console.log(JSON.stringify(forms, null, 2));

    // Dump labels too to understand field meanings
    const labels = await driver.executeScript(`
      return Array.from(document.querySelectorAll('label,th,td.label,td[class*="label"]')).slice(0,50)
        .map(el => ({ tag: el.tagName, htmlFor: el.htmlFor || '', text: el.textContent.trim().slice(0,60) }))
        .filter(l => l.text);
    `);
    console.log("\nLabels on page:");
    console.log(JSON.stringify(labels, null, 2));

    // ── Look for date fields ────────────────────────────────
    const dateFields = await driver.executeScript(`
      const fields = Array.from(document.querySelectorAll('input[type="text"], input[type="date"]'));
      return fields.filter(f => {
        const id = (f.id||'').toLowerCase();
        const name = (f.name||'').toLowerCase();
        const ph = (f.placeholder||'').toLowerCase();
        return id.includes('date') || id.includes('from') || id.includes('to') || id.includes('dt')
          || name.includes('date') || name.includes('from') || name.includes('to')
          || ph.includes('date') || ph.includes('dd/mm');
      }).map(f => ({ id: f.id, name: f.name, value: f.value, placeholder: f.placeholder }));
    `);
    console.log("\nDate-related fields:");
    console.log(JSON.stringify(dateFields, null, 2));

    // Dump full page HTML
    const html = await driver.getPageSource();
    fs.writeFileSync(path.resolve(__dirname, "..", "..", "cctns-pending-inv.html"), html.slice(0, 150000));
    console.log("HTML saved (first 150k chars)");

    // ── Try to set date range ──────────────────────────────
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
    const fromStr = "01/01/1995";

    console.log(`\nSetting date range: ${fromStr} to ${todayStr}`);

    // Try common date field IDs
    const fromIds = ["txtFromDate", "txtfromdate", "FromDate", "dtFromDate", "fromDate", "from_date", "txtFrom"];
    const toIds = ["txtToDate", "txttodate", "ToDate", "dtToDate", "toDate", "to_date", "txtTo"];

    let fromSet = false, toSet = false;
    for (const id of fromIds) {
      try {
        const el = await driver.findElement(By.id(id));
        await el.clear(); await el.sendKeys(fromStr); fromSet = true;
        console.log(`Set 'from' in #${id}`);
        break;
      } catch {}
    }
    for (const id of toIds) {
      try {
        const el = await driver.findElement(By.id(id));
        await el.clear(); await el.sendKeys(todayStr); toSet = true;
        console.log(`Set 'to' in #${id}`);
        break;
      } catch {}
    }

    if (!fromSet || !toSet) {
      // Try by ASP.NET ends-with
      const allInputs = await driver.executeScript(`
        return Array.from(document.querySelectorAll('input[type="text"]')).map(el => ({
          id: el.id, name: el.name, placeholder: el.placeholder, value: el.value
        }));
      `);
      console.log("All text inputs:", JSON.stringify(allInputs));
    }

    // Look for submit/search button
    const submitIds = ["btnSearch", "btnShow", "btnSubmit", "btnView", "btnGet", "btnGo", "btnOk"];
    let submitted = false;
    for (const id of submitIds) {
      try {
        const el = await driver.findElement(By.id(id));
        console.log(`Clicking submit: #${id}`);
        await el.click();
        submitted = true;
        break;
      } catch {}
    }
    if (!submitted) {
      // Try input[type=submit] or button
      try {
        const el = await driver.findElement(By.css("input[type='submit']:not([value='Reset']), button[type='submit']"));
        const val = await el.getAttribute("value") || await el.getText();
        console.log(`Clicking submit: "${val}"`);
        await el.click();
        submitted = true;
      } catch {}
    }

    if (submitted) {
      await driver.sleep(4000);
      console.log("URL after submit:", await driver.getCurrentUrl());
      await saveScreenshot(driver, "5-results");

      // Save results HTML
      const resultsHtml = await driver.getPageSource();
      fs.writeFileSync(path.resolve(__dirname, "..", "..", "cctns-results.html"), resultsHtml.slice(0, 200000));
      console.log("Results HTML saved (first 200k chars)");

      // Dump tables
      const tables = await driver.executeScript(`
        return Array.from(document.querySelectorAll('table')).map((t, i) => ({
          index: i,
          id: t.id,
          className: t.className,
          rowCount: t.rows.length,
          headers: t.rows[0] ? Array.from(t.rows[0].cells).map(c => c.textContent.replace(/\\s+/g,' ').trim().slice(0,50)) : [],
          row1: t.rows[1] ? Array.from(t.rows[1].cells).map(c => c.textContent.replace(/\\s+/g,' ').trim().slice(0,60)) : [],
          row2: t.rows[2] ? Array.from(t.rows[2].cells).map(c => c.textContent.replace(/\\s+/g,' ').trim().slice(0,60)) : [],
        }));
      `);
      console.log("\nResult tables:");
      console.log(JSON.stringify(tables, null, 2));
    } else {
      console.log("Could not find submit button");
      // Dump buttons
      const buttons = await driver.executeScript(`
        return Array.from(document.querySelectorAll('input[type="submit"],input[type="button"],button')).map(el => ({
          id: el.id, name: el.name, value: el.value || el.textContent.trim(), type: el.type
        }));
      `);
      console.log("Buttons:", JSON.stringify(buttons));
    }

  } finally {
    await driver.quit();
  }
}

main().catch(console.error);

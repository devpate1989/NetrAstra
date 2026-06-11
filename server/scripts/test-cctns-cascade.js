// Discover zone/range/district/PS dropdown values for Lucknow → Ayodhya → Kumarganj
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

const { Builder, By, until, Select } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

const BASE_URL = new URL(process.env.CCTNS_PORTAL_URL || "https://cctnsup.gov.in").origin;
const USERNAME = process.env.CCTNS_USERNAME;
const PASSWORD = process.env.CCTNS_PASSWORD;

function resolveChromedriverPath() {
  const smBin = path.join(path.dirname(require.resolve("selenium-webdriver")), "bin", "windows", "selenium-manager.exe");
  return JSON.parse(execFileSync(smBin, ["--browser", "chrome", "--skip-driver-in-path", "--output", "json"]).toString()).result.driver_path;
}

function save(driver, name) {
  return driver.takeScreenshot().then(png => {
    fs.writeFileSync(path.resolve(__dirname, "..", "..", `cctns-casc-${name}.png`), png, "base64");
    console.log(`Screenshot: cctns-casc-${name}.png`);
  }).catch(() => {});
}

async function getOptions(driver, selectId) {
  return driver.executeScript(`
    const sel = document.getElementById(arguments[0]);
    if (!sel) return [];
    return Array.from(sel.options).map(o => ({ value: o.value, text: o.text.trim() }));
  `, selectId);
}

async function waitForOptionsChange(driver, selectId, prevCount, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const opts = await getOptions(driver, selectId);
    if (opts.length !== prevCount && opts.length > 1) return opts;
    await driver.sleep(500);
  }
  return await getOptions(driver, selectId);
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

    const afterLogin = await driver.getCurrentUrl();
    if (!afterLogin.toLowerCase().includes("home")) {
      console.error("Login failed! URL:", afterLogin); return;
    }
    console.log("Login OK →", afterLogin);

    // Navigate to pending investigation page
    await driver.get(`${BASE_URL}/CCTNSWEB/FIRPendingInvestigation.aspx`);
    await driver.sleep(3000);
    await save(driver, "0-loaded");

    // ── Step 1: Dump all Zone options ────────────────────────────────────
    const allZones = await getOptions(driver, "ddlzone");
    console.log("\n=== ALL ZONE OPTIONS ===");
    allZones.forEach(o => console.log(`  value="${o.value}" text="${o.text}"`));

    // Find Lucknow zone — exact match "लखनऊ" (not "पुलिस आयुक्त लखनऊ शहर")
    const lucknowZone = allZones.find(o => o.text.trim() === "लखनऊ")
      || allZones.find(o => o.text.includes("लखनऊ") && !o.text.includes("आयुक्त") && !o.text.includes("रेलवे"))
      || allZones.find(o => o.text.toLowerCase() === "lucknow");
    if (!lucknowZone) {
      console.error("Lucknow zone not found in:", allZones.map(o => o.text));
      return;
    }
    console.log("\nLucknow zone:", lucknowZone);

    // ── Step 2: Select Lucknow zone → wait for range ─────────────────────
    const prevRangeCount = (await getOptions(driver, "ddlrange")).length;
    await driver.executeScript(
      `const sel = document.getElementById('ddlzone'); sel.value = arguments[0]; sel.dispatchEvent(new Event('change', {bubbles:true}));`,
      lucknowZone.value
    );
    await driver.sleep(2000);
    await save(driver, "1-zone-selected");

    const rangeOpts = await waitForOptionsChange(driver, "ddlrange", prevRangeCount, 12000);
    console.log("\n=== RANGE OPTIONS (after selecting Lucknow zone) ===");
    rangeOpts.forEach(o => console.log(`  value="${o.value}" text="${o.text}"`));

    // Find Ayodhya range (अयोध्या or Faizabad/फ़ैज़ाबाद)
    const ayodhyaRange = rangeOpts.find(o =>
      o.text.includes("अयोध्या") || o.text.includes("फैजाबाद") || o.text.includes("फ़ैज़ाबाद") ||
      o.text.toLowerCase().includes("ayodhya") || o.text.toLowerCase().includes("faizabad")
    );
    if (!ayodhyaRange) {
      console.error("Ayodhya/Faizabad range not found. Available:", rangeOpts.map(o => o.text));
      // Don't return — keep going to see district options
    } else {
      console.log("\nAyodhya range:", ayodhyaRange);

      // ── Step 3: Select Ayodhya range → wait for district ───────────────
      const prevDistCount = (await getOptions(driver, "ddlDistrict")).length;
      await driver.executeScript(
        `const sel = document.getElementById('ddlrange'); sel.value = arguments[0]; sel.dispatchEvent(new Event('change', {bubbles:true}));`,
        ayodhyaRange.value
      );
      await driver.sleep(2000);
      await save(driver, "2-range-selected");

      const distOpts = await waitForOptionsChange(driver, "ddlDistrict", prevDistCount, 12000);
      console.log("\n=== DISTRICT OPTIONS (after selecting Ayodhya range) ===");
      distOpts.forEach(o => console.log(`  value="${o.value}" text="${o.text}"`));

      // Find Ayodhya district
      const ayodhyaDist = distOpts.find(o =>
        o.text.includes("अयोध्या") || o.text.toLowerCase().includes("ayodhya")
      );
      if (!ayodhyaDist) {
        console.error("Ayodhya district not found. Available:", distOpts.map(o => o.text));
      } else {
        console.log("\nAyodhya district:", ayodhyaDist);

        // ── Step 4: Select Ayodhya district → wait for PS ────────────────
        const prevPsCount = (await getOptions(driver, "ddlPoliceStation")).length;
        await driver.executeScript(
          `const sel = document.getElementById('ddlDistrict'); sel.value = arguments[0]; sel.dispatchEvent(new Event('change', {bubbles:true}));`,
          ayodhyaDist.value
        );
        await driver.sleep(2000);
        await save(driver, "3-district-selected");

        const psOpts = await waitForOptionsChange(driver, "ddlPoliceStation", prevPsCount, 12000);
        console.log("\n=== POLICE STATION OPTIONS (after selecting Ayodhya district) ===");
        psOpts.forEach(o => console.log(`  value="${o.value}" text="${o.text}"`));

        // Find Kumarganj
        const kumarganjPs = psOpts.find(o =>
          o.text.includes("कुमारगंज") || o.text.includes("kumarganj") ||
          o.text.toLowerCase().includes("kumarganj")
        );
        if (!kumarganjPs) {
          console.error("Kumarganj PS not found. Available:", psOpts.map(o => o.text));
        } else {
          console.log("\nKumarganj PS:", kumarganjPs);
        }

        // ── Step 5: Set PS Wise report, select Kumarganj, submit ─────────
        if (kumarganjPs) {
          // Set report type to PS Wise
          await driver.executeScript(
            `const sel = document.getElementById('ddlReportType'); sel.value = '2'; sel.dispatchEvent(new Event('change', {bubbles:true}));`
          );

          // Select Kumarganj PS
          await driver.executeScript(
            `const sel = document.getElementById('ddlPoliceStation'); sel.value = arguments[0]; sel.dispatchEvent(new Event('change', {bubbles:true}));`,
            kumarganjPs.value
          );
          await driver.sleep(1000);

          // Set dates
          await driver.executeScript(`
            const from = document.getElementById('txtStartDate');
            from.value = '01/01/1995';
            from.dispatchEvent(new Event('change'));
            const to = document.getElementById('txtEndDate');
            to.value = arguments[0];
            to.dispatchEvent(new Event('change'));
          `, new Date().toLocaleDateString('en-GB').replace(/\//g, '/'));

          await driver.sleep(500);

          // Click search
          await driver.findElement(By.id("btnSearchFir")).click();
          await driver.sleep(5000);
          await save(driver, "4-results-kumarganj");

          // Dump result table
          const results = await driver.executeScript(`
            const table = document.getElementById('gvDistrict');
            if (!table) return { error: 'gvDistrict not found' };
            const rows = [];
            for (let i = 0; i < table.rows.length; i++) {
              rows.push(Array.from(table.rows[i].cells).map(c => c.textContent.replace(/\\s+/g,' ').trim()));
            }
            return rows;
          `);
          console.log("\n=== RESULT TABLE (Kumarganj PS) ===");
          console.log(JSON.stringify(results, null, 2));

          // Summary of codes for the service config
          console.log("\n=== SUMMARY OF VALUES TO CONFIGURE ===");
          console.log(JSON.stringify({
            zoneId: lucknowZone.value,
            zoneName: lucknowZone.text,
            rangeId: ayodhyaRange.value,
            rangeName: ayodhyaRange.text,
            districtId: ayodhyaDist.value,
            districtName: ayodhyaDist.text,
            psId: kumarganjPs.value,
            psName: kumarganjPs.text,
          }, null, 2));
        }
      }
    }
  } finally {
    await driver.quit();
  }
}

main().catch(console.error);

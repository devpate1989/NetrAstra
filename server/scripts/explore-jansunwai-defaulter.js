// One-off exploration script: log into Jan Sunwai portal and inspect the
// defaulter-reference report + home dashboard summary table structure, so
// we know exactly what's scrapeable before building the admin dashboard
// "Defaulter in 3 days" + "sandarbh-wise pendency" features.
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
    let key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk").default;

const BASE_URL = process.env.JANSUNWAI_PORTAL_URL || "https://jansunwai.up.nic.in";
const USERNAME = process.env.JANSUNWAI_USERNAME;
const PASSWORD = process.env.JANSUNWAI_PASSWORD;
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;

function resolveChromedriverPath() {
  const smBin = path.join(
    path.dirname(require.resolve("selenium-webdriver")),
    "bin", "windows", "selenium-manager.exe"
  );
  const raw = execFileSync(smBin, ["--browser", "chrome", "--skip-driver-in-path", "--output", "json"]).toString();
  return JSON.parse(raw).result.driver_path;
}

function detectMediaType(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  return "image/webp";
}

async function solveCaptcha(imgBuffer) {
  if (!CLAUDE_KEY) return null;
  const client = new Anthropic({ apiKey: CLAUDE_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 64,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: detectMediaType(imgBuffer), data: imgBuffer.toString("base64") } },
        { type: "text", text: "This is a CAPTCHA. Reply with ONLY the exact characters shown. No spaces, no explanation." },
      ],
    }],
  });
  const raw = response.content[0].type === "text" ? response.content[0].text.trim().replace(/[^a-zA-Z0-9]/g, "") : "";
  return raw.length > 0 ? raw : null;
}

async function fetchCaptchaBuffer(driver) {
  const cookies = await driver.manage().getCookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const resp = await axios.get(`${BASE_URL}/Captcha.jpg`, {
    responseType: "arraybuffer",
    headers: { Cookie: cookieHeader },
  });
  return Buffer.from(resp.data);
}

async function dumpPage(driver, label) {
  const png = await driver.takeScreenshot();
  fs.writeFileSync(path.resolve(__dirname, "..", "..", `explore-${label}.png`), png, "base64");
  const html = await driver.getPageSource();
  fs.writeFileSync(path.resolve(__dirname, "..", "..", `explore-${label}.html`), html);
  console.log(`Saved explore-${label}.png / .html (${html.length} chars)`);
}

async function main() {
  const driverPath = resolveChromedriverPath();
  const service = new chrome.ServiceBuilder(driverPath);
  const options = new chrome.Options();
  options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,900");

  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeService(service)
    .setChromeOptions(options)
    .build();

  try {
    const maxAttempts = 3;
    let loggedIn = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await driver.get(`${BASE_URL}/login`);
      await driver.wait(until.elementLocated(By.css("input[name='username']")), 15000);
      await driver.findElement(By.css("input[name='username']")).sendKeys(USERNAME);
      await driver.findElement(By.css("input[name='password']")).sendKeys(PASSWORD);
      const buf = await fetchCaptchaBuffer(driver);
      const answer = await solveCaptcha(buf);
      if (!answer) { console.log(`Attempt ${attempt}: could not solve CAPTCHA`); continue; }
      await driver.findElement(By.css("input[name='captcha']")).sendKeys(answer);
      await driver.findElement(By.css("button[type='submit']")).click();
      await driver.sleep(2500);
      const url = await driver.getCurrentUrl();
      if (!url.includes("/login")) { console.log("Logged in! URL:", url); loggedIn = true; break; }
      console.log(`Attempt ${attempt} failed — still at: ${url}`);
    }
    if (!loggedIn) { console.error("Login failed after all attempts"); return; }

    // ── Home dashboard: inspect the "समस्त सन्दर्भों का विवरण" table ──
    await driver.get(`${BASE_URL}/igrs/home`);
    await driver.sleep(2500);
    await dumpPage(driver, "home");

    const homeTables = await driver.executeScript(`
      return Array.from(document.querySelectorAll('table')).map((t, i) => ({
        index: i,
        id: t.id,
        className: t.className,
        rowCount: t.rows.length,
        headerRow: t.rows[0] ? Array.from(t.rows[0].cells).map(c => c.textContent.trim()).join(' | ') : '',
        firstDataRow: t.rows[1] ? Array.from(t.rows[1].cells).map(c => c.textContent.trim()).join(' | ') : '',
        secondDataRow: t.rows[2] ? Array.from(t.rows[2].cells).map(c => c.textContent.trim()).join(' | ') : '',
      }));
    `);
    console.log("\n=== Tables on /igrs/home ===");
    console.log(JSON.stringify(homeTables, null, 2));

    // Look for any onclick/href on the डिफाल्टर column cells/links (drill-down?)
    const defaulterCellLinks = await driver.executeScript(`
      const all = Array.from(document.querySelectorAll('a, td[onclick], span[onclick]'));
      return all
        .filter(el => el.closest('table'))
        .map(el => ({ tag: el.tagName, href: el.getAttribute('href'), onclick: el.getAttribute('onclick'), text: (el.textContent||'').trim().slice(0,40) }))
        .filter(x => x.href || x.onclick);
    `);
    console.log("\n=== Clickable cells inside tables on /igrs/home ===");
    console.log(JSON.stringify(defaulterCellLinks.slice(0, 60), null, 2));

    // ── Sidebar: find the exact defaulter-report links + hrefs ──
    const defaulterNavLinks = await driver.executeScript(`
      const all = Array.from(document.querySelectorAll('a'));
      return all
        .filter(el => (el.textContent||'').includes('डिफाल्टर') || (el.textContent||'').includes('दिवस'))
        .map(el => ({ href: el.getAttribute('href'), text: (el.textContent||'').trim() }));
    `);
    console.log("\n=== Nav links mentioning डिफाल्टर/दिवस ===");
    console.log(JSON.stringify(defaulterNavLinks, null, 2));

    // ── Visit the defaulter/pending report page directly ──
    await driver.get(`${BASE_URL}/igrs/defaulterRefrenceReports`);
    await driver.sleep(2500);
    await dumpPage(driver, "defaulter-report");

    const defaulterPageTitle = await driver.getTitle();
    const defaulterPageUrl = await driver.getCurrentUrl();
    console.log(`\n/igrs/defaulterRefrenceReports -> URL: ${defaulterPageUrl}, Title: ${defaulterPageTitle}`);

    // Look for any filter controls (date range, "days" dropdown, etc.)
    const filterControls = await driver.executeScript(`
      const all = Array.from(document.querySelectorAll('select, input[type=text], input[type=date], input[name]'));
      return all.map(el => ({ tag: el.tagName, type: el.type, name: el.name, id: el.id, placeholder: el.placeholder, options: el.tagName === 'SELECT' ? Array.from(el.options).map(o => o.textContent.trim()) : undefined }));
    `);
    console.log("\n=== Filter controls on defaulter report page ===");
    console.log(JSON.stringify(filterControls, null, 2));

    const defaulterTables = await driver.executeScript(`
      return Array.from(document.querySelectorAll('table')).map((t, i) => ({
        index: i,
        id: t.id,
        className: t.className,
        rowCount: t.rows.length,
        headerRow: t.rows[0] ? Array.from(t.rows[0].cells).map(c => c.textContent.trim()).join(' | ') : '',
        firstDataRow: t.rows[1] ? Array.from(t.rows[1].cells).map(c => c.textContent.trim()).join(' | ') : '',
      }));
    `);
    console.log("\n=== Tables on defaulter report page ===");
    console.log(JSON.stringify(defaulterTables, null, 2));

  } finally {
    await driver.quit();
  }
}

main().catch(console.error);

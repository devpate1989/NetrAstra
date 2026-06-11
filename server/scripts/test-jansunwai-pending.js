// Logs into Jan Sunwai portal, navigates to /igrs/officeLevelReferences,
// and dumps the full table structure + first few row details.
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
  const resp = await axios.get(`${BASE_URL}/Captcha.jpg`, { responseType: "arraybuffer", headers: { Cookie: cookieHeader } });
  return Buffer.from(resp.data);
}

async function main() {
  const driverPath = resolveChromedriverPath();
  const service = new chrome.ServiceBuilder(driverPath);
  const options = new chrome.Options();
  options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,900");

  const driver = await new Builder().forBrowser("chrome").setChromeService(service).setChromeOptions(options).build();

  try {
    // ── Login ──────────────────────────────────────────────
    let loggedIn = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await driver.get(`${BASE_URL}/login`);
      await driver.wait(until.elementLocated(By.css("input[name='username']")), 15000);
      await driver.findElement(By.css("input[name='username']")).sendKeys(USERNAME);
      await driver.findElement(By.css("input[name='password']")).sendKeys(PASSWORD);

      const buf = await fetchCaptchaBuffer(driver);
      const answer = await solveCaptcha(buf);
      if (!answer) { console.log(`Attempt ${attempt}: CAPTCHA unsolvable`); continue; }
      console.log(`Attempt ${attempt}: CAPTCHA = "${answer}"`);

      await driver.findElement(By.css("input[name='captcha']")).sendKeys(answer);
      await driver.findElement(By.css("button[type='submit']")).click();
      await driver.sleep(2500);

      const url = await driver.getCurrentUrl();
      if (!url.includes("/login")) { console.log("Logged in! URL:", url); loggedIn = true; break; }
      console.log(`Attempt ${attempt} failed`);
    }
    if (!loggedIn) { console.error("Login failed"); return; }

    // ── Navigate to pending office-level references ────────
    const listingUrl = `${BASE_URL}/igrs/officeLevelReferences`;
    console.log("\nNavigating to:", listingUrl);
    await driver.get(listingUrl);
    await driver.sleep(3000);

    const afterUrl = await driver.getCurrentUrl();
    const afterTitle = await driver.getTitle();
    console.log("URL:", afterUrl);
    console.log("Title:", afterTitle);

    // Screenshot
    const png = await driver.takeScreenshot();
    fs.writeFileSync(path.resolve(__dirname, "..", "..", "jansunwai-pending.png"), png, "base64");
    console.log("Screenshot saved: jansunwai-pending.png");

    // Save HTML
    const html = await driver.getPageSource();
    fs.writeFileSync(path.resolve(__dirname, "..", "..", "jansunwai-pending.html"), html.slice(0, 150000));
    console.log("HTML saved (first 150k)");

    // ── Inspect table structure ────────────────────────────
    const tables = await driver.executeScript(`
      return Array.from(document.querySelectorAll('table')).map((t, i) => ({
        index: i,
        id: t.id,
        className: t.className,
        rowCount: t.rows.length,
        headers: t.rows[0] ? Array.from(t.rows[0].cells).map(c => c.textContent.trim()) : [],
        row1: t.rows[1] ? Array.from(t.rows[1].cells).map(c => ({
          text: c.textContent.replace(/\\s+/g,' ').trim().slice(0,80),
          html: c.innerHTML.slice(0,200),
        })) : [],
        row2: t.rows[2] ? Array.from(t.rows[2].cells).map(c => c.textContent.replace(/\\s+/g,' ').trim().slice(0,80)) : [],
      }));
    `);
    console.log("\nTables on listing page:");
    console.log(JSON.stringify(tables, null, 2));

    // ── Check for pagination ───────────────────────────────
    const pagination = await driver.executeScript(`
      return Array.from(document.querySelectorAll('.pagination, [aria-label="pagination"], nav.page, ul.page'))
        .map(el => ({ className: el.className, html: el.innerHTML.slice(0,300) }));
    `);
    console.log("\nPagination elements:", JSON.stringify(pagination, null, 2));

    // ── Look for application number links ─────────────────
    const appLinks = await driver.executeScript(`
      const links = Array.from(document.querySelectorAll('a'));
      return links
        .filter(a => {
          const h = a.getAttribute('href') || '';
          const t = a.textContent.trim();
          return h.includes('reference') || h.includes('complaint') || h.includes('complain') ||
                 h.includes('grievance') || h.includes('petition') || h.includes('detail') ||
                 h.includes('view') || /^[0-9]{8,}/.test(t);
        })
        .slice(0,20)
        .map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim().slice(0,60) }));
    `);
    console.log("\nApplication/detail links:", JSON.stringify(appLinks, null, 2));

    // ── Click first application to see detail page ─────────
    const firstRow = tables[0];
    if (firstRow && firstRow.row1 && firstRow.row1.length > 0) {
      console.log("\nFirst data row cells:");
      firstRow.row1.forEach((cell, i) => {
        console.log(`  Cell ${i}: text="${cell.text}" | html="${cell.html}"`);
      });
    }

  } finally {
    await driver.quit();
  }
}

main().catch(console.error);

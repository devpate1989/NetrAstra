// Test script: log into Jan Sunwai portal, navigate to pending applications,
// and dump the page URL + relevant DOM structure so we can set real selectors.
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

// ─── Manual .env reader (avoids dotenvx hook mangling) ──────────────────────
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

async function main() {
  const driverPath = resolveChromedriverPath();
  console.log("ChromeDriver:", driverPath);

  const service = new chrome.ServiceBuilder(driverPath);
  const options = new chrome.Options();
  // headless for speed — switch to false to watch
  options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,900");

  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeService(service)
    .setChromeOptions(options)
    .build();

  try {
    // ── Login ──────────────────────────────────────────────
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
      console.log(`Attempt ${attempt}: CAPTCHA = "${answer}"`);

      await driver.findElement(By.css("input[name='captcha']")).sendKeys(answer);
      await driver.findElement(By.css("button[type='submit']")).click();
      await driver.sleep(2500);

      const url = await driver.getCurrentUrl();
      if (!url.includes("/login")) { console.log("Logged in! URL:", url); loggedIn = true; break; }
      console.log(`Attempt ${attempt} failed — still at: ${url}`);
    }

    if (!loggedIn) { console.error("Login failed after all attempts"); return; }

    // ── Screenshot the dashboard ───────────────────────────
    const dashPng = await driver.takeScreenshot();
    fs.writeFileSync(path.resolve(__dirname, "..", "..", "jansunwai-dashboard.png"), dashPng, "base64");
    console.log("Dashboard screenshot saved: jansunwai-dashboard.png");

    // ── Inspect the dashboard for pending-applications link ─
    const dashHtml = await driver.getPageSource();
    // Save truncated HTML for inspection
    fs.writeFileSync(path.resolve(__dirname, "..", "..", "jansunwai-dash.html"), dashHtml.slice(0, 80000));
    console.log("Dashboard HTML saved (first 80k chars)");

    // Find the "लंबित" (pending) link or button — look for href patterns
    const links = await driver.executeScript(`
      const all = Array.from(document.querySelectorAll('a, button'));
      return all
        .filter(el => {
          const t = (el.textContent || '').trim();
          const h = el.getAttribute('href') || '';
          return t.includes('लंबित') || t.includes('pending') || t.toLowerCase().includes('pending')
            || h.includes('pending') || h.includes('lambit') || h.includes('Pending');
        })
        .map(el => ({ tag: el.tagName, href: el.getAttribute('href'), text: (el.textContent||'').trim().slice(0,80) }));
    `);
    console.log("\nPending-related links on dashboard:");
    console.log(JSON.stringify(links, null, 2));

    // Also find all sidebar nav links
    const navLinks = await driver.executeScript(`
      const all = Array.from(document.querySelectorAll('nav a, .sidebar a, .menu a, ul.nav a, li a'));
      return all.slice(0, 40).map(el => ({ href: el.getAttribute('href'), text: (el.textContent||'').trim().slice(0,60) }));
    `);
    console.log("\nNav/Sidebar links:");
    console.log(JSON.stringify(navLinks, null, 2));

    // Look for the pending count link (the "133" tile)
    const tiles = await driver.executeScript(`
      const all = Array.from(document.querySelectorAll('a, div[onclick], td[onclick]'));
      return all
        .filter(el => {
          const t = (el.textContent || '').trim();
          return /^\\d+$/.test(t) || t.includes('133') || t.includes('2192') || t.includes('2059');
        })
        .map(el => ({ tag: el.tagName, href: el.getAttribute('href'), onclick: el.getAttribute('onclick'), text: (el.textContent||'').trim().slice(0,40) }));
    `);
    console.log("\nDashboard stat tiles/links:");
    console.log(JSON.stringify(tiles, null, 2));

    // ── Click the "लंबित" (133 pending) link ─────────────
    // Try clicking the pending count tile first
    let navigated = false;
    try {
      // Look for a clickable element near the "133" count
      const pendingEl = await driver.executeScript(`
        const els = Array.from(document.querySelectorAll('*'));
        // Find element containing exactly the number 133
        const found = els.find(el =>
          el.children.length === 0 &&
          (el.textContent||'').trim() === '133'
        );
        if (found) {
          // Walk up to find the closest anchor or clickable parent
          let p = found;
          for (let i = 0; i < 5; i++) {
            if (!p) break;
            if (p.tagName === 'A' || p.getAttribute('onclick')) return p;
            p = p.parentElement;
          }
        }
        return null;
      `);

      if (pendingEl) {
        const href = await driver.executeScript(`return arguments[0].getAttribute('href')`, pendingEl);
        const onclick = await driver.executeScript(`return arguments[0].getAttribute('onclick')`, pendingEl);
        console.log(`\nPending tile element: href=${href}, onclick=${onclick}`);
        await pendingEl.click();
        await driver.sleep(3000);
        navigated = true;
      }
    } catch (e) {
      console.log("Could not click pending tile:", e.message);
    }

    if (!navigated) {
      // Try direct URL guesses based on common IGRS patterns
      const guesses = [
        "/igrs/pending",
        "/igrs/lambit",
        "/igrs/applications/pending",
        "/igrs/grievance/pending",
        "/igrs/references",
        "/igrs/home",  // already there - check if there's a tab
      ];
      for (const guess of guesses) {
        try {
          await driver.get(`${BASE_URL}${guess}`);
          await driver.sleep(1500);
          const url = await driver.getCurrentUrl();
          const title = await driver.getTitle();
          console.log(`\nTried ${guess} → URL: ${url}, Title: ${title}`);
          if (!url.includes("/login") && url !== await driver.getCurrentUrl()) {
            console.log("Found a valid page!");
            break;
          }
        } catch (e) {
          // ignore
        }
      }
    }

    const afterUrl = await driver.getCurrentUrl();
    const afterTitle = await driver.getTitle();
    console.log(`\nCurrent URL: ${afterUrl}`);
    console.log(`Current title: ${afterTitle}`);

    // Take screenshot of wherever we ended up
    const listingPng = await driver.takeScreenshot();
    fs.writeFileSync(path.resolve(__dirname, "..", "..", "jansunwai-listing.png"), listingPng, "base64");
    console.log("Listing screenshot saved: jansunwai-listing.png");

    // Dump the listing page HTML
    const listingHtml = await driver.getPageSource();
    fs.writeFileSync(path.resolve(__dirname, "..", "..", "jansunwai-listing.html"), listingHtml.slice(0, 120000));
    console.log("Listing HTML saved (first 120k chars)");

    // Inspect table structure
    const tables = await driver.executeScript(`
      return Array.from(document.querySelectorAll('table')).map((t, i) => ({
        index: i,
        id: t.id,
        className: t.className,
        rowCount: t.rows.length,
        firstHeaderRow: t.rows[0] ? Array.from(t.rows[0].cells).map(c => c.textContent.trim()).join(' | ') : '',
        firstDataRow: t.rows[1] ? Array.from(t.rows[1].cells).map(c => c.textContent.trim().slice(0,40)).join(' | ') : '',
      }));
    `);
    console.log("\nTables on listing page:");
    console.log(JSON.stringify(tables, null, 2));

  } finally {
    await driver.quit();
  }
}

main().catch(console.error);

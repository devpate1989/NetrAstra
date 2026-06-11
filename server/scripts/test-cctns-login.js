// Test CCTNS portal: login, explore post-login UI, find pending investigations,
// set date range 01/01/1995 – today, and dump the results.
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

const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const Anthropic = require("@anthropic-ai/sdk").default;
const axios = require("axios");

// Use the base site URL (strip path)
const RAW_URL = process.env.CCTNS_PORTAL_URL || "https://cctnsup.gov.in";
const BASE_URL = new URL(RAW_URL).origin; // https://cctnsup.gov.in
const LOGIN_PATH = "/CCTNSWEB/Login.aspx";
const USERNAME = process.env.CCTNS_USERNAME;
const PASSWORD = process.env.CCTNS_PASSWORD;
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;

console.log("BASE_URL:", BASE_URL);
console.log("USERNAME:", USERNAME);

function resolveChromedriverPath() {
  const smBin = path.join(
    path.dirname(require.resolve("selenium-webdriver")),
    "bin", "windows", "selenium-manager.exe"
  );
  return JSON.parse(
    execFileSync(smBin, ["--browser", "chrome", "--skip-driver-in-path", "--output", "json"]).toString()
  ).result.driver_path;
}

function detectMediaType(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  return "image/png";
}

async function solveCaptchaFromBuffer(buf) {
  if (!CLAUDE_KEY || !buf) return null;
  const client = new Anthropic({ apiKey: CLAUDE_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 64,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: detectMediaType(buf), data: buf.toString("base64") } },
        { type: "text", text: "This is a CAPTCHA from a login form. Reply with ONLY the exact characters shown in the image — no spaces, no punctuation, no explanation. If it is arithmetic, reply with just the result number." },
      ],
    }],
  });
  const raw = response.content[0].type === "text" ? response.content[0].text.trim().replace(/[^a-zA-Z0-9]/g, "") : "";
  return raw || null;
}

async function solveCaptchaElement(driver, selector) {
  try {
    const el = await driver.findElement(By.css(selector));
    const b64 = await el.takeScreenshot();
    const buf = Buffer.from(b64, "base64");
    return solveCaptchaFromBuffer(buf);
  } catch {
    return null;
  }
}

function saveScreenshot(driver, name) {
  return driver.takeScreenshot().then(png => {
    const file = path.resolve(__dirname, "..", "..", `cctns-${name}.png`);
    fs.writeFileSync(file, png, "base64");
    console.log(`Screenshot saved: cctns-${name}.png`);
  }).catch(() => {});
}

async function inspectPage(driver, label) {
  const url = await driver.getCurrentUrl();
  const title = await driver.getTitle();
  console.log(`\n[${label}] URL: ${url}`);
  console.log(`[${label}] Title: ${title}`);
  return { url, title };
}

async function dumpForms(driver) {
  return driver.executeScript(`
    return Array.from(document.querySelectorAll('form')).map((f, i) => ({
      index: i,
      id: f.id,
      action: f.action,
      fields: Array.from(f.querySelectorAll('input,select,textarea')).map(el => ({
        tag: el.tagName,
        type: el.type || '',
        id: el.id,
        name: el.name,
        placeholder: el.placeholder || '',
        value: el.type === 'password' ? '***' : (el.value || ''),
      }))
    }));
  `);
}

async function dumpLinks(driver) {
  return driver.executeScript(`
    return Array.from(document.querySelectorAll('a')).slice(0,60).map(a => ({
      href: a.getAttribute('href'),
      text: (a.textContent||'').trim().slice(0,60),
      onclick: a.getAttribute('onclick'),
    })).filter(a => a.text || a.href);
  `);
}

async function main() {
  const driverPath = resolveChromedriverPath();
  console.log("ChromeDriver:", driverPath);

  const service = new chrome.ServiceBuilder(driverPath);
  const options = new chrome.Options();
  options.addArguments(
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--window-size=1400,900",
    "--disable-blink-features=AutomationControlled",
  );
  options.addArguments("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36");

  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeService(service)
    .setChromeOptions(options)
    .build();

  try {
    // ── Step 1: Load login page ────────────────────────────
    const loginUrl = BASE_URL + LOGIN_PATH;
    console.log("\nNavigating to:", loginUrl);
    await driver.get(loginUrl);
    await driver.sleep(3000);

    await inspectPage(driver, "login-page");
    await saveScreenshot(driver, "1-login-page");

    // Dump all form fields
    const forms = await dumpForms(driver);
    console.log("\nForms on login page:");
    console.log(JSON.stringify(forms, null, 2));

    // Check for images (potential CAPTCHA)
    const images = await driver.executeScript(`
      return Array.from(document.querySelectorAll('img')).map(img => ({
        id: img.id,
        src: img.src,
        className: img.className,
        width: img.width,
        height: img.height,
      }));
    `);
    console.log("\nImages on login page:");
    console.log(JSON.stringify(images, null, 2));

    // ── Step 2: Find and fill login form ──────────────────
    // Try ASP.NET ends-with selectors
    let usernameEl, passwordEl, submitEl;
    try { usernameEl = await driver.findElement(By.css("[id$='txtUserName']")); } catch {}
    try { passwordEl = await driver.findElement(By.css("[id$='txtPassword']")); } catch {}
    try { submitEl = await driver.findElement(By.css("[id$='btnLogin']")); } catch {}

    if (!usernameEl || !passwordEl || !submitEl) {
      console.log("WARNING: Could not find login fields with ASP.NET selectors. Trying alternatives...");
      try { usernameEl = await driver.findElement(By.css("input[type='text'], input[type='email']")); } catch {}
      try { passwordEl = await driver.findElement(By.css("input[type='password']")); } catch {}
      try { submitEl = await driver.findElement(By.css("input[type='submit'], button[type='submit']")); } catch {}
    }

    if (!usernameEl || !passwordEl) {
      console.error("Could not find login fields. Check the screenshots.");
      return;
    }

    console.log("\nFilling login form...");
    await usernameEl.clear();
    await usernameEl.sendKeys(USERNAME);
    await passwordEl.clear();
    await passwordEl.sendKeys(PASSWORD);

    // Look for CAPTCHA image
    const captchaImgSelectors = [
      "#captchaImage", "img[id*='captcha' i]", "img[src*='captcha' i]",
      "canvas", "img[id*='Captcha']", "[id*='captcha'] img",
    ];
    let captchaFound = false;
    for (const sel of captchaImgSelectors) {
      try {
        const el = await driver.findElement(By.css(sel));
        const visible = await el.isDisplayed();
        if (visible) {
          console.log(`Found CAPTCHA with selector: ${sel}`);
          const answer = await solveCaptchaElement(driver, sel);
          console.log(`CAPTCHA answer: "${answer}"`);
          if (answer) {
            // Find captcha input field
            const captchaInputSelectors = [
              "input[name*='captcha' i]", "input[id*='captcha' i]",
              "input[placeholder*='captcha' i]", "input[id*='Captcha']",
            ];
            for (const isel of captchaInputSelectors) {
              try {
                const inp = await driver.findElement(By.css(isel));
                await inp.clear();
                await inp.sendKeys(answer);
                captchaFound = true;
                console.log(`Entered CAPTCHA into: ${isel}`);
                break;
              } catch {}
            }
          }
          break;
        }
      } catch {}
    }

    if (!captchaFound) {
      console.log("No CAPTCHA found or it could not be solved");
    }

    // Submit
    console.log("Submitting login form...");
    await submitEl.click();
    await driver.sleep(4000);

    await inspectPage(driver, "post-login");
    await saveScreenshot(driver, "2-post-login");

    const postLoginUrl = await driver.getCurrentUrl();
    if (postLoginUrl.toLowerCase().includes("login")) {
      console.log("\nStill on login page — login may have failed. Checking for error messages...");
      const errors = await driver.executeScript(`
        return Array.from(document.querySelectorAll('.error, .alert, [class*="error"], span[style*="red"], label[style*="red"]'))
          .map(el => el.textContent.trim()).filter(t => t.length > 0);
      `);
      console.log("Error messages:", errors);

      // Try pressing Enter instead of clicking
      console.log("\nTrying Enter key on password field...");
      await passwordEl.sendKeys(Key.RETURN);
      await driver.sleep(4000);
      await inspectPage(driver, "post-login-enter");
      await saveScreenshot(driver, "2b-post-login-enter");
    }

    const currentUrl = await driver.getCurrentUrl();
    console.log("\nCurrent URL after login:", currentUrl);

    // ── Step 3: Explore post-login navigation ─────────────
    const links = await dumpLinks(driver);
    console.log("\nAll links after login:");
    console.log(JSON.stringify(links, null, 2));

    // Save full page HTML
    const html = await driver.getPageSource();
    fs.writeFileSync(path.resolve(__dirname, "..", "..", "cctns-post-login.html"), html.slice(0, 100000));
    console.log("Post-login HTML saved (first 100k chars)");

    // Look for investigation-related links
    const invLinks = links.filter(l => {
      const text = (l.text || "").toLowerCase();
      const href = (l.href || "").toLowerCase();
      return text.includes("invest") || text.includes("vivechan") || text.includes("pending")
        || text.includes("विवेचना") || text.includes("लंबित") || text.includes("फरियाद")
        || href.includes("invest") || href.includes("pending") || href.includes("vivechan");
    });
    console.log("\nInvestigation-related links:");
    console.log(JSON.stringify(invLinks, null, 2));

    // ── Step 4: Try to navigate to investigations ──────────
    if (invLinks.length > 0) {
      const firstLink = invLinks[0];
      console.log(`\nClicking first investigation link: "${firstLink.text}" -> ${firstLink.href}`);
      try {
        const el = await driver.findElement(By.linkText(firstLink.text));
        await el.click();
      } catch {
        if (firstLink.href && !firstLink.href.startsWith("javascript")) {
          await driver.get(firstLink.href.startsWith("http") ? firstLink.href : BASE_URL + firstLink.href);
        }
      }
      await driver.sleep(3000);
      await inspectPage(driver, "investigation-page");
      await saveScreenshot(driver, "3-investigation-page");
    } else {
      console.log("\nNo investigation links found — exploring navigation menus...");
      // Try common CCTNS navigation paths
      const navPaths = [
        "/CCTNSWEB/Investigation/PendingInvestigation.aspx",
        "/CCTNSWEB/Vivechan/PendingVivechan.aspx",
        "/CCTNSWEB/Reports/PendingCases.aspx",
        "/CCTNSWEB/home.aspx",
        "/CCTNSWEB/Default.aspx",
      ];
      for (const p of navPaths) {
        try {
          await driver.get(BASE_URL + p);
          await driver.sleep(2000);
          const u = await driver.getCurrentUrl();
          const t = await driver.getTitle();
          console.log(`  ${p} → ${u} | "${t}"`);
          if (!u.toLowerCase().includes("login") && !t.includes("Error")) {
            await saveScreenshot(driver, "3-nav-" + p.replace(/\//g, "-").replace(/\./g, "_"));
            const h = await driver.getPageSource();
            fs.writeFileSync(path.resolve(__dirname, "..", "..", `cctns-nav${p.replace(/\//g, "-")}.html`), h.slice(0, 80000));
            break;
          }
        } catch (e) {
          console.log(`  ${p} → error: ${e.message.slice(0, 60)}`);
        }
      }
    }

    // ── Step 5: Look for menus/dropdown items ─────────────
    const menus = await driver.executeScript(`
      return Array.from(document.querySelectorAll('ul li a, nav a, .menu a, [class*="menu"] a, [class*="nav"] a'))
        .slice(0, 80)
        .map(a => ({ href: a.getAttribute('href'), text: (a.textContent||'').trim().slice(0,80), onclick: a.getAttribute('onclick') }))
        .filter(a => a.text);
    `);
    console.log("\nMenu items:");
    console.log(JSON.stringify(menus, null, 2));

    // Dump all tables on current page
    const tables = await driver.executeScript(`
      return Array.from(document.querySelectorAll('table')).map((t, i) => ({
        index: i,
        id: t.id,
        className: t.className,
        rowCount: t.rows.length,
        headers: t.rows[0] ? Array.from(t.rows[0].cells).map(c => c.textContent.trim().slice(0,40)) : [],
        row1: t.rows[1] ? Array.from(t.rows[1].cells).map(c => c.textContent.replace(/\\s+/g,' ').trim().slice(0,50)) : [],
      })).slice(0, 20);
    `);
    console.log("\nTables on current page:");
    console.log(JSON.stringify(tables, null, 2));

  } finally {
    await driver.quit();
  }
}

main().catch(console.error);

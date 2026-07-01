// Explores the UP Police Public Grievance PS_DASHBOARD.
// Goes directly to ts.uppolice.gov.in/PublicGrievance/PS_DASHBOARD,
// handles whatever login page appears there, then screenshots the dashboard.
// Run: node scripts/explore-pg-portal.js
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

const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const { execFileSync } = require("child_process");
const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk").default;

const PG_BASE = "https://ts.uppolice.gov.in";
const PG_DASHBOARD = `${PG_BASE}/PublicGrievance/PS_DASHBOARD`;
const USERNAME = process.env.CCTNS_USERNAME;
const PASSWORD = process.env.CCTNS_PASSWORD;
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;

function resolveChromedriverPath() {
  const smBin = path.join(path.dirname(require.resolve("selenium-webdriver")), "bin", "windows", "selenium-manager.exe");
  return JSON.parse(execFileSync(smBin, ["--browser","chrome","--skip-driver-in-path","--output","json"]).toString()).result.driver_path;
}

async function solveCaptcha(imgUrl, cookies) {
  if (!CLAUDE_KEY) return null;
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const resp = await axios.get(imgUrl, { responseType: "arraybuffer", headers: { Cookie: cookieHeader } });
  const buf = Buffer.from(resp.data);
  const client = new Anthropic({ apiKey: CLAUDE_KEY });
  const r = await client.messages.create({
    model: "claude-sonnet-4-6", max_tokens: 64,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } },
      { type: "text", text: "This is a CAPTCHA. Reply with ONLY the exact characters shown. No spaces, no explanation." }
    ]}]
  });
  return r.content[0]?.text?.trim().replace(/[^a-zA-Z0-9]/g, "") || null;
}

async function snapshot(driver, name) {
  const png = await driver.takeScreenshot();
  const f = path.resolve(__dirname, "..", "..", `${name}.png`);
  fs.writeFileSync(f, png, "base64");
  console.log(`Screenshot: ${name}.png`);
  const html = await driver.getPageSource();
  fs.writeFileSync(path.resolve(__dirname, "..", "..", `${name}.html`), html.slice(0, 150000));
  console.log(`HTML: ${name}.html`);
}

async function main() {
  const driverPath = resolveChromedriverPath();
  const service = new chrome.ServiceBuilder(driverPath);
  const options = new chrome.Options();
  options.addArguments("--headless=new","--no-sandbox","--disable-dev-shm-usage","--window-size=1280,900");
  const driver = await new Builder().forBrowser("chrome").setChromeService(service).setChromeOptions(options).build();

  try {
    // Step 1: Go directly to the login page (we found it at /PublicGrievance/Login.aspx)
    const PG_LOGIN = `${PG_BASE}/PublicGrievance/Login.aspx`;
    console.log("Navigating to PG Login:", PG_LOGIN);
    await driver.get(PG_LOGIN);
    await driver.sleep(3000);
    const initialUrl = await driver.getCurrentUrl();
    const initialTitle = await driver.getTitle();
    console.log("Login URL:", initialUrl);
    console.log("Login Title:", initialTitle);
    await snapshot(driver, "pg-login");

    // Dump all form fields
    const allInputs = await driver.executeScript(`
      return Array.from(document.querySelectorAll('input,select,button')).map(el => ({
        id: el.id, name: el.name, type: el.type, placeholder: el.placeholder,
        value: el.type === 'password' ? '***' : el.value, class: el.className.slice(0,40)
      }));
    `);
    console.log("Form fields:", JSON.stringify(allInputs, null, 2));

    // Step 2: Check if it's a login page
    const isLoginPage = (await driver.findElements(By.css("input[type='password']"))).length > 0;
    console.log("Has password field:", isLoginPage);

    if (isLoginPage) {
      // Dump all input fields to understand the form
      const inputs = await driver.executeScript(`
        return Array.from(document.querySelectorAll('input,select,textarea')).map(el => ({
          id: el.id, name: el.name, type: el.type, placeholder: el.placeholder,
          value: el.value, class: el.className
        }));
      `);
      console.log("Login form fields:", JSON.stringify(inputs, null, 2));

      // Try to log in with CCTNS credentials
      const userFields = await driver.findElements(By.css("input[type='text'],input[name*='user'],input[id*='user'],input[id*='User'],input[name*='User']"));
      const passFields = await driver.findElements(By.css("input[type='password']"));
      const captchaImgs = await driver.findElements(By.css("img[src*='aptcha'],img[src*='Captcha'],img[src*='captcha'],img[src*='CAPTCHA']"));

      console.log(`Found: ${userFields.length} user fields, ${passFields.length} pass fields, ${captchaImgs.length} captcha imgs`);

      if (userFields.length && passFields.length) {
        await userFields[0].clear(); await userFields[0].sendKeys(USERNAME);
        await passFields[0].clear(); await passFields[0].sendKeys(PASSWORD);

        if (captchaImgs.length) {
          const imgSrc = await captchaImgs[0].getAttribute("src");
          const imgUrl = imgSrc.startsWith("http") ? imgSrc : `${PG_BASE}${imgSrc}`;
          console.log("Captcha URL:", imgUrl);
          const cookies = await driver.manage().getCookies();
          const answer = await solveCaptcha(imgUrl, cookies);
          if (answer) {
            console.log("Captcha answer:", answer);
            const captchaInputs = await driver.findElements(By.css("input[name*='aptcha'],input[id*='aptcha'],input[placeholder*='aptcha'],input[placeholder*='Code'],input[id*='txtCode'],input[id*='txtCaptcha']"));
            if (captchaInputs.length) {
              await captchaInputs[0].clear(); await captchaInputs[0].sendKeys(answer);
            }
          }
        }

        // Submit
        const submitBtns = await driver.findElements(By.css("input[type='submit'],button[type='submit'],input[id*='btn'],button[id*='btn'],input[value*='Login'],input[value*='login']"));
        console.log(`Found ${submitBtns.length} submit buttons`);
        if (submitBtns.length) await submitBtns[0].click();
        else await passFields[0].sendKeys(Key.RETURN);

        await driver.sleep(4000);
        const postLoginUrl = await driver.getCurrentUrl();
        console.log("Post-login URL:", postLoginUrl);
        await snapshot(driver, "pg-post-login");
      }
    }

    // Step 3: Navigate to dashboard if not already there
    const currentUrl = await driver.getCurrentUrl();
    if (!currentUrl.includes("PS_DASHBOARD")) {
      await driver.get(PG_DASHBOARD);
      await driver.sleep(3000);
    }

    await snapshot(driver, "pg-dashboard");
    console.log("Final URL:", await driver.getCurrentUrl());

    // Step 4: Extract dashboard data
    const tables = await driver.executeScript(`
      return Array.from(document.querySelectorAll('table')).map((t, i) => ({
        index: i, id: t.id, className: t.className, rowCount: t.rows.length,
        headers: t.rows[0] ? Array.from(t.rows[0].cells).map(c => c.textContent.trim().slice(0,50)).join(' | ') : '',
        firstRow: t.rows[1] ? Array.from(t.rows[1].cells).map(c => c.textContent.trim().slice(0,50)).join(' | ') : ''
      }));
    `);
    console.log("\nTables:", JSON.stringify(tables, null, 2));

    const numbers = await driver.executeScript(`
      const els = Array.from(document.querySelectorAll('span,td,div,h1,h2,h3,h4,b,strong,li,a'));
      return els.filter(el => /^\\d+$/.test((el.textContent||'').trim()))
        .map(el => ({ tag: el.tagName, text: el.textContent.trim(), id: el.id, class: el.className, parent: el.parentElement?.textContent?.trim()?.slice(0,80) }))
        .slice(0,30);
    `);
    console.log("\nNumeric elements:", JSON.stringify(numbers, null, 2));

    const allLinks = await driver.executeScript(`
      return Array.from(document.querySelectorAll('a')).slice(0,50)
        .map(a => ({ text: a.textContent.trim().slice(0,60), href: a.getAttribute('href'), onclick: a.getAttribute('onclick') }))
        .filter(a => a.text || a.href);
    `);
    console.log("\nLinks:", JSON.stringify(allLinks, null, 2));

  } finally {
    await driver.quit();
  }
}

main().catch(console.error);

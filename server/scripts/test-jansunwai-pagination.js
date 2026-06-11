// Quick test: login + navigate to listing + call AjPagination(2) + count cards
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
const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk").default;

const BASE_URL = process.env.JANSUNWAI_PORTAL_URL || "https://jansunwai.up.nic.in";
const USERNAME = process.env.JANSUNWAI_USERNAME;
const PASSWORD = process.env.JANSUNWAI_PASSWORD;
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;

function resolveChromedriverPath() {
  const smBin = path.join(path.dirname(require.resolve("selenium-webdriver")), "bin", "windows", "selenium-manager.exe");
  return JSON.parse(execFileSync(smBin, ["--browser", "chrome", "--skip-driver-in-path", "--output", "json"]).toString()).result.driver_path;
}

function detectMediaType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  return "image/png";
}

async function solveCaptcha(buf) {
  const client = new Anthropic({ apiKey: CLAUDE_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6", max_tokens: 64,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: detectMediaType(buf), data: buf.toString("base64") } },
      { type: "text", text: "This image is a CAPTCHA from a login form. Reply with ONLY the exact characters shown in the image — no spaces, no punctuation, no explanation. If it is a simple arithmetic CAPTCHA (e.g. '4 + 7 = ?'), reply with just the resulting number." },
    ]}],
  });
  const raw = response.content[0].type === "text" ? response.content[0].text.trim().replace(/[^a-zA-Z0-9]/g, "") : "";
  return raw || null;
}

async function main() {
  const driverPath = resolveChromedriverPath();
  const service = new chrome.ServiceBuilder(driverPath);
  const options = new chrome.Options();
  options.addArguments("--headless=new", "--no-sandbox", "--window-size=1280,900");
  const driver = await new Builder().forBrowser("chrome").setChromeService(service).setChromeOptions(options).build();

  try {
    // Login
    for (let attempt = 1; attempt <= 3; attempt++) {
      await driver.get(`${BASE_URL}/login`);
      await driver.wait(until.elementLocated(By.css("input[name='username']")), 15000);
      await driver.findElement(By.css("input[name='username']")).sendKeys(USERNAME);
      await driver.findElement(By.css("input[name='password']")).sendKeys(PASSWORD);
      const cookies = await driver.manage().getCookies();
      const resp = await axios.get(`${BASE_URL}/Captcha.jpg`, { responseType: "arraybuffer", headers: { Cookie: cookies.map(c=>`${c.name}=${c.value}`).join("; ") } });
      const answer = await solveCaptcha(Buffer.from(resp.data));
      console.log(`Attempt ${attempt}: CAPTCHA="${answer}"`);
      await driver.findElement(By.css("input[name='captcha']")).sendKeys(answer);
      await driver.findElement(By.css("button[type='submit']")).click();
      await driver.sleep(2500);
      if (!(await driver.getCurrentUrl()).includes("/login")) { console.log("Logged in"); break; }
    }

    await driver.get(`${BASE_URL}/igrs/officeLevelReferences`);
    await driver.sleep(2500);

    const count1 = await driver.executeScript(`return document.querySelectorAll("a[onclick*='showPopupComplaintDetails']").length`);
    console.log(`Page 1 cards: ${count1}`);

    // Get first app number on page 1
    const first1 = await driver.executeScript(`
      const a = document.querySelector("a[onclick*='showPopupComplaintDetails']");
      return a ? a.textContent.trim() : null;
    `);
    console.log(`First app on page 1: ${first1}`);

    // Call AjPagination(2)
    console.log("Calling AjPagination(2)...");
    await driver.executeScript(`AjPagination(2)`);
    await driver.wait(until.elementLocated({ css: "a[onclick*='showPopupComplaintDetails']" }), 15000).catch(()=>{});
    await driver.sleep(2000);

    const count2 = await driver.executeScript(`return document.querySelectorAll("a[onclick*='showPopupComplaintDetails']").length`);
    const first2 = await driver.executeScript(`
      const a = document.querySelector("a[onclick*='showPopupComplaintDetails']");
      return a ? a.textContent.trim() : null;
    `);
    console.log(`Page 2 cards: ${count2}`);
    console.log(`First app on page 2: ${first2}`);

    if (first1 !== first2) {
      console.log("PAGINATION WORKS — different apps on page 2!");
    } else {
      console.log("WARNING: Same first app after pagination — may not have changed page");
    }

  } finally {
    await driver.quit();
  }
}

main().catch(console.error);

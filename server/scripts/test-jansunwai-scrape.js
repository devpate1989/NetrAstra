// End-to-end test: login + scrape pending applications + print results (no DB write)
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
  const smBin = path.join(path.dirname(require.resolve("selenium-webdriver")), "bin", "windows", "selenium-manager.exe");
  return JSON.parse(execFileSync(smBin, ["--browser", "chrome", "--skip-driver-in-path", "--output", "json"]).toString()).result.driver_path;
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
    model: "claude-sonnet-4-6", max_tokens: 64,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: detectMediaType(imgBuffer), data: imgBuffer.toString("base64") } },
      { type: "text", text: "CAPTCHA: reply with ONLY the exact characters shown. No spaces, no explanation." },
    ]}],
  });
  const raw = response.content[0].type === "text" ? response.content[0].text.trim().replace(/[^a-zA-Z0-9]/g, "") : "";
  return raw.length > 0 ? raw : null;
}

async function fetchCaptchaBuffer(driver) {
  const cookies = await driver.manage().getCookies();
  const resp = await axios.get(`${BASE_URL}/Captcha.jpg`, {
    responseType: "arraybuffer",
    headers: { Cookie: cookies.map(c => `${c.name}=${c.value}`).join("; ") },
  });
  return Buffer.from(resp.data);
}

function extractCards(doc) {
  function findColContaining(parent, text) {
    return Array.from(parent.querySelectorAll(".col-sm-12")).find(el => el.textContent.includes(text)) || null;
  }

  const links = Array.from(doc.querySelectorAll("a[onclick*='showPopupComplaintDetails']"));
  return links.map(link => {
    const headerDiv = link.closest("div.box-title");
    const cardHeaderContainer = headerDiv?.parentElement;
    const cardBodyContainer = cardHeaderContainer?.nextElementSibling;

    const applicationNumber = link.textContent?.trim() || null;
    const headerTdText = link.parentElement?.textContent?.replace(/\s+/g, " ").trim() || "";
    const dateMatch = headerTdText.match(/प्राप्त दिनांक-\s*(\d{2}\/\d{2}\/\d{4})/);
    const receivedDate = dateMatch ? dateMatch[1] : null;

    if (!cardBodyContainer) return { applicationNumber, receivedDate, petitionerName: null, petitionerMobile: null, subject: null, description: null };

    const deptCatDiv = findColContaining(cardBodyContainer, "विभाग-");
    const deptCatText = deptCatDiv?.textContent?.replace(/\s+/g, " ").trim() || "";
    const deptMatch = deptCatText.match(/विभाग-\s*(.*?)(?:\s+सन्दर्भ श्रेणी|$)/);
    const catMatch = deptCatText.match(/सन्दर्भ श्रेणी\s*-\s*(.*?)$/);
    const subject = [deptMatch?.[1]?.trim(), catMatch?.[1]?.trim()].filter(Boolean).join(" — ") || null;

    const petitionerDiv = findColContaining(cardBodyContainer, "आवेदनकर्ता का विवरण:");
    const petitionerContent = (petitionerDiv?.textContent || "").replace("आवेदनकर्ता का विवरण:", "").replace(/\s+/g, " ").trim();
    const mobileMatch = petitionerContent.match(/मोबाइल नंबर\s*:([0-9,\s]+)/);
    const petitionerMobile = mobileMatch ? mobileMatch[1].split(",")[0].trim() : null;
    const beforeMobile = mobileMatch ? petitionerContent.slice(0, petitionerContent.indexOf("मोबाइल नंबर")).trim() : petitionerContent;
    const commaIdx = beforeMobile.indexOf(",");
    const petitionerName = commaIdx > 0 ? beforeMobile.slice(0, commaIdx).trim() : beforeMobile || null;

    const descDiv = cardBodyContainer.querySelector(".col-sm-12[align='justify']");
    const description = descDiv?.textContent?.replace("आवेदन पत्र का विवरण:", "").replace(/\s+/g, " ").trim() || null;

    return { applicationNumber, receivedDate, petitionerName, petitionerMobile, subject, description };
  });
}

async function main() {
  const driverPath = resolveChromedriverPath();
  const service = new chrome.ServiceBuilder(driverPath);
  const options = new chrome.Options();
  options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,900");

  const driver = await new Builder().forBrowser("chrome").setChromeService(service).setChromeOptions(options).build();

  try {
    // Login
    let loggedIn = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await driver.get(`${BASE_URL}/login`);
      await driver.wait(until.elementLocated(By.css("input[name='username']")), 15000);
      await driver.findElement(By.css("input[name='username']")).sendKeys(USERNAME);
      await driver.findElement(By.css("input[name='password']")).sendKeys(PASSWORD);

      const buf = await fetchCaptchaBuffer(driver);
      const answer = await solveCaptcha(buf);
      if (!answer) { console.log(`Attempt ${attempt}: unsolvable`); continue; }
      console.log(`Attempt ${attempt}: CAPTCHA = "${answer}"`);
      await driver.findElement(By.css("input[name='captcha']")).sendKeys(answer);
      await driver.findElement(By.css("button[type='submit']")).click();
      await driver.sleep(2500);

      if (!(await driver.getCurrentUrl()).includes("/login")) { loggedIn = true; break; }
    }
    if (!loggedIn) { console.error("Login failed"); return; }

    // Navigate to listing
    await driver.get(`${BASE_URL}/igrs/officeLevelReferences`);
    await driver.sleep(2500);

    // Get pagination info
    const pagination = await driver.executeScript(`
      const el = document.querySelector("[data-pagination]");
      if (!el) return null;
      try { return JSON.parse(el.getAttribute("data-pagination")); } catch { return null; }
    `);
    const total = pagination ? parseInt(pagination.totals) : 0;
    const pageSize = pagination ? parseInt(pagination.pageSize) : 10;
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
    console.log(`\nTotal applications: ${total}, pages: ${totalPages}`);

    const allRows = [];

    // Page 1
    const page1 = await driver.executeScript(function() {
      const extractCards = new Function("doc", `
        function findColContaining(parent, text) {
          return Array.from(parent.querySelectorAll(".col-sm-12")).find(el => el.textContent.includes(text)) || null;
        }
        const links = Array.from(doc.querySelectorAll("a[onclick*='showPopupComplaintDetails']"));
        return links.map(link => {
          const headerDiv = link.closest("div.box-title");
          const cardHeaderContainer = headerDiv?.parentElement;
          const cardBodyContainer = cardHeaderContainer?.nextElementSibling;
          const applicationNumber = link.textContent?.trim() || null;
          const headerTdText = link.parentElement?.textContent?.replace(/\\s+/g, " ").trim() || "";
          const dateMatch = headerTdText.match(/प्राप्त दिनांक-\\s*(\\d{2}\\/\\d{2}\\/\\d{4})/);
          const receivedDate = dateMatch ? dateMatch[1] : null;
          if (!cardBodyContainer) return { applicationNumber, receivedDate, petitionerName: null, petitionerMobile: null, subject: null, description: null };
          const deptCatDiv = findColContaining(cardBodyContainer, "विभाग-");
          const deptCatText = deptCatDiv?.textContent?.replace(/\\s+/g, " ").trim() || "";
          const deptMatch = deptCatText.match(/विभाग-\\s*(.*?)(?:\\s+सन्दर्भ श्रेणी|$)/);
          const catMatch = deptCatText.match(/सन्दर्भ श्रेणी\\s*-\\s*(.*?)$/);
          const subject = [deptMatch?.[1]?.trim(), catMatch?.[1]?.trim()].filter(Boolean).join(" — ") || null;
          const petitionerDiv = findColContaining(cardBodyContainer, "आवेदनकर्ता का विवरण:");
          const petitionerContent = (petitionerDiv?.textContent || "").replace("आवेदनकर्ता का विवरण:", "").replace(/\\s+/g, " ").trim();
          const mobileMatch = petitionerContent.match(/मोबाइल नंबर\\s*:([0-9,\\s]+)/);
          const petitionerMobile = mobileMatch ? mobileMatch[1].split(",")[0].trim() : null;
          const beforeMobile = mobileMatch ? petitionerContent.slice(0, petitionerContent.indexOf("मोबाइल नंबर")).trim() : petitionerContent;
          const commaIdx = beforeMobile.indexOf(",");
          const petitionerName = commaIdx > 0 ? beforeMobile.slice(0, commaIdx).trim() : beforeMobile || null;
          const descDiv = cardBodyContainer.querySelector(".col-sm-12[align='justify']");
          const description = descDiv?.textContent?.replace("आवेदन पत्र का विवरण:", "").replace(/\\s+/g, " ").trim() || null;
          return { applicationNumber, receivedDate, petitionerName, petitionerMobile, subject, description };
        });
      `);
      return extractCards(document);
    });
    allRows.push(...page1);
    console.log(`Page 1: ${page1.length} cards`);

    // Sample output
    console.log("\nSample application (row 1):");
    if (allRows[0]) console.log(JSON.stringify(allRows[0], null, 2));
    if (allRows[1]) { console.log("\nSample application (row 2):"); console.log(JSON.stringify(allRows[1], null, 2)); }

    console.log(`\nTotal scraped from page 1: ${allRows.length}`);
    console.log("Scraping test complete — would need real DB to test storage.");

  } finally {
    await driver.quit();
  }
}

main().catch(console.error);

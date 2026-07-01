// Explores PDF download mechanisms across all 3 portals.
// Run: node scripts/explore-pdf-sources.js
const path = require("path");
const fs = require("fs");
const axios = require("axios");

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

const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const { execFileSync } = require("child_process");

const CCTNS_BASE = new URL(process.env.CCTNS_PORTAL_URL).origin;
const JS_BASE    = process.env.JANSUNWAI_PORTAL_URL;
const PG_BASE    = "https://ts.uppolice.gov.in";
const OUT        = path.resolve(__dirname, "..", "..");
const DOWNLOAD_DIR = path.join(OUT, "pdf-explore");
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

function resolveChromedriverPath() {
  const sm = path.join(path.dirname(require.resolve("selenium-webdriver")), "bin", "windows", "selenium-manager.exe");
  return JSON.parse(execFileSync(sm, ["--browser", "chrome", "--skip-driver-in-path", "--output", "json"]).toString()).result.driver_path;
}

function save(name, content, ext = "png") {
  const f = path.join(OUT, `pdf-explore-${name}.${ext}`);
  fs.writeFileSync(f, content, ext === "html" ? "utf8" : "base64");
  console.log(`  Saved: pdf-explore-${name}.${ext}`);
  return f;
}

// Wait for file to appear in download dir
async function waitForDownload(dir, waitMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    const files = fs.readdirSync(dir).filter(f => !f.endsWith(".crdownload"));
    if (files.length > 0) return path.join(dir, files[0]);
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

async function exploreCctns(driver) {
  console.log("\n=== [1] CCTNS: Explore FIR detail popup after lnkFIRDetails click ===");

  // Login
  await driver.get(CCTNS_BASE + "/CCTNSWEB/Login.aspx");
  await driver.sleep(3000);
  await driver.findElement({ css: "#txtUserName" }).sendKeys(process.env.CCTNS_USERNAME);
  await driver.findElement({ css: "#txtPassword" }).sendKeys(process.env.CCTNS_PASSWORD);
  await driver.findElement({ css: "#btnLogin" }).click();
  await driver.sleep(4000);
  console.log("  After CCTNS login:", await driver.getCurrentUrl());

  // Navigate to FIR pending investigation and get popup
  await driver.get(CCTNS_BASE + "/CCTNSWEB/FIRPendingInvestigation.aspx");
  await driver.sleep(2500);

  // Set dates and dropdowns via JS (from existing scraper's pattern)
  await driver.executeScript(`
    var fromEl = document.getElementById('txtStartDate');
    var toEl   = document.getElementById('txtEndDate');
    if (fromEl) fromEl.value = '01/01/1995';
    if (toEl)   toEl.value   = new Date().toLocaleDateString('en-IN', {day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\\//g,'/');
  `);

  // Set cascade dropdowns: zone, range, district, PS, report type
  const selects = [
    ["ddlzone",         process.env.CCTNS_ZONE_ID],
    ["ddlrange",        process.env.CCTNS_RANGE_ID],
    ["ddlDistrict",     process.env.CCTNS_DISTRICT_ID],
    ["ddlPoliceStation",process.env.CCTNS_PS_ID],
    ["ddlReportType",   "2"],
  ];
  for (const [id, val] of selects) {
    if (!val) continue;
    try {
      const el = await driver.findElement({ id });
      await driver.executeScript(`arguments[0].value='${val}'; arguments[0].dispatchEvent(new Event('change'))`, el);
      await driver.sleep(1500);
    } catch {}
  }
  await driver.executeScript(`document.getElementById('btnSearchFir')?.click()`);
  await driver.sleep(3000);

  // Click pending count to open popup
  try {
    await driver.executeScript(`__doPostBack('gdvdata$ctl02$lnkFIRPSDetails','')`);
    await driver.sleep(3000);
  } catch {}

  save("cctns-popup-list", await driver.takeScreenshot());

  // Now click the first FIR's lnkFIRDetails
  console.log("  Clicking first FIR lnkFIRDetails...");
  try {
    await driver.executeScript(`__doPostBack('gdvPopUP$ctl02$lnkFIRDetails','')`);
    await driver.sleep(3000);
  } catch (e) {
    console.log("  PostBack error:", e.message?.slice(0, 60));
  }

  save("cctns-fir-detail", await driver.takeScreenshot());
  save("cctns-fir-detail", (await driver.getPageSource()).slice(0, 100000), "html");

  // Find any download/PDF buttons in the page
  const pdfLinks = await driver.executeScript(`
    return Array.from(document.querySelectorAll("a,input[type='button'],input[type='submit'],button"))
      .filter(el => {
        const t = (el.textContent || el.value || '').toLowerCase();
        const h = (el.href || el.getAttribute('onclick') || '').toLowerCase();
        return t.includes('pdf') || t.includes('download') || t.includes('print') ||
               t.includes('view') || h.includes('pdf') || h.includes('download') || h.includes('fir');
      })
      .map(el => ({ tag: el.tagName, text: (el.textContent || el.value || '').trim().slice(0,50),
                    href: el.href, onclick: el.getAttribute('onclick') }))
      .slice(0, 20);
  `);
  console.log("  PDF/download links on FIR detail page:", JSON.stringify(pdfLinks, null, 2));

  // Also try direct FIRViewDetail.aspx
  await driver.get(CCTNS_BASE + "/CCTNSWEB/Registration/FIR/FIRViewDetail.aspx");
  await driver.sleep(2500);
  save("cctns-firviewdetail", await driver.takeScreenshot());
  save("cctns-firviewdetail", (await driver.getPageSource()).slice(0, 60000), "html");
  console.log("  FIRViewDetail URL:", await driver.getCurrentUrl());
}

async function exploreJansunwai(driver) {
  console.log("\n=== [2] Jan Sunwai: Explore application detail popup for petition PDF ===");

  await driver.get(JS_BASE + "/igrs/login");
  await driver.sleep(2500);

  const userInputs = await driver.findElements({ css: "input[name='username'],input[id*='user'],input[type='text']" });
  const passInputs = await driver.findElements({ css: "input[type='password']" });
  const captchaImgs = await driver.findElements({ css: "img[src*='Captcha'],img[src*='captcha']" });
  if (userInputs.length && passInputs.length) {
    await userInputs[0].sendKeys(process.env.JANSUNWAI_USERNAME);
    await passInputs[0].sendKeys(process.env.JANSUNWAI_PASSWORD);
    if (captchaImgs.length) {
      const imgSrc = await captchaImgs[0].getAttribute("src");
      const imgUrl = imgSrc.startsWith("http") ? imgSrc : JS_BASE + imgSrc;
      const cookies = await driver.manage().getCookies();
      const cookieHdr = cookies.map(c => `${c.name}=${c.value}`).join("; ");
      const resp = await axios.get(imgUrl, { responseType: "arraybuffer", headers: { Cookie: cookieHdr } });
      const Anthropic = require("@anthropic-ai/sdk").default;
      const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
      const r = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 64,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(resp.data).toString("base64") } },
          { type: "text", text: "This is a CAPTCHA. Reply with ONLY the exact characters shown." }
        ]}]
      });
      const answer = r.content[0]?.text?.trim().replace(/[^a-zA-Z0-9]/g, "") || "";
      if (answer) {
        const captchaInputs = await driver.findElements({ css: "input[name*='aptcha'],input[id*='aptcha']" });
        if (captchaInputs.length) await captchaInputs[0].sendKeys(answer);
      }
    }
    const submitBtns = await driver.findElements({ css: "button[type='submit'],input[type='submit']" });
    if (submitBtns.length) await submitBtns[0].click();
    await driver.sleep(3000);
  }
  console.log("  After JS login:", await driver.getCurrentUrl());

  // Navigate to pending applications
  await driver.get(JS_BASE + "/igrs/officeLevelReferences");
  await driver.sleep(2500);
  save("js-listing", await driver.takeScreenshot());

  // Find first application card link and click it
  const cardLink = await driver.findElement({ css: "a[onclick*='showPopupComplaintDetails']" }).catch(() => null);
  if (!cardLink) { console.log("  No complaint links found"); return; }

  const onclickAttr = await cardLink.getAttribute("onclick");
  console.log("  First card onclick:", onclickAttr);

  await cardLink.click();
  await driver.sleep(3000);
  save("js-detail-popup", await driver.takeScreenshot());
  save("js-detail-popup", (await driver.getPageSource()).slice(0, 100000), "html");

  // Find PDF/download links in popup
  const pdfLinks = await driver.executeScript(`
    return Array.from(document.querySelectorAll("a[onclick*='complaintDocument'],a[onclick*='Download'],a[href*='pdf'],a[href*='Download'],button[onclick*='pdf']"))
      .map(el => ({ text: el.textContent.trim().slice(0,60), onclick: el.getAttribute('onclick'), href: el.href }))
      .slice(0, 20);
  `);
  console.log("  PDF links in detail popup:", JSON.stringify(pdfLinks, null, 2));

  // Extract petition PDF URL directly
  const petitionInfo = await driver.executeScript(`
    const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent);
    const matches = [];
    for (const s of scripts) {
      const m = s.match(/complaintDocument\\s*\\(\\s*['"]?(\\d+)['"]?\\s*,\\s*['"]?([\\d]+)['"]?\\s*\\)/g);
      if (m) matches.push(...m);
      const m2 = s.match(/attachmentId=[^&'"]+/g);
      if (m2) matches.push(...m2);
    }
    return matches.slice(0,10);
  `);
  console.log("  Petition document calls:", petitionInfo);
}

async function explorePg(driver) {
  console.log("\n=== [3] PG Portal: Download complaint PDF via PostBack ===");

  // Clear any existing downloads
  fs.readdirSync(DOWNLOAD_DIR).forEach(f => fs.unlinkSync(path.join(DOWNLOAD_DIR, f)));

  await driver.get(PG_BASE + "/PublicGrievance/Login.aspx");
  await driver.sleep(2000);
  await driver.findElement({ css: "#txtCug" }).sendKeys(process.env.CCTNS_USERNAME);
  await driver.findElement({ css: "#txtPassword" }).sendKeys(process.env.CCTNS_PASSWORD);
  await driver.findElement({ css: "#btnSubmit" }).click();
  await driver.sleep(3000);
  console.log("  After PG login:", await driver.getCurrentUrl());

  await driver.get(PG_BASE + "/PublicGrievance/DisplayAllComplaints.aspx");
  await driver.sleep(3000);

  // Try to get the PDF URL by triggering the postback and monitoring what happens
  // First check if there's a direct URL pattern or if it really requires PostBack
  const pdfButtonInfo = await driver.executeScript(`
    const btns = Array.from(document.querySelectorAll('a[id*="lnkComplaintFileDownload"]'));
    return btns.slice(0,3).map(a => ({
      id: a.id, onclick: a.getAttribute('onclick'), href: a.href,
      parentText: a.closest('tr')?.textContent?.trim()?.slice(0,100)
    }));
  `);
  console.log("  PDF buttons:", JSON.stringify(pdfButtonInfo, null, 2));

  // Get the session cookies (for direct HTTP download)
  const cookies = await driver.manage().getCookies();
  const cookieHdr = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  console.log("  PG session cookies:", cookies.map(c => c.name).join(", "));

  // Try triggering the first PDF PostBack and capturing what the server sends
  // Get ViewState + EventValidation for the PostBack
  const formData = await driver.executeScript(`
    return {
      viewstate: document.querySelector('#__VIEWSTATE')?.value?.slice(0, 30),
      eventValidation: document.querySelector('#__EVENTVALIDATION')?.value?.slice(0, 30),
      eventTarget: '__doPostBack trigger test',
    };
  `);
  console.log("  Form state (truncated):", formData);

  // Try direct HTTP POST to see what the server returns for a complaint PDF
  try {
    const viewstate = await driver.executeScript(`return document.querySelector('#__VIEWSTATE')?.value`);
    const eventValidation = await driver.executeScript(`return document.querySelector('#__EVENTVALIDATION')?.value`);

    const postBody = new URLSearchParams({
      "__EVENTTARGET": "ctl00$ContentPlaceHolder1$grvComplainantDetail$ctl02$lnkComplaintFileDownload",
      "__EVENTARGUMENT": "",
      "__VIEWSTATE": viewstate || "",
      "__EVENTVALIDATION": eventValidation || "",
    });

    const response = await axios.post(
      PG_BASE + "/PublicGrievance/DisplayAllComplaints.aspx",
      postBody.toString(),
      {
        headers: {
          "Cookie": cookieHdr,
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": PG_BASE + "/PublicGrievance/DisplayAllComplaints.aspx",
        },
        maxRedirects: 5,
        responseType: "arraybuffer",
        validateStatus: () => true,
        timeout: 15000,
      }
    );

    console.log("  HTTP POST response status:", response.status);
    console.log("  Content-Type:", response.headers["content-type"]);
    console.log("  Content-Disposition:", response.headers["content-disposition"]);
    console.log("  Response size:", response.data.byteLength, "bytes");

    if (response.headers["content-type"]?.includes("pdf") || response.headers["content-disposition"]?.includes("pdf")) {
      const pdfPath = path.join(DOWNLOAD_DIR, "complaint-sample.pdf");
      fs.writeFileSync(pdfPath, Buffer.from(response.data));
      console.log("  PDF saved:", pdfPath);
    } else {
      // Save as HTML to inspect
      fs.writeFileSync(path.join(OUT, "pg-pdf-response.html"), Buffer.from(response.data).toString("utf8").slice(0, 50000));
      console.log("  Response saved as pg-pdf-response.html (not a PDF)");
    }
  } catch (e) {
    console.log("  HTTP POST error:", e.message?.slice(0, 100));
  }
}

async function main() {
  const driverPath = resolveChromedriverPath();
  const options = new chrome.Options();
  options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,900");
  // Configure auto-download for PDF files
  options.setUserPreferences({
    "download.default_directory": DOWNLOAD_DIR,
    "download.prompt_for_download": false,
    "plugins.always_open_pdf_externally": true,
    "profile.default_content_settings.popups": 0,
  });

  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeService(new chrome.ServiceBuilder(driverPath))
    .setChromeOptions(options)
    .build();

  try {
    await explorePg(driver);        // Easiest, confirmed
    // await exploreCctns(driver);  // Complex, separate portal
    // await exploreJansunwai(driver); // Separate login flow
    console.log("\n\nDone. Check pdf-explore/ dir for downloads and pdf-explore-*.png for screenshots.");
  } finally {
    await driver.quit();
  }
}

main().catch(console.error);

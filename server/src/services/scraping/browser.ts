import puppeteer, { Browser, Page } from "puppeteer";

/**
 * Launches a headless Chromium instance configured for scraping login-gated
 * portals. Shared by the CCTNS and Jan Sunwai scrapers so launch flags / UA
 * stay consistent in one place.
 */
export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

export async function newPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1366, height: 900 });
  return page;
}

/**
 * Runs `task` with a fresh browser/page and guarantees the browser is closed
 * afterwards (including on error), so scrape jobs never leak Chromium processes.
 */
export async function withPage<T>(task: (page: Page, browser: Browser) => Promise<T>): Promise<T> {
  const browser = await launchBrowser();
  try {
    const page = await newPage(browser);
    return await task(page, browser);
  } finally {
    await browser.close();
  }
}

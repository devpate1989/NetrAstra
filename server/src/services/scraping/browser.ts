import { execFileSync } from "child_process";
import path from "path";
import { Builder, By, until, WebDriver, WebElement } from "selenium-webdriver";
import { Options as ChromeOptions, ServiceBuilder } from "selenium-webdriver/chrome";

/**
 * Resolves the ChromeDriver path via the Selenium Manager binary bundled with
 * selenium-webdriver, bypassing any stale `chromedriver` on the system PATH.
 */
function resolveChromedriverPath(): string {
  const smDir = path.join(path.dirname(require.resolve("selenium-webdriver")), "bin");
  const smBin =
    process.platform === "win32"
      ? path.join(smDir, "windows", "selenium-manager.exe")
      : process.platform === "darwin"
      ? path.join(smDir, "macos", "selenium-manager")
      : path.join(smDir, "linux", "selenium-manager");

  const raw = execFileSync(smBin, ["--browser", "chrome", "--skip-driver-in-path", "--output", "json"]).toString();
  const result = JSON.parse(raw) as { result: { driver_path: string } };
  return result.result.driver_path;
}

let _chromedriverPath: string | null = null;

function getChromedriverPath(): string {
  if (!_chromedriverPath) {
    _chromedriverPath = resolveChromedriverPath();
    console.log(`[browser] Using ChromeDriver: ${_chromedriverPath}`);
  }
  return _chromedriverPath;
}

export async function launchDriver(): Promise<WebDriver> {
  const options = new ChromeOptions();
  options.addArguments(
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1366,900",
    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

  return new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .setChromeService(new ServiceBuilder(getChromedriverPath()))
    .build();
}

/** Waits for the first element matching `selector` and returns it. Throws on timeout. */
export async function waitForElement(
  driver: WebDriver,
  selector: string,
  timeoutMs = 15_000
): Promise<WebElement> {
  return driver.wait(until.elementLocated(By.css(selector)), timeoutMs);
}

/** Returns the first matching element immediately, or null if absent. */
export async function findElement(driver: WebDriver, selector: string): Promise<WebElement | null> {
  const els = await driver.findElements(By.css(selector));
  return els.length > 0 ? els[0] : null;
}

/**
 * Runs `task` with a fresh WebDriver and guarantees `driver.quit()` afterwards,
 * so scrape jobs never leak Chrome processes.
 */
export async function withDriver<T>(task: (driver: WebDriver) => Promise<T>): Promise<T> {
  const driver = await launchDriver();
  try {
    return await task(driver);
  } finally {
    await driver.quit();
  }
}

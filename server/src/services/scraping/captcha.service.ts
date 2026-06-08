import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ElementHandle, Page } from "puppeteer";
import { env } from "../../config/env";

/**
 * Reads a CAPTCHA image with the Gemini API (vision) and returns the text it
 * contains. Used by the portal scrapers when a login form is CAPTCHA-protected
 * (per prompt.md module 8's "use the Gemini API for CAPTCHA-solving" note).
 *
 * Returns null if no Gemini key is configured or the model can't read it —
 * callers should treat that as "could not log in this run" and retry later
 * rather than crash the whole scrape job.
 */
export async function solveCaptchaImage(pngBuffer: Buffer): Promise<string | null> {
  if (!env.geminiApiKey) return null;

  try {
    const client = new GoogleGenerativeAI(env.geminiApiKey);
    const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent([
      {
        text:
          "This image is a CAPTCHA from a login form. Reply with ONLY the exact characters " +
          "shown in the image — no spaces, no punctuation, no explanation. If it is a simple " +
          "arithmetic CAPTCHA (e.g. '4 + 7 = ?'), reply with just the resulting number.",
      },
      { inlineData: { mimeType: "image/png", data: pngBuffer.toString("base64") } },
    ]);

    const text = result.response.text().trim().replace(/[^a-zA-Z0-9]/g, "");
    return text.length > 0 ? text : null;
  } catch (err) {
    console.error("[captcha] Gemini could not read the CAPTCHA image:", err);
    return null;
  }
}

/**
 * Convenience helper: screenshots a CAPTCHA `<img>`/canvas element on the page
 * and asks Gemini to read it. Returns null if the element/key is missing or
 * the model fails — see `solveCaptchaImage`.
 */
export async function solveCaptchaElement(page: Page, captchaSelector: string): Promise<string | null> {
  const element: ElementHandle | null = await page.$(captchaSelector);
  if (!element) return null;

  const screenshot = await element.screenshot({ type: "png" });
  return solveCaptchaImage(Buffer.from(screenshot as Buffer));
}

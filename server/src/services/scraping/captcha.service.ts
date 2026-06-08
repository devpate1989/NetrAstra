import Anthropic from "@anthropic-ai/sdk";
import type { ElementHandle, Page } from "puppeteer";
import { env } from "../../config/env";

/**
 * Reads a CAPTCHA image with the Claude API (vision) and returns the text it
 * contains. Uses claude-haiku-4-5 — fast and accurate enough for OCR tasks.
 *
 * Returns null if no CLAUDE_API_KEY is configured or the model can't read it —
 * callers should treat that as "could not log in this run" and retry later.
 */
export async function solveCaptchaImage(pngBuffer: Buffer): Promise<string | null> {
  if (!env.claudeApiKey) return null;

  try {
    const client = new Anthropic({ apiKey: env.claudeApiKey });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 64,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: pngBuffer.toString("base64"),
              },
            },
            {
              type: "text",
              text:
                "This image is a CAPTCHA from a login form. Reply with ONLY the exact characters " +
                "shown in the image — no spaces, no punctuation, no explanation. If it is a simple " +
                "arithmetic CAPTCHA (e.g. '4 + 7 = ?'), reply with just the resulting number.",
            },
          ],
        },
      ],
    });

    const block = response.content[0];
    const raw = block.type === "text" ? block.text.trim().replace(/[^a-zA-Z0-9]/g, "") : "";
    return raw.length > 0 ? raw : null;
  } catch (err) {
    console.error("[captcha] Claude could not read the CAPTCHA image:", err);
    return null;
  }
}

/**
 * Convenience helper: screenshots a CAPTCHA <img>/canvas element on the page
 * and asks Claude to read it. Returns null if the element/key is missing.
 */
export async function solveCaptchaElement(page: Page, captchaSelector: string): Promise<string | null> {
  const element: ElementHandle | null = await page.$(captchaSelector);
  if (!element) return null;

  const screenshot = await element.screenshot({ type: "png" });
  return solveCaptchaImage(Buffer.from(screenshot as Buffer));
}

import Anthropic from "@anthropic-ai/sdk";
import { WebDriver } from "selenium-webdriver";
import { env } from "../../config/env";
import { findElement } from "./browser";

/**
 * Reads a CAPTCHA image with the Claude API (vision) and returns the text it
 * contains. Uses claude-haiku-4-5 — fast and accurate enough for OCR tasks.
 *
 * Returns null if no CLAUDE_API_KEY is configured or the model can't read it —
 * callers should treat that as "could not log in this run" and retry later.
 */
function detectMediaType(buf: Buffer): "image/png" | "image/jpeg" | "image/gif" | "image/webp" {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  return "image/webp";
}

export async function solveCaptchaImage(imgBuffer: Buffer): Promise<string | null> {
  if (!env.claudeApiKey) return null;

  try {
    const client = new Anthropic({ apiKey: env.claudeApiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 64,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: detectMediaType(imgBuffer),
                data: imgBuffer.toString("base64"),
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

export async function solveCaptchaElement(driver: WebDriver, captchaSelector: string): Promise<string | null> {
  const element = await findElement(driver, captchaSelector);
  if (!element) return null;
  const b64 = await element.takeScreenshot();
  return solveCaptchaImage(Buffer.from(b64, "base64"));
}

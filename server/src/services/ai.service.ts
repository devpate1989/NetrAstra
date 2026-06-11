import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.claudeApiKey) {
    throw new Error("CLAUDE_API_KEY is not configured");
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: env.claudeApiKey });
  }
  return _client;
}

// Claude sometimes wraps JSON in ```json ... ``` fences even when asked not to.
export function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function isAiConfigured(): boolean {
  return Boolean(env.claudeApiKey);
}

/**
 * General-purpose Claude text completion. Use for any decision-making,
 * classification, or analysis tasks within the app.
 *
 * @param systemPrompt  Describes the AI's role and output format.
 * @param userPrompt    The specific input / question.
 * @param model         Defaults to claude-haiku-4-5 (fast); use claude-sonnet-4-6
 *                      for complex reasoning.
 */
export async function askClaude(
  systemPrompt: string,
  userPrompt: string,
  model: "claude-haiku-4-5-20251001" | "claude-sonnet-4-6" = "claude-haiku-4-5-20251001",
  maxTokens = 512
): Promise<string> {
  const client = getClient();

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text.trim() : "";
}

/**
 * Analyses a completed inquiry report and returns a structured JSON assessment:
 * - consistent: are the facts internally consistent?
 * - gaps: list of missing or unclear points
 * - suggestion: one-line recommendation for the officer
 *
 * Returns null if the AI is not configured or the call fails.
 */
export async function analyseReport(reportText: string): Promise<{
  consistent: boolean;
  gaps: string[];
  suggestion: string;
} | null> {
  if (!isAiConfigured()) return null;

  try {
    const raw = await askClaude(
      `You are an experienced senior police officer reviewing an inquiry report (जाँच आख्या).
Analyse the report and reply with ONLY valid JSON in this exact shape:
{"consistent": true|false, "gaps": ["...", "..."], "suggestion": "..."}
No markdown, no extra text — just the JSON object.`,
      reportText,
      "claude-sonnet-4-6",
      1024
    );

    return JSON.parse(stripFences(raw));
  } catch (err) {
    console.error("[ai] Report analysis failed:", err);
    return null;
  }
}

const _nameMatchCache = new Map<string, { result: string | null; expires: number }>();

/**
 * Uses Claude to find which CCTNS-scraped name best matches a profile name.
 * CCTNS names are often all-caps ("ASHOK KUMAR PATHAK") while profiles may
 * differ in capitalisation, initials, or spelling. Returns the best-matching
 * CCTNS name from the list, or null if no plausible match is found.
 * Results are cached in-process for 1 hour to avoid repeated API calls.
 */
export async function matchIoName(
  profileName: string,
  cctnsNames: string[]
): Promise<string | null> {
  if (!isAiConfigured() || !profileName.trim() || cctnsNames.length === 0) return null;

  const cacheKey = profileName.trim().toLowerCase();
  const cached = _nameMatchCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.result;

  try {
    const raw = await askClaude(
      `You match Indian police officer names. Given a profile name and a list of CCTNS portal names, return the CCTNS name that refers to the same person (allowing for differences in caps, spelling, initials, or word order).
Reply with ONLY the exact matching CCTNS name as it appears in the list, or the word null if no name is a plausible match for the same person.
No explanation. No quotes. Just the name or the word null.`,
      `Profile name: ${profileName.trim()}\n\nCCTNS names:\n${cctnsNames.join("\n")}`,
      "claude-haiku-4-5-20251001",
      100
    );

    const trimmed = raw.trim();
    const result = trimmed === "null" || !cctnsNames.includes(trimmed) ? null : trimmed;
    _nameMatchCache.set(cacheKey, { result, expires: Date.now() + 60 * 60 * 1_000 });
    return result;
  } catch (err) {
    console.error("[ai] IO name matching failed:", err);
    return null;
  }
}

/**
 * Given a Jan Sunwai petition text, suggests a relevant IPC section and a
 * concise summary for the IO. Returns null if AI is not configured.
 */
export async function analysePetition(petitionText: string): Promise<{
  suggestedSection: string;
  summary: string;
} | null> {
  if (!isAiConfigured()) return null;

  try {
    const raw = await askClaude(
      `You are a legal assistant helping an Indian police officer understand a Jan Sunwai petition.
Reply with ONLY valid JSON in this exact shape:
{"suggestedSection": "IPC section or 'N/A'", "summary": "2-3 sentence plain-language summary in English"}
No markdown, no extra text — just the JSON object.`,
      petitionText,
      "claude-sonnet-4-6",
      512
    );

    return JSON.parse(stripFences(raw));
  } catch (err) {
    console.error("[ai] Petition analysis failed:", err);
    return null;
  }
}

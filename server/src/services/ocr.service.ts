import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";
import { stripFences } from "./ai.service";

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

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export interface OcrEntities {
  names: string[];
  dates: string[];
  addresses: string[];
  phoneNumbers: string[];
  firNumbers: string[];
  actsAndSections: string[];
}

export interface OcrResult {
  extractedText: string;
  confidence: number;
  languageDetected: "hindi" | "english" | "mixed" | "unknown";
  entities: OcrEntities;
  keywords: string[];
}

const SYSTEM_PROMPT = `You are an OCR and document-analysis engine for an Indian police department's internal app. You will be given an image or PDF of a scanned document — typically a complaint, FIR, notice, court order, identity proof, or similar official paperwork, written in Hindi (Devanagari script), English, or a mix of both.

Your task:
1. Extract ALL visible text exactly as written, preserving line breaks and the original language/script (do NOT translate).
2. Estimate your confidence in the extraction, from 0 to 1.
3. Detect the primary language of the document: "hindi", "english", or "mixed".
4. Identify key entities mentioned in the document.
5. List 5-10 short keywords/topics summarising the document's subject matter.

Reply with ONLY valid JSON in this exact shape — no markdown, no extra text:
{
  "extractedText": "...",
  "confidence": 0.0,
  "languageDetected": "hindi" | "english" | "mixed",
  "entities": {
    "names": ["..."],
    "dates": ["..."],
    "addresses": ["..."],
    "phoneNumbers": ["..."],
    "firNumbers": ["..."],
    "actsAndSections": ["..."]
  },
  "keywords": ["..."]
}

If a category has no entries, use an empty array []. If the image/PDF is unreadable, blank, or contains no text, set "extractedText" to "" and "confidence" to 0, but still return the full JSON shape.`;

/**
 * Runs OCR + entity/keyword extraction on a scanned document using Claude's
 * vision (images) or native document (PDF) support. Throws on failure —
 * callers should catch and persist the error against the scan record.
 */
export async function runOcr(buffer: Buffer, mimeType: string): Promise<OcrResult> {
  const client = getClient();
  const isPdf = mimeType === "application/pdf";

  if (!isPdf && !SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`Unsupported file type for OCR: ${mimeType}`);
  }

  const data = buffer.toString("base64");
  const content: Anthropic.Messages.ContentBlockParam[] = isPdf
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
        { type: "text", text: "Extract and analyse the text in this document." },
      ]
    : [
        { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data } },
        { type: "text", text: "Extract and analyse the text in this image." },
      ];

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  const block = response.content[0];
  const raw = block.type === "text" ? block.text : "";
  const parsed = JSON.parse(stripFences(raw));

  const entities = parsed.entities ?? {};
  return {
    extractedText: typeof parsed.extractedText === "string" ? parsed.extractedText : "",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    languageDetected: ["hindi", "english", "mixed"].includes(parsed.languageDetected) ? parsed.languageDetected : "unknown",
    entities: {
      names: Array.isArray(entities.names) ? entities.names : [],
      dates: Array.isArray(entities.dates) ? entities.dates : [],
      addresses: Array.isArray(entities.addresses) ? entities.addresses : [],
      phoneNumbers: Array.isArray(entities.phoneNumbers) ? entities.phoneNumbers : [],
      firNumbers: Array.isArray(entities.firNumbers) ? entities.firNumbers : [],
      actsAndSections: Array.isArray(entities.actsAndSections) ? entities.actsAndSections : [],
    },
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
  };
}

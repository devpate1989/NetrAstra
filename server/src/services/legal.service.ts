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

// Bound the amount of text sent to Claude per analysis (cost + latency control).
export const MAX_INPUT_CHARS = 15000;

export type AnalysisMode = "quick" | "deep";

export interface KeyFacts {
  parties: string[];
  dates: string[];
  locations: string[];
  amounts: string[];
}

export interface SectionRef {
  act: string;
  section: string;
  title: string;
  relevance: string;
  oldEquivalent: { act: string; section: string } | null;
}

export interface DetailedAnalysis {
  detailedReasoning: string;
  proceduralRequirements: string[];
  evidentiaryConsiderations: string[];
  similarProvisions: SectionRef[];
  draftingNotes: string;
}

export interface LegalAnalysisResult {
  caseType: string;
  summary: string;
  applicableSections: SectionRef[];
  keyFacts: KeyFacts;
  recommendedActions: string[];
  detailedAnalysis: DetailedAnalysis | null;
}

const SHARED_CONTEXT = `You are a legal assistant helping an Indian police Investigating Officer (IO) understand a document or case description.

India's criminal law was re-codified effective 1 July 2024:
- The Indian Penal Code (IPC) 1860 was replaced by the Bharatiya Nyaya Sanhita (BNS) 2023.
- The Code of Criminal Procedure (CrPC) 1973 was replaced by the Bharatiya Nagarik Suraksha Sanhita (BNSS) 2023.
- The Indian Evidence Act 1872 was replaced by the Bharatiya Sakshya Adhiniyam (BSA) 2023.

Always cite the CURRENT law (BNS/BNSS/BSA section numbers) as the primary reference. Where you know the
old IPC/CrPC/Evidence Act equivalent, include it as "oldEquivalent" — otherwise set it to null. Do not
guess at section numbers you are unsure of; prefer fewer, well-grounded sections over many speculative ones.

The input text may be in Hindi, English, or a mix of both (it may be raw OCR output and contain noise).
Base your analysis only on the facts present in the text — do not invent facts. If the text does not
describe a legal/criminal matter, return an empty applicableSections array and say so in the summary.`;

const SECTION_SHAPE = `{"act": "BNS"|"BNSS"|"BSA"|"Other", "section": "section number", "title": "short title of the provision", "relevance": "1 sentence on why this section applies here", "oldEquivalent": {"act": "IPC"|"CrPC"|"Evidence Act", "section": "..."} or null}`;

const QUICK_SYSTEM_PROMPT = `${SHARED_CONTEXT}

Reply with ONLY valid JSON in this exact shape:
{
  "caseType": "short classification, e.g. 'Theft', 'Domestic Dispute', 'Cheating / Fraud'",
  "summary": "2-4 sentence plain-language summary of the situation, in English",
  "applicableSections": [${SECTION_SHAPE}],
  "keyFacts": {"parties": ["..."], "dates": ["..."], "locations": ["..."], "amounts": ["..."]},
  "recommendedActions": ["short, concrete next steps for the IO"]
}
No markdown, no extra text — just the JSON object.`;

const DEEP_SYSTEM_PROMPT = `${SHARED_CONTEXT}

This is "Deep Research Mode" — provide a thorough, multi-section legal analysis suitable for an IO
preparing a case file or inquiry report. Reply with ONLY valid JSON in this exact shape:
{
  "caseType": "short classification, e.g. 'Theft', 'Domestic Dispute', 'Cheating / Fraud'",
  "summary": "2-4 sentence plain-language summary of the situation, in English",
  "applicableSections": [${SECTION_SHAPE}],
  "keyFacts": {"parties": ["..."], "dates": ["..."], "locations": ["..."], "amounts": ["..."]},
  "recommendedActions": ["short, concrete next steps for the IO"],
  "detailedAnalysis": {
    "detailedReasoning": "multi-paragraph legal reasoning connecting the facts to each applicable section",
    "proceduralRequirements": ["BNSS procedural steps that apply, e.g. timelines, sanctions, who must record what"],
    "evidentiaryConsiderations": ["BSA evidentiary points relevant to proving this case"],
    "similarProvisions": [${SECTION_SHAPE}],
    "draftingNotes": "guidance for how to phrase the relevant parts of the inquiry report / FIR"
  }
}
"similarProvisions" should list related or overlapping sections worth considering alongside the primary
applicableSections (e.g. alternative charges, aggravated forms). No markdown, no extra text — just the JSON object.`;

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeSections(value: unknown): SectionRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => {
      const oldEq = item.oldEquivalent;
      const oldEquivalent =
        oldEq && typeof oldEq === "object"
          ? {
              act: typeof (oldEq as Record<string, unknown>).act === "string" ? ((oldEq as Record<string, unknown>).act as string) : "",
              section:
                typeof (oldEq as Record<string, unknown>).section === "string" ? ((oldEq as Record<string, unknown>).section as string) : "",
            }
          : null;

      return {
        act: typeof item.act === "string" ? item.act : "Other",
        section: typeof item.section === "string" ? item.section : "",
        title: typeof item.title === "string" ? item.title : "",
        relevance: typeof item.relevance === "string" ? item.relevance : "",
        oldEquivalent: oldEquivalent && oldEquivalent.act && oldEquivalent.section ? oldEquivalent : null,
      };
    })
    .filter((section) => section.section);
}

function normalizeKeyFacts(value: unknown): KeyFacts {
  const obj = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  return {
    parties: arrayOfStrings(obj.parties),
    dates: arrayOfStrings(obj.dates),
    locations: arrayOfStrings(obj.locations),
    amounts: arrayOfStrings(obj.amounts),
  };
}

function normalizeDetailedAnalysis(value: unknown): DetailedAnalysis | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  return {
    detailedReasoning: typeof obj.detailedReasoning === "string" ? obj.detailedReasoning : "",
    proceduralRequirements: arrayOfStrings(obj.proceduralRequirements),
    evidentiaryConsiderations: arrayOfStrings(obj.evidentiaryConsiderations),
    similarProvisions: normalizeSections(obj.similarProvisions),
    draftingNotes: typeof obj.draftingNotes === "string" ? obj.draftingNotes : "",
  };
}

/**
 * Runs Claude legal analysis over the given text. "quick" uses claude-haiku-4-5
 * for a fast classification + applicable-sections summary; "deep" uses
 * claude-sonnet-4-6 with a larger output budget for a multi-section research
 * report. Throws on failure — the caller persists `status: "failed"`.
 */
export async function analyzeLegalText(text: string, mode: AnalysisMode): Promise<LegalAnalysisResult> {
  const trimmed = text.trim().slice(0, MAX_INPUT_CHARS);
  if (!trimmed) {
    throw new Error("No text provided for analysis");
  }

  const client = getClient();
  const isDeep = mode === "deep";

  const response = await client.messages.create({
    model: isDeep ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001",
    max_tokens: isDeep ? 4096 : 1536,
    system: isDeep ? DEEP_SYSTEM_PROMPT : QUICK_SYSTEM_PROMPT,
    messages: [{ role: "user", content: trimmed }],
  });

  const block = response.content[0];
  const raw = block.type === "text" ? block.text : "";
  const parsed = JSON.parse(stripFences(raw));

  return {
    caseType: typeof parsed.caseType === "string" ? parsed.caseType : "Unclassified",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    applicableSections: normalizeSections(parsed.applicableSections),
    keyFacts: normalizeKeyFacts(parsed.keyFacts),
    recommendedActions: arrayOfStrings(parsed.recommendedActions),
    detailedAnalysis: isDeep ? normalizeDetailedAnalysis(parsed.detailedAnalysis) : null,
  };
}

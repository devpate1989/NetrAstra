import Anthropic from "@anthropic-ai/sdk";
import XLSX from "xlsx";
import { env } from "../config/env";

export interface ParsedUserRow {
  username: string;
  fullName: string;
  password: string;
  role: "io" | "sho" | "admin";
  phone?: string;
  autoPassword: boolean;
}

interface FieldMapping {
  username?: string;
  fullName?: string;
  password?: string;
  role?: string;
  phone?: string;
}

function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function normalizeRole(raw: string | undefined): "io" | "sho" | "admin" {
  const v = (raw ?? "").toLowerCase().trim();
  if (v === "sho") return "sho";
  if (v === "admin" || v === "administrator") return "admin";
  return "io";
}

/** Derives a login username from a full name: "Rajesh Kumar" → "rajesh.kumar" */
function usernameFromName(fullName: string, rowIndex: number): string {
  const parts = fullName.toLowerCase().trim().split(/\s+/);
  const base =
    parts.length >= 2
      ? `${parts[0]}.${parts[parts.length - 1]}`
      : parts[0] || `officer${rowIndex}`;
  const slug = base.replace(/[^a-z0-9.]/g, "").slice(0, 24);
  // Append row number to guarantee uniqueness within the same import batch
  return `${slug || `officer${rowIndex}`}.r${rowIndex}`;
}

async function inferMapping(headers: string[], sampleRows: Record<string, string>[]): Promise<FieldMapping> {
  if (!env.claudeApiKey) return fuzzyFallbackMapping(headers);

  const client = new Anthropic({ apiKey: env.claudeApiKey });
  const prompt = [
    "Map these Excel column headers to user-account fields.",
    "",
    `Column headers: ${JSON.stringify(headers)}`,
    "",
    `Sample data (first ${sampleRows.length} rows):`,
    JSON.stringify(sampleRows, null, 2),
    "",
    "Target fields:",
    "  username    — login username / user ID (required; derive from name if absent)",
    "  fullName    — officer's full name (required)",
    "  password    — initial password (optional; auto-generated if absent)",
    "  role        — io | sho | admin (optional, default io)",
    "  phone       — mobile number (optional)",
    "",
    "Return ONLY a JSON object mapping each target field to the best-matching column header (or null if no good match).",
    'Example: {"username":"User ID","fullName":"Full Name","role":"Designation","phone":"Mobile","password":null}',
  ].join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fuzzyFallbackMapping(headers);

  try {
    return JSON.parse(jsonMatch[0]) as FieldMapping;
  } catch {
    return fuzzyFallbackMapping(headers);
  }
}

function fuzzyFallbackMapping(headers: string[]): FieldMapping {
  const find = (...keywords: string[]) =>
    headers.find((h) => keywords.some((k) => h.toLowerCase().includes(k))) ?? undefined;

  return {
    username: find("username", "user id", "userid", "login", "user name"),
    fullName: find("name", "full", "नाम", "officer"),
    password: find("password", "pass", "pwd"),
    role: find("role", "designation", "पद", "rank"),
    phone: find("phone", "mobile", "mob", "contact", "फोन"),
  };
}

export async function parseExcelUsers(base64: string): Promise<ParsedUserRow[]> {
  const buffer = Buffer.from(base64, "base64");

  const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: false, cellHTML: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file has no sheets");

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  });

  if (rawRows.length === 0) throw new Error("Excel sheet is empty");

  // Sanitize: cast every cell to string, blocking prototype-pollution keys
  const rows = rawRows.map((r) => {
    const safe: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      if (typeof k === "string" && !Object.prototype.hasOwnProperty.call(Object.prototype, k)) {
        safe[k] = String(v ?? "").trim();
      }
    }
    return safe;
  });

  const headers = Object.keys(rows[0] ?? {});
  const mapping = await inferMapping(headers, rows.slice(0, 3));

  const parsed: ParsedUserRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fullName = mapping.fullName ? row[mapping.fullName] : "";

    // Skip truly empty rows
    if (!fullName) continue;

    const rawUsername = mapping.username ? row[mapping.username] : "";
    const username = (rawUsername || usernameFromName(fullName, i + 2))
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 30);

    const rawPassword = mapping.password ? row[mapping.password] : "";
    const autoPassword = !rawPassword || rawPassword.length < 8;
    const password = autoPassword ? randomPassword() : rawPassword;

    parsed.push({
      username,
      fullName,
      password,
      autoPassword,
      role: normalizeRole(mapping.role ? row[mapping.role] : undefined),
      phone: mapping.phone ? row[mapping.phone] || undefined : undefined,
    });
  }

  return parsed;
}

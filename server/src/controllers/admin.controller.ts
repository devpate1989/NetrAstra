import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { env } from "../config/env";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { sendVerificationEmail } from "../services/email.service";
import { parseExcelUsers } from "../services/bulkImport.service";

const ROLES = ["io", "sho", "admin"] as const;

/** Generates the internal-only Supabase Auth email for a given username. */
function internalEmail(username: string): string {
  const station = (env.policeStationName || "police").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${username.toLowerCase()}@${station}.internal`;
}

const createUserSchema = z.object({
  username: z.string().min(2).regex(/^[a-z0-9._-]+$/i, "Username may only contain letters, numbers, dots, hyphens, and underscores"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2),
  role: z.enum(ROLES).default("io"),
  phone: z.string().optional(),
});

const updateUserSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    fullName: z.string().min(2).optional(),
    username: z.string().min(2).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, { message: "Provide at least one field to update" });

function toUserDto(row: Record<string, any>) {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    policeStation: row.police_station,
    district: row.district,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const input = createUserSchema.parse(req.body);
  const username = input.username.toLowerCase();
  const email = internalEmail(username);

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });

  if (createError || !created?.user) {
    throw new HttpError(400, createError?.message ?? "Could not create account");
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: created.user.id,
    email,
    username,
    full_name: input.fullName,
    role: input.role,
    police_station: env.policeStationName || null,
    district: env.policeDistrictName || null,
    phone: input.phone ?? null,
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    throw new HttpError(400, `Could not create profile: ${profileError.message}`);
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, username, full_name, role, police_station, district, phone, avatar_url, created_at")
    .eq("id", created.user.id)
    .single();

  res.status(201).json({ user: profile ? toUserDto(profile) : { id: created.user.id } });
});

export const listUsers = asyncHandler(async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, username, full_name, role, police_station, district, phone, avatar_url, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new HttpError(400, error.message);

  res.json({ users: (data ?? []).map(toUserDto) });
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const resetUserPassword = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { password } = resetPasswordSchema.parse(req.body);

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
  if (error) throw new HttpError(400, error.message);

  res.json({ ok: true });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input = updateUserSchema.parse(req.body);

  const updates: Record<string, unknown> = {};
  if (input.role !== undefined) updates.role = input.role;
  if (input.fullName !== undefined) updates.full_name = input.fullName;
  if (input.username !== undefined) updates.username = input.username.toLowerCase();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select("id, username, full_name, role, police_station, district, phone, avatar_url, created_at")
    .single();

  if (error || !data) throw new HttpError(400, error?.message ?? "Could not update this user");

  res.json({ user: toUserDto(data) });
});

// ── Bulk import ──────────────────────────────────────────────────────────────

const bulkImportSchema = z.object({
  base64: z.string().min(1),
  fileName: z.string().min(1),
});

export interface BulkImportRowResult {
  row: number;
  username: string;
  fullName: string;
  status: "created" | "failed" | "skipped";
  password?: string;
  error?: string;
}

export const bulkCreateUsers = asyncHandler(async (req: Request, res: Response) => {
  const { base64, fileName } = bulkImportSchema.parse(req.body);

  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!["xlsx", "xls"].includes(ext ?? "")) {
    throw new HttpError(400, "Only .xlsx and .xls files are supported");
  }

  const rows = await parseExcelUsers(base64).catch((err) => {
    throw new HttpError(400, `Could not parse Excel file: ${err.message}`);
  });

  if (rows.length === 0) throw new HttpError(400, "No valid rows found in the Excel file");

  const results: BulkImportRowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!row.username || !row.fullName) {
      results.push({ row: rowNum, username: row.username || "?", fullName: row.fullName || "?", status: "skipped", error: "Missing username or full name" });
      continue;
    }

    const email = internalEmail(row.username);

    try {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: row.password,
        email_confirm: true,
      });

      if (createError || !created?.user) {
        results.push({ row: rowNum, username: row.username, fullName: row.fullName, status: "failed", error: createError?.message ?? "Auth creation failed" });
        continue;
      }

      const { error: profileError } = await supabaseAdmin.from("profiles").insert({
        id: created.user.id,
        email,
        username: row.username,
        full_name: row.fullName,
        role: row.role,
        police_station: env.policeStationName || null,
        district: env.policeDistrictName || null,
        phone: row.phone ?? null,
      });

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        results.push({ row: rowNum, username: row.username, fullName: row.fullName, status: "failed", error: `Profile error: ${profileError.message}` });
        continue;
      }

      results.push({
        row: rowNum,
        username: row.username,
        fullName: row.fullName,
        status: "created",
        password: row.autoPassword ? row.password : undefined,
      });
    } catch (err) {
      results.push({ row: rowNum, username: row.username, fullName: row.fullName, status: "failed", error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  res.status(201).json({ totalRows: rows.length, created, failed, skipped, results });
});

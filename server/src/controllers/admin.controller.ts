import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { env } from "../config/env";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { sendVerificationEmail } from "../services/email.service";

const ROLES = ["io", "sho", "admin"] as const;

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2),
  role: z.enum(ROLES).default("io"),
  policeStation: z.string().optional(),
  district: z.string().optional(),
  phone: z.string().optional(),
});

const updateUserSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    fullName: z.string().min(2).optional(),
    policeStation: z.string().optional(),
    district: z.string().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, { message: "Provide at least one field to update" });

function toUserDto(row: Record<string, any>) {
  return {
    id: row.id,
    email: row.email,
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

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (createError || !created?.user) {
    throw new HttpError(400, createError?.message ?? "Could not create account");
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: created.user.id,
    full_name: input.fullName,
    role: input.role,
    police_station: input.policeStation ?? null,
    district: input.district ?? null,
    phone: input.phone ?? null,
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    throw new HttpError(400, `Could not create profile: ${profileError.message}`);
  }

  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "signup",
    email: input.email,
    password: input.password,
    options: { redirectTo: `${env.appUrl}/reset-password` },
  });

  if (!linkError && link?.properties?.action_link) {
    await sendVerificationEmail(input.email, link.properties.action_link);
  } else {
    console.warn(`[admin] Could not send verification email to ${input.email}:`, linkError?.message);
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role, police_station, district, phone, avatar_url, created_at")
    .eq("id", created.user.id)
    .single();

  res.status(201).json({ user: profile ? toUserDto(profile) : { id: created.user.id } });
});

export const listUsers = asyncHandler(async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role, police_station, district, phone, avatar_url, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(400, error.message);
  }

  res.json({ users: (data ?? []).map(toUserDto) });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input = updateUserSchema.parse(req.body);

  const updates: Record<string, unknown> = {};
  if (input.role !== undefined) updates.role = input.role;
  if (input.fullName !== undefined) updates.full_name = input.fullName;
  if (input.policeStation !== undefined) updates.police_station = input.policeStation;
  if (input.district !== undefined) updates.district = input.district;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select("id, email, full_name, role, police_station, district, phone, avatar_url, created_at")
    .single();

  if (error || !data) {
    throw new HttpError(400, error?.message ?? "Could not update this user");
  }

  res.json({ user: toUserDto(data) });
});

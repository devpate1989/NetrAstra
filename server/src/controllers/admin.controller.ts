import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { asyncHandler, HttpError } from "../middleware/errorHandler";

const ROLES = ["io", "sho", "admin"] as const;

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

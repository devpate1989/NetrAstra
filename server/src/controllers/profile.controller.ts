import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { asyncHandler, HttpError } from "../middleware/errorHandler";

const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  policeStation: z.string().optional(),
  district: z.string().optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

export const getMyProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, role, police_station, district, phone, avatar_url, created_at")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    throw new HttpError(404, "Profile not found");
  }

  res.json({
    id: profile.id,
    email: req.user!.email,
    fullName: profile.full_name,
    role: profile.role,
    policeStation: profile.police_station,
    district: profile.district,
    phone: profile.phone,
    avatarUrl: profile.avatar_url,
    createdAt: profile.created_at,
  });
});

export const updateMyProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const input = updateProfileSchema.parse(req.body);

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .update({
      ...(input.fullName !== undefined && { full_name: input.fullName }),
      ...(input.policeStation !== undefined && { police_station: input.policeStation }),
      ...(input.district !== undefined && { district: input.district }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.avatarUrl !== undefined && { avatar_url: input.avatarUrl }),
    })
    .eq("id", userId)
    .select("id, full_name, role, police_station, district, phone, avatar_url")
    .single();

  if (error || !profile) {
    throw new HttpError(400, error?.message ?? "Could not update profile");
  }

  res.json({
    id: profile.id,
    fullName: profile.full_name,
    role: profile.role,
    policeStation: profile.police_station,
    district: profile.district,
    phone: profile.phone,
    avatarUrl: profile.avatar_url,
  });
});

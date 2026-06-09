import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin, supabaseAnon } from "../config/supabase";
import { env } from "../config/env";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
} from "../services/email.service";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const resetPasswordSchema = z.object({
  accessToken: z.string().min(10),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);

  // Resolve the internal auth email from the username stored in profiles
  const { data: profile, error: profileLookupError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role, police_station, district, username")
    .eq("username", input.username.trim().toLowerCase())
    .single();

  if (profileLookupError || !profile?.email) {
    throw new HttpError(401, "Invalid username or password");
  }

  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email: profile.email,
    password: input.password,
  });

  if (error || !data?.session || !data.user) {
    throw new HttpError(401, "Invalid username or password");
  }

  res.json({
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    },
    user: {
      id: data.user.id,
      username: profile.username,
      fullName: profile.full_name,
      role: profile.role,
      policeStation: profile.police_station,
      district: profile.district,
    },
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = resetPasswordSchema.parse(req.body);

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(input.accessToken);
  if (userError || !userData?.user) {
    throw new HttpError(400, "This password reset link is invalid or has expired");
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userData.user.id, {
    password: input.newPassword,
  });

  if (updateError) {
    throw new HttpError(400, updateError.message);
  }

  if (userData.user.email) {
    await sendPasswordChangedEmail(userData.user.email).catch(() => null);
  }

  res.json({ message: "Your password has been reset. You can now log in with your new password." });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new HttpError(401, "Authentication required");
  }
  const input = changePasswordSchema.parse(req.body);

  // req.user.email holds the internal auth email (from the JWT) — use it to re-authenticate
  const { error: verifyError } = await supabaseAnon.auth.signInWithPassword({
    email: req.user.email,
    password: input.currentPassword,
  });
  if (verifyError) {
    throw new HttpError(401, "Your current password is incorrect");
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
    password: input.newPassword,
  });
  if (updateError) {
    throw new HttpError(400, updateError.message);
  }

  await sendPasswordChangedEmail(req.user.email).catch(() => null);

  res.json({ message: "Your password has been updated." });
});

// Admin-triggered password reset: generate a reset link for a given username.
export const adminResetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { username } = z.object({ username: z.string().min(1) }).parse(req.body);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("username", username.trim().toLowerCase())
    .single();

  if (!profile?.email) {
    throw new HttpError(404, "No account found with that username");
  }

  const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email: profile.email,
    options: { redirectTo: `${env.appUrl}/reset-password` },
  });

  if (error || !link?.properties?.action_link) {
    throw new HttpError(500, "Could not generate reset link");
  }

  res.json({ resetLink: link.properties.action_link });
});

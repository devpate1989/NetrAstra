import { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin, supabaseAnon } from "../config/supabase";
import { env } from "../config/env";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/email.service";

// Public self-registration may only create operational accounts (IO/SHO).
// "admin" is intentionally excluded — admin accounts are provisioned/promoted
// by an existing admin via the user-management endpoints (see admin.controller.ts),
// never chosen by the registrant. This prevents trivial privilege escalation.
const SELF_REGISTERABLE_ROLES = ["io", "sho"] as const;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2),
  role: z.enum(SELF_REGISTERABLE_ROLES).default("io"),
  policeStation: z.string().optional(),
  district: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  accessToken: z.string().min(10),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: false,
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
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    throw new HttpError(400, `Could not create profile: ${profileError.message}`);
  }

  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "signup",
    email: input.email,
    password: input.password,
    options: { redirectTo: `${env.appUrl}/verify-email` },
  });

  if (!linkError && link?.properties?.action_link) {
    await sendVerificationEmail(input.email, link.properties.action_link);
  } else {
    console.warn(`[auth] Could not generate verification link for ${input.email}:`, linkError?.message);
  }

  res.status(201).json({
    message: "Account created. Please check your email to verify your account.",
    userId: created.user.id,
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);

  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data?.session || !data.user) {
    throw new HttpError(401, "Invalid email or password");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, role, police_station, district")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    throw new HttpError(403, "No profile found for this account");
  }

  res.json({
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    },
    user: {
      id: data.user.id,
      email: data.user.email,
      fullName: profile.full_name,
      role: profile.role,
      policeStation: profile.police_station,
      district: profile.district,
    },
  });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = forgotPasswordSchema.parse(req.body);

  const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email: input.email,
    options: { redirectTo: `${env.appUrl}/reset-password` },
  });

  // Always respond with the same message to avoid leaking which emails are registered.
  if (!error && link?.properties?.action_link) {
    await sendPasswordResetEmail(input.email, link.properties.action_link);
  } else {
    console.warn(`[auth] Could not generate recovery link for ${input.email}:`, error?.message);
  }

  res.json({ message: "If an account exists for that email, a reset link has been sent." });
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
    await sendPasswordChangedEmail(userData.user.email);
  }

  res.json({ message: "Your password has been reset. You can now log in with your new password." });
});

// Authenticated "change password from account settings" flow — distinct from
// resetPassword (which trusts a one-time recovery-link token instead).
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new HttpError(401, "Authentication required");
  }
  const input = changePasswordSchema.parse(req.body);

  // Re-authenticate with the current password before allowing the change —
  // the access token alone isn't proof the caller knows the existing password.
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

  await sendPasswordChangedEmail(req.user.email);

  res.json({ message: "Your password has been updated." });
});

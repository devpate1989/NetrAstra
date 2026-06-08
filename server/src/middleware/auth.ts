import { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import { AuthUser, UserRole } from "../types";
import { asyncHandler, HttpError } from "./errorHandler";

/**
 * Verifies the Supabase Auth JWT sent as `Authorization: Bearer <token>`,
 * loads the matching `profiles` row (role, full name, station, district),
 * and attaches it to `req.user`. Reject the request if anything is missing.
 */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    throw new HttpError(401, "Missing or invalid Authorization header");
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    throw new HttpError(401, "Invalid or expired session");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, role, police_station, district")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) {
    throw new HttpError(403, "No profile found for this account");
  }

  const authUser: AuthUser = {
    id: userData.user.id,
    email: userData.user.email ?? "",
    role: profile.role as UserRole,
    fullName: profile.full_name ?? undefined,
    policeStation: profile.police_station ?? undefined,
    district: profile.district ?? undefined,
  };

  req.user = authUser;
  next();
});

/**
 * Restricts a route to one or more roles. Must run after `requireAuth`.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new HttpError(401, "Authentication required");
    }
    if (!roles.includes(req.user.role)) {
      throw new HttpError(403, "You do not have permission to access this resource");
    }
    next();
  };
}

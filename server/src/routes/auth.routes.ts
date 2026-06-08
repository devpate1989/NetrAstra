import { Router } from "express";
import { changePassword, forgotPassword, login, resetPassword } from "../controllers/auth.controller";
import { authRateLimiter } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

authRouter.use(authRateLimiter);

// Public self-registration is disabled — accounts are created by an Admin only
// (see POST /admin/users in admin.routes.ts).
authRouter.post("/login", login);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.post("/change-password", requireAuth, changePassword);

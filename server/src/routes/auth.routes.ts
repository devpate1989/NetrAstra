import { Router } from "express";
import { adminResetPassword, changePassword, forgotPassword, login, resetPassword } from "../controllers/auth.controller";
import { authRateLimiter } from "../middleware/rateLimit";
import { requireAuth, requireRole } from "../middleware/auth";

export const authRouter = Router();

authRouter.use(authRateLimiter);

authRouter.post("/login", login);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.post("/change-password", requireAuth, changePassword);
authRouter.post("/admin-reset-password", requireAuth, requireRole("admin"), adminResetPassword);

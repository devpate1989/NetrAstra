import { Router } from "express";
import { changePassword, forgotPassword, login, register, resetPassword } from "../controllers/auth.controller";
import { authRateLimiter } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

authRouter.use(authRateLimiter);

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.post("/change-password", requireAuth, changePassword);

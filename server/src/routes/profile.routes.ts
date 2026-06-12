import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getMyProfile, registerPushToken, updateMyProfile } from "../controllers/profile.controller";

export const profileRouter = Router();

profileRouter.use(requireAuth);
profileRouter.get("/me", getMyProfile);
profileRouter.patch("/me", updateMyProfile);
profileRouter.post("/push-token", registerPushToken);

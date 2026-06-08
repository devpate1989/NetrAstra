import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getMyProfile, updateMyProfile } from "../controllers/profile.controller";

export const profileRouter = Router();

profileRouter.use(requireAuth);
profileRouter.get("/me", getMyProfile);
profileRouter.patch("/me", updateMyProfile);

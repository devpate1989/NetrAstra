import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { scrapeRateLimiter } from "../middleware/rateLimit";
import { listInvestigations, refreshInvestigations, updateInvestigation } from "../controllers/investigations.controller";

export const investigationsRouter = Router();

investigationsRouter.use(requireAuth);

investigationsRouter.get("/", listInvestigations);
investigationsRouter.post("/refresh", requireRole("sho", "admin"), scrapeRateLimiter, refreshInvestigations);
investigationsRouter.patch("/:id", requireRole("admin"), updateInvestigation);

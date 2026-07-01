import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { scrapeRateLimiter } from "../middleware/rateLimit";
import { listInvestigations, refreshInvestigations, updateInvestigation, syncFirPdfs } from "../controllers/investigations.controller";

export const investigationsRouter = Router();

investigationsRouter.use(requireAuth);

investigationsRouter.get("/", listInvestigations);
investigationsRouter.post("/refresh", requireRole("sho", "admin"), scrapeRateLimiter, refreshInvestigations);
investigationsRouter.post("/pdf-sync", requireRole("sho", "admin"), scrapeRateLimiter, syncFirPdfs);
investigationsRouter.patch("/:id", requireRole("admin"), updateInvestigation);

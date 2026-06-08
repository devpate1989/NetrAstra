import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { listInvestigations, refreshInvestigations, updateInvestigation } from "../controllers/investigations.controller";

export const investigationsRouter = Router();

investigationsRouter.use(requireAuth, requireRole("sho", "admin"));

investigationsRouter.get("/", listInvestigations);
investigationsRouter.post("/refresh", refreshInvestigations);
investigationsRouter.patch("/:id", requireRole("admin"), updateInvestigation);

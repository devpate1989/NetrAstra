import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { legalAnalysisRateLimiter } from "../middleware/rateLimit";
import {
  analyzeText,
  deleteAnalysis,
  getAnalysis,
  listAnalyses,
  searchBnsMappings,
} from "../controllers/legal.controller";

export const legalRouter = Router();
legalRouter.use(requireAuth);

legalRouter.get("/bns-lookup", searchBnsMappings);
legalRouter.get("/", listAnalyses);
legalRouter.post("/analyze", legalAnalysisRateLimiter, analyzeText);
legalRouter.get("/:id", getAnalysis);
legalRouter.delete("/:id", deleteAnalysis);

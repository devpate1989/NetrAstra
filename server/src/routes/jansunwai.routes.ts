import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { scrapeRateLimiter } from "../middleware/rateLimit";
import {
  allotApplication,
  getApplication,
  listAllApplications,
  listIoOfficers,
  listPendingApplications,
  listReferenceSummary,
  refreshApplications,
  refreshReferenceSummary,
} from "../controllers/jansunwai.controller";

export const jansunwaiRouter = Router();

jansunwaiRouter.use(requireAuth);

// IO-facing — own pending applications
jansunwaiRouter.get("/pending", listPendingApplications);

// SHO/Admin — allotment management
jansunwaiRouter.get("/all", requireRole("sho", "admin"), listAllApplications);
jansunwaiRouter.get("/officers", requireRole("sho", "admin"), listIoOfficers);
jansunwaiRouter.patch("/:id/allot", requireRole("sho", "admin"), allotApplication);

// SHO/Admin — category-wise (संदर्भ प्रकार) unmark / office-pending / total summary
jansunwaiRouter.get("/reference-summary", requireRole("sho", "admin"), listReferenceSummary);
jansunwaiRouter.post(
  "/reference-summary/refresh",
  requireRole("sho", "admin"),
  scrapeRateLimiter,
  refreshReferenceSummary
);

// Shared
jansunwaiRouter.post("/refresh", scrapeRateLimiter, refreshApplications);
jansunwaiRouter.get("/:id", getApplication);

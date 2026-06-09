import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  allotApplication,
  getApplication,
  listAllApplications,
  listIoOfficers,
  listPendingApplications,
  refreshApplications,
} from "../controllers/jansunwai.controller";

export const jansunwaiRouter = Router();

jansunwaiRouter.use(requireAuth);

// IO-facing — own pending applications
jansunwaiRouter.get("/pending", listPendingApplications);

// SHO/Admin — allotment management
jansunwaiRouter.get("/all", requireRole("sho", "admin"), listAllApplications);
jansunwaiRouter.get("/officers", requireRole("sho", "admin"), listIoOfficers);
jansunwaiRouter.patch("/:id/allot", requireRole("sho", "admin"), allotApplication);

// Shared
jansunwaiRouter.post("/refresh", refreshApplications);
jansunwaiRouter.get("/:id", getApplication);

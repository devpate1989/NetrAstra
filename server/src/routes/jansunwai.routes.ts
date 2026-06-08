import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getApplication, listPendingApplications, refreshApplications } from "../controllers/jansunwai.controller";

export const jansunwaiRouter = Router();

jansunwaiRouter.use(requireAuth);

jansunwaiRouter.get("/pending", listPendingApplications);
jansunwaiRouter.post("/refresh", refreshApplications);
jansunwaiRouter.get("/:id", getApplication);

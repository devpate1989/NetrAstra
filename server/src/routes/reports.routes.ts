import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createReport,
  deleteReport,
  getReport,
  getReportPdfUrl,
  listReports,
  submitReport,
  updateReport,
  uploadReportFile,
} from "../controllers/reports.controller";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get("/", listReports);
reportsRouter.post("/", createReport);
reportsRouter.get("/:id", getReport);
reportsRouter.patch("/:id", updateReport);
reportsRouter.delete("/:id", deleteReport);

reportsRouter.post("/:id/files", uploadReportFile);
reportsRouter.post("/:id/submit", submitReport);
reportsRouter.get("/:id/pdf-url", getReportPdfUrl);

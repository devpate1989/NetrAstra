import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { ocrRateLimiter } from "../middleware/rateLimit";
import { deleteDocument, getDocument, listDocuments, scanDocument } from "../controllers/documents.controller";

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

documentsRouter.get("/", listDocuments);
documentsRouter.post("/scan", ocrRateLimiter, scanDocument);
documentsRouter.get("/:id", getDocument);
documentsRouter.delete("/:id", deleteDocument);

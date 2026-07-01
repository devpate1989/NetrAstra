import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getPgSummary, listPgComplaints, refreshPg, syncPgPdfs } from "../controllers/pg.controller";

export const pgRouter = Router();

pgRouter.use(requireAuth);

pgRouter.get("/summary", getPgSummary);
pgRouter.get("/pending", listPgComplaints);
pgRouter.post("/refresh", refreshPg);
pgRouter.post("/pdf-sync", syncPgPdfs);

import { Router } from "express";
import { listPersonnel, listChowkis, listThanaStaff } from "../controllers/directory.controller";
import { requireAuth } from "../middleware/auth";

export const directoryRouter = Router();

directoryRouter.use(requireAuth);

directoryRouter.get("/personnel", listPersonnel);
directoryRouter.get("/chowkis", listChowkis);
directoryRouter.get("/thana-staff", listThanaStaff);

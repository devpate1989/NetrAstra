import { Router } from "express";
import { authRouter } from "./auth.routes";
import { profileRouter } from "./profile.routes";
import { reportsRouter } from "./reports.routes";
import { investigationsRouter } from "./investigations.routes";
import { jansunwaiRouter } from "./jansunwai.routes";
import { adminRouter } from "./admin.routes";
import { directoryRouter } from "./directory.routes";
import { documentsRouter } from "./documents.routes";
import { legalRouter } from "./legal.routes";
import { notificationsRouter } from "./notifications.routes";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.json({ status: "ok" }));

apiRouter.use("/auth", authRouter);
apiRouter.use("/profile", profileRouter);
apiRouter.use("/reports", reportsRouter);
apiRouter.use("/investigations", investigationsRouter);
apiRouter.use("/jansunwai", jansunwaiRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/directory", directoryRouter);
apiRouter.use("/documents", documentsRouter);
apiRouter.use("/legal", legalRouter);
apiRouter.use("/notifications", notificationsRouter);

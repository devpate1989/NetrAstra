import { Router } from "express";
import { authRouter } from "./auth.routes";
import { profileRouter } from "./profile.routes";
import { reportsRouter } from "./reports.routes";
import { investigationsRouter } from "./investigations.routes";
import { jansunwaiRouter } from "./jansunwai.routes";
import { adminRouter } from "./admin.routes";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.json({ status: "ok" }));

apiRouter.use("/auth", authRouter);
apiRouter.use("/profile", profileRouter);
apiRouter.use("/reports", reportsRouter);
apiRouter.use("/investigations", investigationsRouter);
apiRouter.use("/jansunwai", jansunwaiRouter);
apiRouter.use("/admin", adminRouter);

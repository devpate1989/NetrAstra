import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../controllers/notifications.controller";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get("/", listNotifications);
notificationsRouter.post("/read-all", markAllNotificationsRead);
notificationsRouter.patch("/:id/read", markNotificationRead);

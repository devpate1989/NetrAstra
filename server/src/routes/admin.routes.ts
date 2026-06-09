import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { bulkCreateUsers, createUser, listUsers, resetUserPassword, updateUser } from "../controllers/admin.controller";

export const adminRouter = Router();

// Every route here is admin-only.
adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.post("/users", createUser);
adminRouter.post("/users/bulk", bulkCreateUsers);
adminRouter.get("/users", listUsers);
adminRouter.patch("/users/:id", updateUser);
adminRouter.patch("/users/:id/password", resetUserPassword);

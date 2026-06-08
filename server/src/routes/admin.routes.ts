import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { createUser, listUsers, updateUser } from "../controllers/admin.controller";

export const adminRouter = Router();

// Every route here is admin-only.
adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.post("/users", createUser);
adminRouter.get("/users", listUsers);
adminRouter.patch("/users/:id", updateUser);

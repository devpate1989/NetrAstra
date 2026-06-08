import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { listUsers, updateUser } from "../controllers/admin.controller";

export const adminRouter = Router();

// Every route here is admin-only — lets an Admin view all accounts and
// change a user's role/station/district (e.g. promote an IO to SHO/Admin).
adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.get("/users", listUsers);
adminRouter.patch("/users/:id", updateUser);

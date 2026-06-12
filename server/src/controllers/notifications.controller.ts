import { Request, Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import { asyncHandler, HttpError } from "../middleware/errorHandler";

function paramId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

function toNotificationDto(row: Record<string, any>) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/** Most-recent in-app notifications for the logged-in user. */
export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("id, type, title, body, data, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new HttpError(400, error.message);

  res.json({ notifications: (data ?? []).map(toNotificationDto) });
});

/** Marks a single notification as read. */
export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const id = paramId(req);

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, type, title, body, data, read_at, created_at")
    .single();

  if (error || !data) throw new HttpError(404, "Notification not found");

  res.json({ notification: toNotificationDto(data as unknown as Record<string, any>) });
});

/** Marks all of the logged-in user's unread notifications as read. */
export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;

  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) throw new HttpError(400, error.message);

  res.json({ ok: true });
});

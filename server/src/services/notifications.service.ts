import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { supabaseAdmin } from "../config/supabase";

const expo = new Expo();

/**
 * Inserts an in-app notification row for `userId` and, if they've registered
 * an Expo push token, sends a push notification too. Never throws — push
 * delivery failures are logged but don't block the caller (e.g. the
 * Jan Sunwai auto-assignment flow).
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    type,
    title,
    body,
    data,
  });

  if (error) {
    console.error(`[notifications] Failed to create notification for ${userId}:`, error.message);
    return;
  }

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("expo_push_token")
      .eq("id", userId)
      .single();

    const token = profile?.expo_push_token;
    if (profileError || !token || !Expo.isExpoPushToken(token)) return;

    const message: ExpoPushMessage = { to: token, title, body, data, sound: "default" };
    const receipts = await expo.sendPushNotificationsAsync([message]);
    const failed = receipts.find((r) => r.status === "error");
    if (failed && failed.status === "error") {
      console.error(`[notifications] Push send failed for ${userId}:`, failed.message);
    }
  } catch (err) {
    console.error(`[notifications] Push send failed for ${userId}:`, err);
  }
}

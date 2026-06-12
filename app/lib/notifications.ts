import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { apiRequest } from "./api";

/**
 * Requests notification permissions, registers an Expo push token for this
 * device, and stores it on the user's profile. No-ops on simulators/emulators
 * and when no EAS project ID is configured (push tokens require both).
 */
export async function registerForPushNotificationsAsync(): Promise<void> {
  if (!Device.isDevice) return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await apiRequest("/profile/push-token", { method: "POST", body: { token } });
}

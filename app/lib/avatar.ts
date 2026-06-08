import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import { supabase } from "./supabase";

/**
 * Lets the signed-in user pick a square photo from their library, uploads it to
 * the public `avatars` Storage bucket at "<user_id>/avatar-<timestamp>.<ext>"
 * (matches the storage RLS policies in supabase/migrations), and returns the
 * public URL to save on the profile. Returns null if the user cancels.
 */
export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library permission is required to choose an avatar.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    base64: true,
  });

  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset?.base64) {
    return null;
  }

  const ext = (asset.fileName?.split(".").pop() || asset.uri.split(".").pop() || "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const contentType = asset.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}`;
  const path = `${userId}/avatar-${Date.now()}.${ext || "jpg"}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, decode(asset.base64), { contentType, upsert: true });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

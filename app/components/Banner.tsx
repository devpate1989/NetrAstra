import { View } from "react-native";
import { Text } from "./Text";

interface BannerProps {
  message: string;
  variant?: "error" | "success" | "info";
}

const VARIANT_STYLES = {
  error: "bg-red-50 border-red-200",
  success: "bg-emerald-50 border-emerald-200",
  info: "bg-blue-50 border-blue-200",
} as const;

const TEXT_STYLES = {
  error: "text-red-700",
  success: "text-emerald-700",
  info: "text-blue-700",
} as const;

export function Banner({ message, variant = "info" }: BannerProps) {
  if (!message) return null;

  return (
    <View className={`mb-4 w-full rounded-xl border px-4 py-3 ${VARIANT_STYLES[variant]}`}>
      <Text className={`text-sm ${TEXT_STYLES[variant]}`}>{message}</Text>
    </View>
  );
}

import { Image, View } from "react-native";
import { Text } from "./Text";

interface AvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  size?: number;
  bgClassName?: string;
  textClassName?: string;
}

function getInitials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

export function Avatar({ name, avatarUrl, size = 48, bgClassName = "bg-brand-100", textClassName = "text-brand-700" }: AvatarProps) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={dimension} className="bg-slate-100" />;
  }

  return (
    <View style={dimension} className={`items-center justify-center ${bgClassName}`}>
      <Text className={`font-bold ${textClassName}`} style={{ fontSize: size * 0.4 }}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

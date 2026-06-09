import { Pressable, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Text } from "./Text";

interface CardProps {
  title: string;
  description?: string;
  meta?: string;
  count?: number | null;
  countColor?: "red" | "orange" | "blue";
  icon?: React.ComponentProps<typeof MaterialIcons>["name"];
  onPress?: () => void;
}

const COUNT_STYLES: Record<NonNullable<CardProps["countColor"]>, { bg: string; text: string }> = {
  red:    { bg: "#dc2626", text: "#ffffff" },
  orange: { bg: "#f97316", text: "#ffffff" },
  blue:   { bg: "#1d4ed8", text: "#ffffff" },
};

export function Card({ title, description, meta, count, countColor = "blue", icon, onPress }: CardProps) {
  const Container = onPress ? Pressable : View;
  const cs = COUNT_STYLES[countColor];

  return (
    <Container
      onPress={onPress}
      className="mb-3 w-full rounded-xl border border-slate-200 bg-white p-4 active:bg-slate-50"
    >
      <View className="flex-row items-center">
        {icon ? (
          <View className="mr-3 h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
            <MaterialIcons name={icon} size={20} color="#1d4ed8" />
          </View>
        ) : null}
        <View className="flex-1">
          <Text className="text-base font-semibold text-slate-900">{title}</Text>
          {description ? <Text className="mt-1 text-sm text-slate-500">{description}</Text> : null}
          {meta ? <Text className="mt-2 text-xs font-medium uppercase tracking-wide text-brand-600">{meta}</Text> : null}
        </View>
        {count != null && (
          <View
            style={{ backgroundColor: cs.bg, minWidth: 36, height: 36, borderRadius: 18 }}
            className="ml-3 items-center justify-center px-2"
          >
            <Text style={{ color: cs.text }} className="text-base font-bold">{count}</Text>
          </View>
        )}
        {onPress ? <MaterialIcons name="chevron-right" size={20} color="#94a3b8" style={{ marginLeft: 4 }} /> : null}
      </View>
    </Container>
  );
}

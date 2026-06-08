import { Pressable, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Text } from "./Text";

interface CardProps {
  title: string;
  description?: string;
  meta?: string;
  icon?: React.ComponentProps<typeof MaterialIcons>["name"];
  onPress?: () => void;
}

export function Card({ title, description, meta, icon, onPress }: CardProps) {
  const Container = onPress ? Pressable : View;

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
        {onPress ? <MaterialIcons name="chevron-right" size={20} color="#94a3b8" style={{ marginLeft: 4 }} /> : null}
      </View>
    </Container>
  );
}

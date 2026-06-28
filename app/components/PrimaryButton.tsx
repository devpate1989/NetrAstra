import { ActivityIndicator, Pressable, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { Text } from "./Text";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "solid" | "outline";
  icon?: React.ComponentProps<typeof MaterialIcons>["name"];
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "solid",
  icon,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  const base = "w-full flex-row items-center justify-center rounded-lg px-4 py-3 gap-2";
  const solid = "bg-brand-600 active:bg-brand-700";
  const outline = "border border-brand-600 bg-transparent active:bg-brand-50";
  const iconColor = variant === "solid" ? "#fff" : "#1d4ed8";

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`${base} ${variant === "solid" ? solid : outline} ${isDisabled ? "opacity-60" : ""}`}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon ? <MaterialIcons name={icon} size={18} color={iconColor} /> : null}
          <Text className={`text-base font-semibold ${variant === "solid" ? "text-white" : "text-brand-600"}`}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

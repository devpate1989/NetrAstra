import { Pressable, View } from "react-native";
import { Text } from "./Text";

interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface ChipSelectProps<T extends string> {
  label: string;
  value: T | null | undefined;
  options: readonly ChipOption<T>[];
  onChange: (value: T) => void;
}

/** Single-select pill group — used for enum-like fields (dispute category, Yes/No, etc.). */
export function ChipSelect<T extends string>({ label, value, options, onChange }: ChipSelectProps<T>) {
  return (
    <View className="mb-4 w-full">
      <Text className="mb-1.5 text-sm font-medium text-slate-700">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              className={`rounded-full border px-4 py-2 ${
                active ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white"
              }`}
            >
              <Text className={`text-sm font-medium ${active ? "text-white" : "text-slate-700"}`}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

import { View, type TextInputProps } from "react-native";
import { Text, TextInput } from "./Text";

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function FormField({ label, error, className, ...inputProps }: FormFieldProps) {
  return (
    <View className="mb-4 w-full">
      <Text className="mb-1 text-sm font-medium text-slate-700">{label}</Text>
      <TextInput
        className={`w-full rounded-lg border px-4 py-3 text-base text-slate-900 ${
          error ? "border-red-500" : "border-slate-300"
        } ${className ?? ""}`}
        placeholderTextColor="#94a3b8"
        {...inputProps}
      />
      {error ? <Text className="mt-1 text-xs text-red-600">{error}</Text> : null}
    </View>
  );
}

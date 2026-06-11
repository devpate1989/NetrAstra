import { ScrollView, View, type ScrollViewProps } from "react-native";
import { Text } from "./Text";
import { SafeAreaView } from "react-native-safe-area-context";

interface ScreenContainerProps extends ScrollViewProps {
  title?: string;
  subtitle?: string;
  /** Set to false for screens that render their own scrollable list (e.g. FlatList) — disables the built-in ScrollView. */
  scrollable?: boolean;
  children: React.ReactNode;
}

export function ScreenContainer({ title, subtitle, scrollable = true, children, ...scrollProps }: ScreenContainerProps) {
  const header = title ? (
    <View className="mb-6">
      <Text className="text-2xl font-bold text-slate-900">{title}</Text>
      {subtitle ? <Text className="mt-1 text-sm text-slate-500">{subtitle}</Text> : null}
    </View>
  ) : null;

  if (!scrollable) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50" edges={["top"]}>
        <View className="flex-1 px-5 pt-6">
          {header}
          {children}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top"]}>
      <ScrollView contentContainerClassName="px-5 pb-10 pt-6" {...scrollProps}>
        {header}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

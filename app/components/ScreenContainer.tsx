import { ScrollView, View, type ScrollViewProps } from "react-native";
import { Text } from "./Text";
import { SafeAreaView } from "react-native-safe-area-context";

interface ScreenContainerProps extends ScrollViewProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function ScreenContainer({ title, subtitle, children, ...scrollProps }: ScreenContainerProps) {
  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top"]}>
      <ScrollView contentContainerClassName="px-5 pb-10 pt-6" {...scrollProps}>
        {title ? (
          <View className="mb-6">
            <Text className="text-2xl font-bold text-slate-900">{title}</Text>
            {subtitle ? <Text className="mt-1 text-sm text-slate-500">{subtitle}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

import { memo } from "react";
import { Pressable, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Text } from "./Text";

export type CardTone = "blue" | "purple" | "teal" | "amber" | "rose" | "emerald" | "indigo" | "slate";

interface CardProps {
  title: string;
  description?: string;
  meta?: string;
  count?: number | null;
  countColor?: "red" | "orange" | "blue";
  icon?: React.ComponentProps<typeof MaterialIcons>["name"];
  /** Accent color for the icon badge — lets related cards (scan, legal, directory, etc.) stand apart visually. */
  tone?: CardTone;
  onPress?: () => void;
}

const COUNT_STYLES: Record<NonNullable<CardProps["countColor"]>, { bg: string; text: string }> = {
  red:    { bg: "#dc2626", text: "#ffffff" },
  orange: { bg: "#f97316", text: "#ffffff" },
  blue:   { bg: "#1d4ed8", text: "#ffffff" },
};

const TONE_STYLES: Record<CardTone, { bg: string; icon: string }> = {
  blue:    { bg: "bg-brand-50",   icon: "#1d4ed8" },
  purple:  { bg: "bg-violet-50",  icon: "#7c3aed" },
  teal:    { bg: "bg-teal-50",    icon: "#0d9488" },
  amber:   { bg: "bg-amber-50",   icon: "#d97706" },
  rose:    { bg: "bg-rose-50",    icon: "#e11d48" },
  emerald: { bg: "bg-emerald-50", icon: "#059669" },
  indigo:  { bg: "bg-indigo-50",  icon: "#4f46e5" },
  slate:   { bg: "bg-slate-100",  icon: "#475569" },
};

export const Card = memo(function Card({ title, description, meta, count, countColor = "blue", icon, tone = "blue", onPress }: CardProps) {
  const Container = onPress ? Pressable : View;
  const cs = COUNT_STYLES[countColor];
  const ts = TONE_STYLES[tone];

  return (
    <Container
      onPress={onPress}
      className="mb-3 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
    >
      <View className="flex-row items-center">
        {icon ? (
          <View className={`mr-3 h-10 w-10 items-center justify-center rounded-xl ${ts.bg}`}>
            <MaterialIcons name={icon} size={20} color={ts.icon} />
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
});

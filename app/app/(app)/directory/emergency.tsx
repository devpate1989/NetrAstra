import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { Text } from "../../../components/Text";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { EMERGENCY_NUMBERS, type EmergencyNumber } from "../../../lib/emergencyNumbers";

export default function EmergencyNumbersScreen() {
  const [copied, setCopied] = useState<string | null>(null);

  function handleCall(number: string) {
    Linking.openURL(`tel:${number}`).catch(() => {});
  }

  async function handleCopy(number: string) {
    await Clipboard.setStringAsync(number);
    setCopied(number);
    setTimeout(() => setCopied((current) => (current === number ? null : current)), 1500);
  }

  return (
    <ScreenContainer title="Emergency Numbers" subtitle="Tap to call, or copy a number to share it.">
      {EMERGENCY_NUMBERS.map((entry) => (
        <EmergencyNumberRow
          key={entry.number}
          entry={entry}
          copied={copied === entry.number}
          onCall={() => handleCall(entry.number)}
          onCopy={() => handleCopy(entry.number)}
        />
      ))}

      <View className="mt-2">
        <PrimaryButton label="Back to Dashboard" variant="outline" onPress={() => router.replace("/(app)/dashboard")} />
      </View>
    </ScreenContainer>
  );
}

function EmergencyNumberRow({
  entry,
  copied,
  onCall,
  onCopy,
}: {
  entry: EmergencyNumber;
  copied: boolean;
  onCall: () => void;
  onCopy: () => void;
}) {
  return (
    <View className="mb-3 w-full rounded-xl border border-slate-200 bg-white p-4">
      <View className="flex-row items-center">
        <View className="mr-3 h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
          <MaterialCommunityIcons name={entry.icon} size={22} color="#1d4ed8" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-slate-900">{entry.title}</Text>
          <Text className="text-sm text-slate-500">{entry.titleHindi}</Text>
        </View>
        <Text className="text-2xl font-bold text-brand-600">{entry.number}</Text>
      </View>

      <Text className="mt-3 text-sm text-slate-600">{entry.description}</Text>

      <View className="mt-3 flex-row gap-2">
        <Pressable
          onPress={onCall}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 active:bg-brand-700"
        >
          <MaterialCommunityIcons name="phone" size={16} color="#fff" />
          <Text className="text-sm font-semibold text-white">Call {entry.number}</Text>
        </Pressable>
        <Pressable
          onPress={onCopy}
          className="flex-row items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 active:bg-slate-50"
        >
          <MaterialCommunityIcons name={copied ? "check" : "content-copy"} size={16} color={copied ? "#059669" : "#475569"} />
          <Text className={`text-sm font-semibold ${copied ? "text-emerald-600" : "text-slate-600"}`}>
            {copied ? "Copied" : "Copy"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

import { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import { Text } from "../../../components/Text";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Banner } from "../../../components/Banner";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { apiRequest, ApiError } from "../../../lib/api";
import type { Beat, Chowki, ChowkiOfficer, ThanaStaff } from "../../../types";

const KIND_LABELS: Record<Chowki["kind"], string> = {
  chowki: "चौकी",
  halka: "हल्का",
  special: "विशेष ड्यूटी",
};

export default function ChowkiDirectoryScreen() {
  const [chowkis, setChowkis] = useState<Chowki[]>([]);
  const [staff, setStaff] = useState<ThanaStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [chowkiRes, staffRes] = await Promise.all([
        apiRequest<{ chowkis: Chowki[] }>("/directory/chowkis"),
        apiRequest<{ staff: ThanaStaff[] }>("/directory/thana-staff"),
      ]);
      setChowkis(chowkiRes.chowkis);
      setStaff(staffRes.staff);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the beat directory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScreenContainer title="Beat / Chowki Directory" subtitle="चौकी / हल्का → गाँव → तैनात अधिकारी">
      <Banner message={error} variant="error" />

      {loading ? (
        <View className="items-center py-10">
          <ActivityIndicator size="large" color="#1d4ed8" />
        </View>
      ) : (
        <>
          {chowkis.map((chowki) => (
            <ChowkiCard key={chowki.id} chowki={chowki} />
          ))}

          {staff.length > 0 && (
            <View className="mt-2">
              <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                थाना स्टाफ (Karm Yogi)
              </Text>
              {staff.map((member) => (
                <ThanaStaffRow key={member.id} member={member} />
              ))}
            </View>
          )}
        </>
      )}

      <View className="mt-2">
        <PrimaryButton label="Back to Dashboard" variant="outline" onPress={() => router.replace("/(app)/dashboard")} />
      </View>
    </ScreenContainer>
  );
}

function callNumber(phone?: string | null) {
  if (!phone) return;
  Linking.openURL(`tel:${phone}`).catch(() => {});
}

const ChowkiCard = memo(function ChowkiCard({ chowki }: { chowki: Chowki }) {
  const villagesByBeat = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const v of chowki.villages) {
      const key = v.beatNumber ?? "";
      const list = map.get(key);
      if (list) list.push(v.villageName);
      else map.set(key, [v.villageName]);
    }
    return map;
  }, [chowki.villages]);

  const villageGroups = useMemo(() => {
    const groups: { beatNumber: string | null; villages: string[] }[] = [];
    for (const v of chowki.villages) {
      const beatNumber = v.beatNumber ?? null;
      const last = groups[groups.length - 1];
      if (last && last.beatNumber === beatNumber) {
        last.villages.push(v.villageName);
      } else {
        groups.push({ beatNumber, villages: [v.villageName] });
      }
    }
    return groups;
  }, [chowki.villages]);

  return (
    <View className="mb-4 w-full rounded-xl border border-slate-200 bg-white p-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-base font-bold text-slate-900">{chowki.name}</Text>
        <View className="rounded-full bg-brand-50 px-3 py-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {KIND_LABELS[chowki.kind]}
          </Text>
        </View>
      </View>

      {chowki.officers.length > 0 && (
        <View className="mb-3">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">तैनात अधिकारी</Text>
          {chowki.officers.map((officer) => (
            <OfficerRow key={officer.id} officer={officer} />
          ))}
        </View>
      )}

      {chowki.beats.length > 0 ? (
        <View>
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">बीट आबन्टन</Text>
          {chowki.beats.map((beat) => (
            <BeatCard key={beat.id} beat={beat} villages={villagesByBeat.get(beat.beatNumber ?? "") ?? []} />
          ))}
        </View>
      ) : (
        villageGroups.length > 0 && (
          <View>
            <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">गाँव / मोहल्ले</Text>
            {villageGroups.map((group, idx) => (
              <Text key={idx} className="mb-0.5 text-sm text-slate-700">
                {group.beatNumber ? <Text className="font-semibold text-slate-500">बीट {group.beatNumber}: </Text> : null}
                {group.villages.join(", ")}
              </Text>
            ))}
          </View>
        )
      )}
    </View>
  );
});

const BeatCard = memo(function BeatCard({ beat, villages }: { beat: Beat; villages: string[] }) {
  return (
    <View className="mb-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
      {beat.beatNumber ? (
        <Text className="mb-1.5 text-xs font-bold text-brand-600">बीट {beat.beatNumber}</Text>
      ) : null}

      {villages.length > 0 && (
        <View className="mb-1.5">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">गाँव / मोहल्ले</Text>
          <Text className="text-sm text-slate-700">{villages.join(", ")}</Text>
        </View>
      )}

      <BeatPersonRow label="बीट उ0नि0" person={beat.si} pno={beat.si?.pno} />
      <BeatPersonRow label="बीट कर्मचारी" person={beat.staff} />
      <BeatPersonRow label="लिंक अधिकारी" person={beat.linkOfficer} />
    </View>
  );
});

const BeatPersonRow = memo(function BeatPersonRow({
  label,
  person,
  pno,
}: {
  label: string;
  person: { name: string; phone?: string | null } | null;
  pno?: string | null;
}) {
  if (!person) return null;

  return (
    <View className="mb-1 flex-row items-center justify-between">
      <View className="flex-1 pr-2">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</Text>
        <Text className="text-sm text-slate-700">
          {person.name}
          {pno ? ` · PNO ${pno}` : ""}
        </Text>
      </View>
      {person.phone ? (
        <Pressable
          onPress={() => callNumber(person.phone)}
          className="flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 active:bg-brand-700"
        >
          <MaterialIcons name="call" size={14} color="#fff" />
          <Text className="text-xs font-semibold text-white">{person.phone}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const OfficerRow = memo(function OfficerRow({ officer }: { officer: ChowkiOfficer }) {
  return (
    <View className="mb-1.5 flex-row items-center justify-between">
      <View className="flex-1 pr-2">
        <Text className="text-sm font-medium text-slate-800">{officer.fullName}</Text>
        <Text className="text-xs text-slate-500">
          {officer.designation}
          {officer.pno ? ` · PNO ${officer.pno}` : ""}
        </Text>
      </View>
      {officer.phone ? (
        <Pressable
          onPress={() => callNumber(officer.phone)}
          className="flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 active:bg-brand-700"
        >
          <MaterialIcons name="call" size={14} color="#fff" />
          <Text className="text-xs font-semibold text-white">{officer.phone}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const ThanaStaffRow = memo(function ThanaStaffRow({ member }: { member: ThanaStaff }) {
  return (
    <View className="mb-2 w-full rounded-xl border border-slate-200 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-sm font-semibold text-slate-900">{member.fullName}</Text>
          <Text className="text-xs text-slate-500">
            {member.designation}
            {member.pno ? ` · PNO ${member.pno}` : ""}
          </Text>
          {member.currentPosting ? <Text className="mt-0.5 text-xs text-brand-600">{member.currentPosting}</Text> : null}
        </View>
        {member.phone ? (
          <Pressable
            onPress={() => callNumber(member.phone)}
            className="flex-row items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 active:bg-brand-700"
          >
            <MaterialIcons name="call" size={14} color="#fff" />
            <Text className="text-xs font-semibold text-white">{member.phone}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

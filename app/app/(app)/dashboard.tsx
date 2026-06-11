import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Text } from "../../components/Text";
import { router, useFocusEffect } from "expo-router";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Avatar } from "../../components/Avatar";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";

const ROLE_LABELS: Record<string, string> = {
  io: "Investigating Officer",
  sho: "SHO",
  admin: "Admin",
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

interface SyncState {
  loading: boolean;
  result: string | null;
  error: string | null;
}

const IDLE: SyncState = { loading: false, result: null, error: null };

// Portal sync launches a headless browser server-side, which can take well
// over the default API timeout — give it more room before giving up.
const SYNC_TIMEOUT_MS = 120_000;

export default function DashboardScreen() {
  const { user } = useAuth();
  const roleLabel = user ? ROLE_LABELS[user.role] ?? user.role : "";

  const [igrsSync, setIgrsSync] = useState<SyncState>(IDLE);
  const [cctnsSync, setCctnsSync] = useState<SyncState>(IDLE);

  const [jansunwaiCount, setJansunwaiCount] = useState<number | null>(null);
  const [cctnsCount, setCctnsCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (user?.role !== "io") return;
      apiRequest<{ applications: unknown[] }>("/jansunwai/pending")
        .then((d) => setJansunwaiCount(d.applications.length))
        .catch(() => {});
      apiRequest<{ investigations: unknown[] }>("/investigations")
        .then((d) => setCctnsCount(d.investigations.length))
        .catch(() => {});
    }, [user?.role])
  );

  async function syncIgrs() {
    setIgrsSync({ loading: true, result: null, error: null });
    try {
      const { result } = await apiRequest<{ result: { scraped: number; stored: number; skipped: boolean; reason?: string } }>(
        "/jansunwai/refresh",
        { method: "POST", timeoutMs: SYNC_TIMEOUT_MS }
      );
      setIgrsSync({
        loading: false,
        result: result.skipped
          ? (result.reason ?? "Skipped — portal not configured")
          : `${result.stored} stored, ${result.scraped} scraped`,
        error: null,
      });
    } catch (err) {
      setIgrsSync({ loading: false, result: null, error: err instanceof Error ? err.message : "Sync failed" });
    }
  }

  async function syncCctns() {
    setCctnsSync({ loading: true, result: null, error: null });
    try {
      const { result } = await apiRequest<{ result: { scraped: number; stored: number; skipped: boolean; reason?: string } }>(
        "/investigations/refresh",
        { method: "POST", timeoutMs: SYNC_TIMEOUT_MS }
      );
      setCctnsSync({
        loading: false,
        result: result.skipped
          ? (result.reason ?? "Skipped — portal not configured")
          : `${result.stored} stored, ${result.scraped} scraped`,
        error: null,
      });
    } catch (err) {
      setCctnsSync({ loading: false, result: null, error: err instanceof Error ? err.message : "Sync failed" });
    }
  }

  return (
    <ScreenContainer>
      {/* ── Greeting header ─────────────────────────────────── */}
      <View className="mb-6 flex-row items-center justify-between rounded-2xl bg-brand-600 p-5 shadow-sm">
        <View className="flex-1 pr-4">
          <Text className="text-sm font-medium text-brand-100">{getGreeting()}</Text>
          <Text className="mt-1 text-2xl font-bold text-white" numberOfLines={1}>
            {user ? `Hello, ${user.fullName.split(" ")[0]}!` : "Welcome"}
          </Text>
          {user && (
            <View className="mt-3 flex-row flex-wrap items-center gap-2">
              <View className="rounded-full bg-white/15 px-3 py-1">
                <Text className="text-xs font-semibold text-white">{roleLabel}</Text>
              </View>
              {(user.policeStation || user.district) && (
                <View className="flex-row items-center gap-1">
                  <MaterialIcons name="location-on" size={14} color="#bfdbfe" />
                  <Text className="text-xs font-medium text-brand-100">
                    {[user.policeStation && `थाना ${user.policeStation}`, user.district && `जनपद ${user.district}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
        <Avatar
          name={user?.fullName ?? user?.email}
          avatarUrl={user?.avatarUrl}
          size={56}
          bgClassName="bg-white/20"
          textClassName="text-white"
        />
      </View>

      {/* ── IO section ──────────────────────────────────────── */}
      {user?.role === "io" && (
        <View>
          <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Quick actions
          </Text>
          <Card
            title="My Pending Cases (CCTNS)"
            description="View CCTNS-tracked pending investigations assigned to you."
            meta="View"
            icon="manage-search"
            count={cctnsCount}
            countColor={cctnsCount != null && cctnsCount >= 60 ? "red" : cctnsCount != null && cctnsCount >= 20 ? "orange" : "blue"}
            onPress={() => router.push("/(app)/investigations")}
          />
          <Card
            title="Pending Jan Sunwai (जनसुनवाई)"
            description="View pending आवेदन संख्या assigned to you, read applications, and start inquiry reports."
            meta="Open"
            icon="hearing"
            tone="amber"
            count={jansunwaiCount}
            countColor="blue"
            onPress={() => router.push("/(app)/jansunwai")}
          />
          <Card
            title="My Inquiry Reports"
            description="Fill, submit, and download point-wise inquiry reports (जाँच आख्या)."
            meta="Open"
            icon="description"
            tone="emerald"
            onPress={() => router.push("/(app)/reports")}
          />
          <Card
            title="Start a new Report"
            description="Begin a fresh 23-point inquiry report from scratch."
            meta="Create"
            icon="add-circle"
            tone="purple"
            onPress={() => router.push("/(app)/reports/new")}
          />
        </View>
      )}

      {/* ── SHO / Admin section ─────────────────────────────── */}
      {(user?.role === "sho" || user?.role === "admin") && (
        <View>
          <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Station overview
          </Text>
          <Card
            title="IGRS Allotment (जनसुनवाई)"
            description="View pending IGRS applications and allot each one to an Investigating Officer."
            meta="Open"
            icon="assignment-ind"
            tone="amber"
            onPress={() => router.push("/(app)/igrs/allotment")}
          />
          <Card
            title="Pending Investigations (IO-wise)"
            description="CCTNS-tracked pending investigations for your station, grouped by Investigating Officer."
            meta={user.role === "admin" ? "View & Edit" : "View"}
            icon="manage-search"
            tone="blue"
            onPress={() => router.push("/(app)/investigations")}
          />
          {user.role === "admin" && (
            <Card
              title="Manage Users"
              description="Promote or change roles for IO / SHO / Admin accounts."
              meta="Open"
              icon="manage-accounts"
              tone="purple"
              onPress={() => router.push("/(app)/admin/users")}
            />
          )}
          {user.role === "admin" && (
            <Card
              title="Audit Log"
              description="Review sensitive admin and report actions for accountability."
              meta="Open"
              icon="history"
              tone="rose"
              onPress={() => router.push("/(app)/admin/audit-log")}
            />
          )}

          {/* ── Manual sync widget ───────────────────────────── */}
          <Text className="mb-3 mt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Portal sync
          </Text>
          <View className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <View className="border-b border-slate-100 px-4 py-3">
              <Text className="text-sm font-semibold text-slate-800">Sync portals manually</Text>
              <Text className="mt-0.5 text-xs text-slate-400">
                Portals sync automatically every 30 min. Tap to sync now.
              </Text>
            </View>

            {/* Jan Sunwai row */}
            <SyncRow
              label="Jan Sunwai (IGRS)"
              icon="hearing"
              state={igrsSync}
              onSync={syncIgrs}
            />

            {/* CCTNS row */}
            <View className="border-t border-slate-100">
              <SyncRow
                label="CCTNS Investigations"
                icon="manage-search"
                state={cctnsSync}
                onSync={syncCctns}
              />
            </View>
          </View>
        </View>
      )}

      {/* ── Resources ───────────────────────────────────────── */}
      <View>
        <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Resources
        </Text>
        <Card
          title="Scan Documents"
          description="Scan or upload a complaint, FIR, notice, or court document and extract its text with OCR."
          meta="Open"
          icon="document-scanner"
          tone="purple"
          onPress={() => router.push("/(app)/scan")}
        />
        <Card
          title="Legal Analysis"
          description="Get AI-assisted BNS/BNSS/BSA section analysis from a document or pasted text, and look up IPC ↔ BNS section mappings."
          meta="Open"
          icon="gavel"
          tone="indigo"
          onPress={() => router.push("/(app)/legal")}
        />
        <Card
          title="Station Directory"
          description="Search officers at your station by name or role, and call them directly."
          meta="View"
          icon="groups"
          tone="teal"
          onPress={() => router.push("/(app)/directory/police-station")}
        />
        <Card
          title="Beat / Chowki Directory"
          description="चौकी/हल्का-wise villages and posted Sub-Inspectors, plus the Thana staff roster."
          meta="View"
          icon="map"
          tone="amber"
          onPress={() => router.push("/(app)/directory/chowki")}
        />
        <Card
          title="Emergency Numbers"
          description="National helplines — police, fire, ambulance, women & child helplines, and cyber crime."
          meta="View"
          icon="emergency"
          tone="rose"
          onPress={() => router.push("/(app)/directory/emergency")}
        />
      </View>

      {/* ── Account ─────────────────────────────────────────── */}
      <View className="mt-2">
        <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Account
        </Text>
        <Card
          title="My Profile"
          description="View and update your personal details, station, and password."
          meta="Open"
          icon="account-circle"
          tone="slate"
          onPress={() => router.push("/(app)/profile")}
        />
      </View>
    </ScreenContainer>
  );
}

function SyncRow({
  label,
  icon,
  state,
  onSync,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  state: SyncState;
  onSync: () => void;
}) {
  return (
    <View className="px-4 py-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <MaterialIcons name={icon} size={16} color="#64748b" />
          <Text className="text-sm font-medium text-slate-700">{label}</Text>
        </View>
        <Pressable
          onPress={onSync}
          disabled={state.loading}
          className={`flex-row items-center gap-1.5 rounded-lg px-3 py-1.5 ${state.loading ? "bg-slate-100" : "bg-brand-50 border border-brand-200"}`}
        >
          {state.loading
            ? <ActivityIndicator size="small" color="#1d4ed8" />
            : <MaterialIcons name="sync" size={14} color="#1d4ed8" />}
          <Text className={`text-xs font-semibold ${state.loading ? "text-slate-400" : "text-brand-600"}`}>
            {state.loading ? "Syncing…" : "Sync now"}
          </Text>
        </Pressable>
      </View>

      {/* Result / error feedback */}
      {state.result ? (
        <View className="mt-2 flex-row items-center gap-1.5">
          <MaterialIcons name="check-circle" size={12} color="#059669" />
          <Text className="text-xs text-emerald-700">{state.result}</Text>
        </View>
      ) : null}
      {state.error ? (
        <View className="mt-2 flex-row items-center gap-1.5">
          <MaterialIcons name="error-outline" size={12} color="#dc2626" />
          <Text className="text-xs text-red-600">{state.error}</Text>
        </View>
      ) : null}
    </View>
  );
}

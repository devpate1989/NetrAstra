import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { Text } from "../../components/Text";
import { router, useFocusEffect } from "expo-router";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Avatar } from "../../components/Avatar";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";
import type { InvestigationGroup, ScrapeRefreshResult } from "../../types/investigation";

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
// over the default API timeout — give it more room before giving up. The
// Jan Sunwai sync now pages through all 14 संदर्भ प्रकार categories, so this
// needs to comfortably cover a couple of minutes.
const SYNC_TIMEOUT_MS = 180_000;

// The server runs the scrape in the background and replies with `{ started: true }`
// if it's not done within a few seconds, rather than holding the request open.
function describeSyncResult(result: ScrapeRefreshResult): string {
  if ("started" in result) return "Sync started in the background — check back in a minute.";
  if (result.skipped) return result.reason ?? "Skipped — portal not configured";
  return `${result.stored} stored, ${result.scraped} scraped`;
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const roleLabel = user ? ROLE_LABELS[user.role] ?? user.role : "";

  const [igrsSync, setIgrsSync] = useState<SyncState>(IDLE);
  const [cctnsSync, setCctnsSync] = useState<SyncState>(IDLE);

  const [jansunwaiCount, setJansunwaiCount] = useState<number | null>(null);
  const [cctnsCount, setCctnsCount] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [ioGroups, setIoGroups] = useState<InvestigationGroup[] | null>(null);
  const [igrsPendingCount, setIgrsPendingCount] = useState<number | null>(null);
  const [pgPendingCount, setPgPendingCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (user?.role !== "io") return;
      apiRequest<{ applications: unknown[] }>("/jansunwai/pending")
        .then((d) => setJansunwaiCount(d.applications.length))
        .catch(() => {});
      apiRequest<{ investigations: unknown[] }>("/investigations")
        .then((d) => setCctnsCount(d.investigations.length))
        .catch(() => {});
      apiRequest<{ summary: { pending: number } | null }>("/pg/summary")
        .then((d) => setPgPendingCount(d.summary?.pending ?? 0))
        .catch(() => {});
    }, [user?.role])
  );

  useFocusEffect(
    useCallback(() => {
      if (user?.role !== "sho" && user?.role !== "admin") return;
      apiRequest<{ groupedByIo: InvestigationGroup[] }>("/investigations")
        .then((d) => setIoGroups(d.groupedByIo))
        .catch(() => {});
      apiRequest<{ applications: unknown[] }>("/jansunwai/pending")
        .then((d) => setIgrsPendingCount(d.applications.length))
        .catch(() => {});
      apiRequest<{ summary: { pending: number } | null }>("/pg/summary")
        .then((d) => setPgPendingCount(d.summary?.pending ?? 0))
        .catch(() => {});
    }, [user?.role])
  );

  useFocusEffect(
    useCallback(() => {
      apiRequest<{ notifications: { readAt: string | null }[] }>("/notifications")
        .then((d) => setUnreadCount(d.notifications.filter((n) => !n.readAt).length))
        .catch(() => {});
    }, [])
  );

  async function syncIgrs() {
    setIgrsSync({ loading: true, result: null, error: null });
    try {
      const { result } = await apiRequest<{ result: ScrapeRefreshResult }>(
        "/jansunwai/refresh",
        { method: "POST", timeoutMs: SYNC_TIMEOUT_MS }
      );
      setIgrsSync({ loading: false, result: describeSyncResult(result), error: null });
    } catch (err) {
      setIgrsSync({ loading: false, result: null, error: err instanceof Error ? err.message : "Sync failed" });
    }
  }

  async function syncCctns() {
    setCctnsSync({ loading: true, result: null, error: null });
    try {
      const { result } = await apiRequest<{ result: ScrapeRefreshResult }>(
        "/investigations/refresh",
        { method: "POST", timeoutMs: SYNC_TIMEOUT_MS }
      );
      setCctnsSync({ loading: false, result: describeSyncResult(result), error: null });
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
        <View className="items-center gap-3">
          <Pressable
            onPress={() => router.push("/(app)/notifications")}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
            hitSlop={8}
          >
            <MaterialIcons name="notifications" size={20} color="#fff" />
            {unreadCount > 0 ? (
              <View className="absolute -right-1 -top-1 h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1">
                <Text className="text-[10px] font-bold text-white">{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Avatar
            name={user?.fullName ?? user?.email}
            avatarUrl={user?.avatarUrl}
            size={56}
            bgClassName="bg-white/20"
            textClassName="text-white"
          />
        </View>
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
          <Card
            title="Public Grievance (PG)"
            description="Pending public grievance complaints assigned to you."
            meta="View"
            icon="people"
            tone="rose"
            count={pgPendingCount}
            countColor={pgPendingCount != null && pgPendingCount >= 10 ? "red" : "blue"}
            onPress={() => router.push("/(app)/pg")}
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
            title="Pending IGRS (जनसुनवाई)"
            description="IO-wise, sandarbh-wise (संदर्भ प्रकार), and defaulter-in-3-days pendency overview."
            meta="Open"
            icon="hourglass-top"
            tone="amber"
            count={igrsPendingCount}
            countColor={igrsPendingCount != null && igrsPendingCount >= 60 ? "red" : igrsPendingCount != null && igrsPendingCount >= 20 ? "orange" : "blue"}
            onPress={() => router.push("/(app)/igrs/pendency")}
          />
          <Card
            title="Pending Investigations"
            description="CCTNS-tracked pending investigations — by age (30/60/90+ days) and by Investigating Officer."
            meta={user.role === "admin" ? "View & Edit" : "View"}
            icon="manage-search"
            tone="blue"
            count={ioGroups ? ioGroups.reduce((sum, g) => sum + g.cases.length, 0) : null}
            countColor={
              ioGroups && ioGroups.reduce((sum, g) => sum + g.cases.length, 0) >= 60
                ? "red"
                : ioGroups && ioGroups.reduce((sum, g) => sum + g.cases.length, 0) >= 20
                  ? "orange"
                  : "blue"
            }
            onPress={() => router.push("/(app)/investigations")}
          />
          <Card
            title="Public Grievance (PG)"
            description="Pending public grievance complaints from the PG portal — पब्लिक ग्रीवांस."
            meta="View"
            icon="people"
            tone="rose"
            count={pgPendingCount}
            countColor={pgPendingCount != null && pgPendingCount >= 5 ? "red" : "blue"}
            onPress={() => router.push("/(app)/pg")}
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

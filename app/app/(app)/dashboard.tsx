import { View } from "react-native";
import { Text } from "../../components/Text";
import { router } from "expo-router";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { useAuth } from "../../context/AuthContext";

const ROLE_LABELS: Record<string, string> = {
  io: "Investigating Officer",
  sho: "SHO",
  admin: "Admin",
};

export default function DashboardScreen() {
  const { user } = useAuth();
  const roleLabel = user ? ROLE_LABELS[user.role] ?? user.role : "";

  return (
    <ScreenContainer
      title={`Welcome${user ? `, ${user.fullName}` : ""}`}
      subtitle={
        user
          ? `${roleLabel}${user.policeStation ? ` · थाना ${user.policeStation}` : ""}${
              user.district ? ` · जनपद ${user.district}` : ""
            }`
          : undefined
      }
    >
      {user?.role === "io" && (
        <View>
          <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Quick actions
          </Text>
          <Card
            title="Pending Jan Sunwai (जनसुनवाई)"
            description="View pending आवेदन संख्या assigned to you, read applications, and start inquiry reports."
            meta="Open"
            icon="hearing"
            onPress={() => router.push("/(app)/jansunwai")}
          />
          <Card
            title="My Inquiry Reports"
            description="Fill, submit, and download point-wise inquiry reports (जाँच आख्या)."
            meta="Open"
            icon="description"
            onPress={() => router.push("/(app)/reports")}
          />
          <Card
            title="Start a new Report"
            description="Begin a fresh 23-point inquiry report from scratch."
            meta="Create"
            icon="add-circle"
            onPress={() => router.push("/(app)/reports/new")}
          />
        </View>
      )}

      {(user?.role === "sho" || user?.role === "admin") && (
        <View>
          <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Station overview
          </Text>
          <Card
            title="Pending Investigations (IO-wise)"
            description="CCTNS-tracked pending investigations for your station, grouped by Investigating Officer."
            meta={user.role === "admin" ? "View & Edit" : "View"}
            icon="manage-search"
            onPress={() => router.push("/(app)/investigations")}
          />
          {user.role === "admin" && (
            <Card
              title="Manage Users"
              description="Promote or change roles for IO / SHO / Admin accounts."
              meta="Open"
              icon="manage-accounts"
              onPress={() => router.push("/(app)/admin/users")}
            />
          )}
        </View>
      )}

      <View className="mt-2">
        <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Account
        </Text>
        <Card
          title="My Profile"
          description="View and update your personal details, station, and password."
          meta="Open"
          icon="account-circle"
          onPress={() => router.push("/(app)/profile")}
        />
      </View>
    </ScreenContainer>
  );
}

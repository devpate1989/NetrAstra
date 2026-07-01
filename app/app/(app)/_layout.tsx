import { ActivityIndicator, View, type ColorValue } from "react-native";
import { Redirect, Tabs } from "expo-router";
import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { useAuth } from "../../context/AuthContext";

type MIName = React.ComponentProps<typeof MaterialIcons>["name"];

function tabIcon(name: MIName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialIcons name={name} size={size} color={color as string} />
  );
}

export default function AppLayout() {
  const { session, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  const isIo = user?.role === "io";
  const isShoOrAdmin = user?.role === "sho" || user?.role === "admin";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1d4ed8",
        tabBarInactiveTintColor: "#94a3b8",
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{ title: "Dashboard", tabBarIcon: tabIcon("dashboard") }}
      />
      <Tabs.Screen
        name="reports"
        options={{ title: "Reports", href: isIo ? undefined : null, tabBarIcon: tabIcon("description") }}
      />
      <Tabs.Screen
        name="jansunwai"
        options={{ title: "Jan Sunwai", href: isIo ? undefined : null, tabBarIcon: tabIcon("hearing") }}
      />
      <Tabs.Screen
        name="igrs/allotment"
        options={{ title: "IGRS", href: isShoOrAdmin ? undefined : null, tabBarIcon: tabIcon("assignment-ind") }}
      />
      <Tabs.Screen
        name="investigations"
        options={{ title: "Investigations", href: isShoOrAdmin ? undefined : null, tabBarIcon: tabIcon("manage-search") }}
      />
      <Tabs.Screen
        name="scan"
        options={{ title: "Scan", tabBarIcon: tabIcon("document-scanner") }}
      />
      <Tabs.Screen
        name="legal"
        options={{ title: "Legal", tabBarIcon: tabIcon("gavel") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: tabIcon("person") }}
      />

      {/* Sub-routes — never show as tabs */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="pg" options={{ href: null }} />
      <Tabs.Screen name="igrs/pendency" options={{ href: null }} />
      <Tabs.Screen name="igrs/pending-list" options={{ href: null }} />
      <Tabs.Screen name="admin/users" options={{ href: null }} />
      <Tabs.Screen name="admin/audit-log" options={{ href: null }} />
      <Tabs.Screen name="directory/emergency" options={{ href: null }} />
      <Tabs.Screen name="directory/police-station" options={{ href: null }} />
      <Tabs.Screen name="directory/chowki" options={{ href: null }} />
      <Tabs.Screen name="jansunwai/[id]" options={{ href: null }} />
      <Tabs.Screen name="legal/[id]" options={{ href: null }} />
      <Tabs.Screen name="legal/history" options={{ href: null }} />
      <Tabs.Screen name="legal/bns-lookup" options={{ href: null }} />
      <Tabs.Screen name="reports/new" options={{ href: null }} />
      <Tabs.Screen name="reports/[id]" options={{ href: null }} />
      <Tabs.Screen name="scan/[id]" options={{ href: null }} />
      <Tabs.Screen name="scan/history" options={{ href: null }} />
    </Tabs>
  );
}

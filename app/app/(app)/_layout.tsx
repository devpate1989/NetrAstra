import { ActivityIndicator, View, type ColorValue } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
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
        name="investigations"
        options={{ title: "Investigations", href: isShoOrAdmin ? undefined : null, tabBarIcon: tabIcon("manage-search") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: tabIcon("person") }}
      />
    </Tabs>
  );
}

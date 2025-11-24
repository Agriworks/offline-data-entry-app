// src/navigation/BottomTabs.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { House, FileText, Settings as SettingsIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeStack from './HomeStack';
import FilesStack from './FormStack';
import Settings from '../screens/settings/Settings';
import { BottomTabsList } from './BottomTabsList';
import { useTheme } from '../../context/ThemeContext';

const Tab = createBottomTabNavigator<BottomTabsList>();

// Icon component defined outside to avoid re-creation on every render
const TabBarIcon = ({ route, color }: { route: any; color: string }) => {
  if (route.name === 'Home') {
    return <House size={24} color={color} />;
  } else if (route.name === 'Files') {
    return <FileText size={24} color={color} />;
  } else if (route.name === 'Settings') {
    return <SettingsIcon size={24} color={color} />;
  }

  // Default fallback icon
  return <House size={24} color={color} />;
};

// Function to create tabBarIcon outside component to avoid re-creation
const getTabBarIcon = (route: any) => {
  return ({ color }: { color: string }) => (
    <TabBarIcon route={route} color={color} />
  );
};

export default function BottomTabs() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: getTabBarIcon(route),
        tabBarActiveTintColor: theme.activeTint,
        tabBarInactiveTintColor: theme.inactiveTint,
        tabBarShowLabel: false,
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: theme.tabBarBackground,
          height: 62 + insets.bottom,
          paddingBottom: Math.max(5, insets.bottom),
          paddingTop: 5,
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Files" component={FilesStack} />
      <Tab.Screen name="Settings" component={Settings} />
    </Tab.Navigator>
  );
}

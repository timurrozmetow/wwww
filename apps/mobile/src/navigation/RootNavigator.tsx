import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useBootstrap } from '../hooks/useBootstrap';
import { HomeScreen } from '../screens/HomeScreen';
import { ServerSelectScreen } from '../screens/ServerSelectScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { useAppStore } from '../store/app-store';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Frictionless entry (CLAUDE.md §6): a brief animated splash while persisted
 * state loads (language auto-detected — no picker, no onboarding gate), then
 * straight to Home. Server-select and Settings are pushed on top.
 */
export function RootNavigator() {
  useBootstrap();
  const hydrated = useAppStore((s) => s.hydrated);

  if (!hydrated) return <SplashScreen />;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="ServerSelect" component={ServerSelectScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

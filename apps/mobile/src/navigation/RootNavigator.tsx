import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useBootstrap } from '../hooks/useBootstrap';
import { HomeScreen } from '../screens/HomeScreen';
import { LanguageScreen } from '../screens/LanguageScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { useAppStore } from '../store/app-store';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * State-driven flow (auth-flow pattern): the visible screen follows store state
 * rather than imperative navigation, so picking a language / finishing
 * onboarding simply swaps the active screen.
 */
export function RootNavigator() {
  useBootstrap();
  const hydrated = useAppStore((s) => s.hydrated);
  const language = useAppStore((s) => s.language);
  const onboarded = useAppStore((s) => s.onboarded);

  if (!hydrated) return <SplashScreen />;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!language ? (
        <Stack.Screen name="Language" component={LanguageScreen} />
      ) : !onboarded ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : (
        <Stack.Screen name="Home" component={HomeScreen} />
      )}
    </Stack.Navigator>
  );
}

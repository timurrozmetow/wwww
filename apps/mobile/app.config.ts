import type { ExpoConfig } from 'expo/config';

/**
 * Dynamic Expo config (CLAUDE.md §7/§13 — secrets/endpoints come from env, never
 * committed). EXPO_PUBLIC_* vars are inlined at build time and are NOT secret
 * (api base url, AdMob *app* id). Real ad unit ids / MAX SDK key are injected per
 * EAS profile (see eas.json / EAS secrets). Falls back to safe dev defaults so a
 * plain `expo prebuild` still works.
 */
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:3000';

// Google's public TEST AdMob app id — overridden by env for real builds.
const admobAndroidAppId =
  process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID ?? 'ca-app-pub-3940256099942544~3347511713';

// Not secret — appears in the public expo.dev URL. Env wins for CI overrides.
const easProjectId = process.env.EAS_PROJECT_ID ?? '3316dd85-c3a1-4f43-b830-7ecd9b17749b';

const expo: ExpoConfig = {
  name: 'Free VPN Rewards',
  slug: 'free-vpn-rewards',
  owner: 'thebestof',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  platforms: ['android'],
  android: {
    package: 'com.freevpnrewards.app',
  },
  // AdMob app id is passed as PLUGIN PROPS — this version of the plugin reads it
  // from here (not from a top-level key), and injects the manifest meta-data.
  plugins: [['react-native-google-mobile-ads', { androidAppId: admobAndroidAppId }]],
  extra: {
    apiBaseUrl,
    eas: { projectId: easProjectId },
  },
};

export default expo;

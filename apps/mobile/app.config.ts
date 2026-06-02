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

const config: ExpoConfig = {
  name: 'Free VPN Rewards',
  slug: 'free-vpn-rewards',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  platforms: ['android'],
  android: {
    package: 'com.freevpnrewards.app',
    versionCode: 1,
  },
  // The local `vpn` native module (modules/vpn) auto-links via Expo modules; its
  // own AndroidManifest contributes the VpnService + permissions.
  plugins: ['react-native-google-mobile-ads'],
  extra: {
    apiBaseUrl,
    eas: { projectId: process.env.EAS_PROJECT_ID ?? '' },
  },
};

export default {
  ...config,
  // react-native-google-mobile-ads reads its config from this top-level key.
  'react-native-google-mobile-ads': {
    androidAppId: admobAndroidAppId,
  },
};

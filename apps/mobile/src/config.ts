import Constants from 'expo-constants';

interface ExtraConfig {
  apiBaseUrl?: string;
}

const extra = Constants.expoConfig?.extra as ExtraConfig | undefined;

// 10.0.2.2 is the Android emulator's alias for the host machine's localhost.
export const API_BASE_URL = extra?.apiBaseUrl ?? 'http://10.0.2.2:3000';

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

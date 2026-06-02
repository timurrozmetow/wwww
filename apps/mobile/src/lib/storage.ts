import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { LANGUAGES, type Language } from '@vpn/types';

const LANG_KEY = 'vpn.language';
const ONBOARDED_KEY = 'vpn.onboarded';
const DEVICE_ID_KEY = 'vpn.device_id';
const LOW_END_KEY = 'vpn.low_end_mode';

function isLanguage(value: string | null): value is Language {
  return value !== null && (LANGUAGES as readonly string[]).includes(value);
}

/** Persisted client state. IDs go in SecureStore; prefs in AsyncStorage. */
export const storage = {
  async getLanguage(): Promise<Language | null> {
    const value = await AsyncStorage.getItem(LANG_KEY);
    return isLanguage(value) ? value : null;
  },
  async setLanguage(language: Language): Promise<void> {
    await AsyncStorage.setItem(LANG_KEY, language);
  },

  async getOnboarded(): Promise<boolean> {
    return (await AsyncStorage.getItem(ONBOARDED_KEY)) === '1';
  },
  async setOnboarded(): Promise<void> {
    await AsyncStorage.setItem(ONBOARDED_KEY, '1');
  },

  async getDeviceId(): Promise<string | null> {
    return SecureStore.getItemAsync(DEVICE_ID_KEY);
  },
  async setDeviceId(deviceId: string): Promise<void> {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  },

  async getLowEndMode(): Promise<boolean> {
    return (await AsyncStorage.getItem(LOW_END_KEY)) === '1';
  },
  async setLowEndMode(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(LOW_END_KEY, enabled ? '1' : '0');
  },
};

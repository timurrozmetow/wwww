import * as Crypto from 'expo-crypto';
import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import type { DeviceRegisterRequest, Language } from '@vpn/types';
import { APP_VERSION } from '../config';

const INSTALL_ID_KEY = 'vpn.install_id';

/** A stable, per-install UUID (generated once, kept in SecureStore). */
export async function getOrCreateInstallId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALL_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALL_ID_KEY, id);
  return id;
}

/** Builds the anonymous device profile payload for `/api/device/register`. */
export async function buildRegisterRequest(
  language: Language,
  deviceId?: string,
): Promise<DeviceRegisterRequest> {
  const installId = await getOrCreateInstallId();
  const country = Localization.getLocales()[0]?.regionCode ?? undefined;
  const timezone = Localization.getCalendars()[0]?.timeZone ?? undefined;

  return {
    deviceId,
    installId,
    appVersion: APP_VERSION,
    platform: 'android',
    language,
    country: country ?? undefined,
    timezone: timezone ?? undefined,
  };
}

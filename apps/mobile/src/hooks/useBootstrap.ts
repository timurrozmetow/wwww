import { useEffect, useRef } from 'react';
import { changeLanguage } from '../i18n';
import { buildRegisterRequest } from '../lib/device-info';
import { detectLanguage } from '../lib/locale';
import { storage } from '../lib/storage';
import { useAppStore } from '../store/app-store';
import { useRegisterDevice } from './queries';

/**
 * App startup: load persisted state (auto-detecting the language on first launch,
 * no picker — CLAUDE.md §6), then register the anonymous device profile once a
 * device id is absent. Registration is idempotent, so retries are safe.
 */
export function useBootstrap(): void {
  const hydrated = useAppStore((s) => s.hydrated);
  const deviceId = useAppStore((s) => s.deviceId);
  const applyHydration = useAppStore((s) => s.applyHydration);
  const setDeviceId = useAppStore((s) => s.setDeviceId);

  const register = useRegisterDevice();
  const registering = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [storedLanguage, storedDeviceId, selectedServerId, lowEndMode] = await Promise.all([
        storage.getLanguage(),
        storage.getDeviceId(),
        storage.getSelectedServerId(),
        storage.getLowEndMode(),
      ]);
      if (!active) return;

      // No stored language → detect from the device and persist it silently.
      const language = storedLanguage ?? detectLanguage();
      if (!storedLanguage) await storage.setLanguage(language);
      await changeLanguage(language);

      applyHydration({ language, deviceId: storedDeviceId, selectedServerId, lowEndMode });
    })();
    return () => {
      active = false;
    };
  }, [applyHydration]);

  useEffect(() => {
    if (!hydrated || deviceId || registering.current) return;
    registering.current = true;
    void (async () => {
      try {
        const language = useAppStore.getState().language;
        const profile = await register.mutateAsync(await buildRegisterRequest(language));
        await storage.setDeviceId(profile.deviceId);
        setDeviceId(profile.deviceId);
      } catch {
        // Stay unregistered; retried on next launch.
      } finally {
        registering.current = false;
      }
    })();
  }, [hydrated, deviceId, register, setDeviceId]);
}

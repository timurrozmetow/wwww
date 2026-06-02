import { useEffect, useRef } from 'react';
import { changeLanguage } from '../i18n';
import { buildRegisterRequest } from '../lib/device-info';
import { storage } from '../lib/storage';
import { useAppStore } from '../store/app-store';
import { useRegisterDevice } from './queries';

/**
 * App startup: load persisted state, then (once a language is chosen but no
 * device exists yet) register the anonymous device profile. Registration is
 * idempotent on the backend, so retries on later launches are safe.
 */
export function useBootstrap(): void {
  const hydrated = useAppStore((s) => s.hydrated);
  const language = useAppStore((s) => s.language);
  const deviceId = useAppStore((s) => s.deviceId);
  const applyHydration = useAppStore((s) => s.applyHydration);
  const setDeviceId = useAppStore((s) => s.setDeviceId);

  const register = useRegisterDevice();
  const registering = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [storedLanguage, onboarded, storedDeviceId, lowEndMode] = await Promise.all([
        storage.getLanguage(),
        storage.getOnboarded(),
        storage.getDeviceId(),
        storage.getLowEndMode(),
      ]);
      if (!active) return;
      if (storedLanguage) await changeLanguage(storedLanguage);
      applyHydration({ language: storedLanguage, deviceId: storedDeviceId, onboarded, lowEndMode });
    })();
    return () => {
      active = false;
    };
  }, [applyHydration]);

  useEffect(() => {
    if (!hydrated || !language || deviceId || registering.current) return;
    registering.current = true;
    void (async () => {
      try {
        const profile = await register.mutateAsync(await buildRegisterRequest(language));
        await storage.setDeviceId(profile.deviceId);
        setDeviceId(profile.deviceId);
      } catch {
        // Stay unregistered; retried on next launch or language change.
      } finally {
        registering.current = false;
      }
    })();
  }, [hydrated, language, deviceId, register, setDeviceId]);
}

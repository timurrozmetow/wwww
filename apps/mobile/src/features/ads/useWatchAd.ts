import { useCallback, useRef, useState } from 'react';
import { AdEventType, RewardedAd, RewardedAdEventType } from 'react-native-google-mobile-ads';
import { useQueryClient } from '@tanstack/react-query';
import type { BalanceResponse } from '@vpn/types';
import { fetchAdsConfig, startAdSession } from '../../api/endpoints';
import { logError } from '../../lib/log';
import { useAppStore } from '../../store/app-store';

export type WatchAdState = 'idle' | 'loading' | 'showing' | 'verifying' | 'error';

const POLL_INTERVAL_MS = 1500;
const VERIFY_TIMEOUT_MS = 30_000;
const SHOW_TIMEOUT_MS = 45_000;

/**
 * Loads + shows a rewarded ad, passing the ad session id as SSV custom data.
 * Resolves when the ad is dismissed. The reward is NEVER granted here — it is
 * credited server-side via the AdMob SSV callback (CLAUDE.md §7.3).
 *
 * Settles exactly once and always (timeout guard) so the caller can't get stuck.
 */
function showRewardedAd(adUnitId: string, customData: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ad = RewardedAd.createForAdRequest(adUnitId, {
      serverSideVerificationOptions: { customData },
    });
    const unsubscribers: Array<() => void> = [];
    const timerRef: { id?: ReturnType<typeof setTimeout> } = {};
    let settled = false;

    const settle = (run: () => void): void => {
      if (settled) return;
      settled = true;
      if (timerRef.id) clearTimeout(timerRef.id);
      unsubscribers.forEach((u) => u());
      run();
    };

    unsubscribers.push(
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        try {
          ad.show();
        } catch (err) {
          settle(() => reject(err instanceof Error ? err : new Error('failed to show ad')));
        }
      }),
    );
    // Reward earned — granted server-side; nothing is credited on the client.
    unsubscribers.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => undefined));
    unsubscribers.push(ad.addAdEventListener(AdEventType.CLOSED, () => settle(resolve)));
    unsubscribers.push(
      ad.addAdEventListener(AdEventType.ERROR, (error) =>
        settle(() => reject(error instanceof Error ? error : new Error('ad error'))),
      ),
    );

    // Guard against a hung load/show that never emits a terminal event.
    timerRef.id = setTimeout(() => settle(() => reject(new Error('ad timeout'))), SHOW_TIMEOUT_MS);
    ad.load();
  });
}

export function useWatchAd(): { watch: () => Promise<void>; state: WatchAdState } {
  const deviceId = useAppStore((s) => s.deviceId);
  const queryClient = useQueryClient();
  const [state, setState] = useState<WatchAdState>('idle');
  // Synchronous re-entrancy lock — React state lags a render and isn't a mutex.
  const inFlight = useRef(false);

  const readBalance = useCallback((): number => {
    if (!deviceId) return 0;
    return queryClient.getQueryData<BalanceResponse>(['balance', deviceId])?.balanceMinutes ?? 0;
  }, [deviceId, queryClient]);

  const watch = useCallback(async (): Promise<void> => {
    if (!deviceId || inFlight.current) return;
    inFlight.current = true;
    setState('loading');
    try {
      const before = readBalance();
      const [{ sessionId }, config] = await Promise.all([
        startAdSession(deviceId),
        fetchAdsConfig(),
      ]);
      setState('showing');
      await showRewardedAd(config.rewardedUnitId, sessionId);

      // SSV can land seconds after the ad closes (esp. on weak networks). Poll
      // the server balance until it actually increases, up to a bounded cap.
      setState('verifying');
      const deadline = Date.now() + VERIFY_TIMEOUT_MS;
      let credited = false;
      while (Date.now() < deadline && !credited) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        await queryClient.invalidateQueries({ queryKey: ['balance', deviceId] });
        if (readBalance() > before) credited = true;
      }
      setState('idle');
    } catch (err) {
      logError('watch ad failed', err);
      setState('error');
    } finally {
      inFlight.current = false;
    }
  }, [deviceId, queryClient, readBalance]);

  return { watch, state };
}

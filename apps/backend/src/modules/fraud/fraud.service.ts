import type { FraudEventView } from '@vpn/types';
import { configInt } from '../../lib/config-num.js';
import type { DeviceRepository } from '../device/device.repository.js';
import type { RemoteConfigRepository } from '../remote-config/remote-config.repository.js';
import type { FraudEventRepository } from './fraud-event.repository.js';
import type { IntegrityVerifier } from './integrity-verifier.js';
import type { RateLimiter } from './rate-limiter.js';

// Upper bounds for security-critical knobs so a single absurd remote_config row
// (e.g. fraud_score_max = 1e9) can't turn a gate into a no-op (review C2).
const SCORE_CAP = 1000;
const VELOCITY_CAP = 1000;
const WINDOW_MIN = 1;
const WINDOW_MAX = 86_400; // 1 day
const DEDUP_MIN = 60;
const DEDUP_MAX = 604_800; // 1 week

interface FraudConfig {
  scoreEmulator: number;
  scoreRooted: number;
  scoreDebug: number;
  scoreUnknown: number;
  scoreIntegrityInvalid: number;
  scoreRewardVelocity: number;
  rewardVelocityWindowSec: number;
  rewardVelocityMax: number;
  /** Score strictly above this → device is silently throttled (§9 hidden cooldown). */
  fraudScoreMax: number;
  /** Don't re-raise the same integrity signal for a device within this window. */
  integrityDedupSec: number;
}

export interface RewardAssessment {
  blocked: boolean;
  score: number;
}

/**
 * Anti-fraud scoring engine (CLAUDE.md §9). Turns integrity heuristics and abuse
 * signals into `fraud_events` + a cumulative `fraud_score`, and decides whether a
 * money operation (reward) should be silently throttled. Reward amounts are never
 * touched here — fraud only ever DENIES, never credits (§7.3/§7.5).
 */
export class FraudService {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly events: FraudEventRepository,
    private readonly remoteConfig: RemoteConfigRepository,
    private readonly rateLimiter: RateLimiter,
    private readonly integrity: IntegrityVerifier,
    private readonly playIntegrityEnabled: boolean,
  ) {}

  /**
   * Scores a device from its reported integrity status and, when enabled, a Play
   * Integrity token. Runs on every register but is a no-op for a genuine device
   * (no DB work), and de-dupes each signal within a window so re-registers don't
   * inflate the score — while still catching a device that turns rooted later (M5).
   */
  async assessRegistration(
    deviceId: string,
    reportedStatus?: string | null,
    integrityToken?: string | null,
  ): Promise<void> {
    const status = (reportedStatus ?? '').toLowerCase();
    const statusSignal =
      status === 'emulator' || status === 'rooted' || status === 'root'
        ? status
        : status === 'debug' || status === 'unknown'
          ? status
          : null;
    const checkToken = this.playIntegrityEnabled && !!integrityToken;
    // Common case (genuine/empty status, no token) — skip config load + all DB work.
    if (!statusSignal && !checkToken) return;

    const cfg = await this.loadConfig();
    const flagOnce = async (
      eventType: string,
      severity: number,
      source: string,
      metadata?: unknown,
    ): Promise<void> => {
      if (severity <= 0) return;
      const since = new Date(Date.now() - cfg.integrityDedupSec * 1000);
      if ((await this.events.countByTypeSince(deviceId, eventType, since)) > 0) return;
      await this.flag(deviceId, eventType, severity, source, metadata);
    };

    if (statusSignal === 'emulator') {
      await flagOnce('emulator_detected', cfg.scoreEmulator, 'register');
    } else if (statusSignal === 'rooted' || statusSignal === 'root') {
      await flagOnce('rooted_device', cfg.scoreRooted, 'register');
    } else if (statusSignal === 'debug') {
      await flagOnce('debug_build', cfg.scoreDebug, 'register');
    } else if (statusSignal === 'unknown') {
      await flagOnce('integrity_unknown', cfg.scoreUnknown, 'register');
    }

    if (checkToken) {
      let valid = false;
      let reason = 'verify_error';
      try {
        const verdict = await this.integrity.verifyToken(integrityToken as string);
        valid = verdict.valid;
        reason = verdict.reason;
      } catch {
        // Verifier misconfigured/unreachable — treat as a failed verdict, never a
        // pass (fail closed on a security check).
      }
      if (!valid) {
        await flagOnce('integrity_token_invalid', cfg.scoreIntegrityInvalid, 'integrity', {
          reason,
        });
      }
    }
  }

  /**
   * Decides whether to grant a reward, keyed on the reward transaction so AdMob
   * SSV retries/replays neither double-count velocity nor double-deny (M4). The
   * over-cap decision uses the ATOMIC Redis counter directly, so a burst is hard
   * denied in real time (review C1) — not merely scored. Also throttles a device
   * whose cumulative score already exceeds the ceiling (§9 hidden cooldown).
   */
  async assessRewardGrant(deviceId: string, transactionId: string): Promise<RewardAssessment> {
    const cfg = await this.loadConfig();
    const device = await this.devices.findById(deviceId);
    const score = device?.fraudScore ?? 0;

    const fresh = await this.rateLimiter.firstSeen(
      `reward:txn:${transactionId}`,
      cfg.rewardVelocityWindowSec,
    );
    // Count once per transaction; retries only peek the current window.
    const count = fresh
      ? await this.rateLimiter.hit(`reward:${deviceId}`, cfg.rewardVelocityWindowSec)
      : await this.rateLimiter.peek(`reward:${deviceId}`);
    const overCap = count > cfg.rewardVelocityMax;

    // Raise the velocity flag only once, on the fresh over-cap hit, so the score
    // climbs per distinct abusive transaction (not per retry).
    if (fresh && overCap) {
      await this.flag(deviceId, 'reward_velocity', cfg.scoreRewardVelocity, 'reward', { count });
    }

    return { blocked: overCap || score > cfg.fraudScoreMax, score };
  }

  async listEvents(limit = 100): Promise<FraudEventView[]> {
    return this.events.listRecent(limit);
  }

  /** Records a fraud event and bumps the device's score by its severity. */
  private async flag(
    deviceId: string,
    eventType: string,
    severity: number,
    source: string,
    metadata?: unknown,
  ): Promise<void> {
    if (severity <= 0) return; // heuristic disabled via config
    await this.events.record({ deviceId, eventType, severity, source, metadata });
    await this.devices.addFraudScore(deviceId, severity);
  }

  private async loadConfig(): Promise<FraudConfig> {
    const rows = await this.remoteConfig.getAll();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const get = map.get.bind(map);
    return {
      scoreEmulator: configInt(get('fraud_score_emulator'), 30, { max: SCORE_CAP }),
      scoreRooted: configInt(get('fraud_score_rooted'), 40, { max: SCORE_CAP }),
      scoreDebug: configInt(get('fraud_score_debug'), 20, { max: SCORE_CAP }),
      scoreUnknown: configInt(get('fraud_score_unknown'), 5, { max: SCORE_CAP }),
      scoreIntegrityInvalid: configInt(get('fraud_score_integrity_invalid'), 40, {
        max: SCORE_CAP,
      }),
      scoreRewardVelocity: configInt(get('fraud_score_reward_velocity'), 15, { max: SCORE_CAP }),
      rewardVelocityWindowSec: configInt(get('reward_velocity_window_sec'), 3600, {
        min: WINDOW_MIN,
        max: WINDOW_MAX,
      }),
      rewardVelocityMax: configInt(get('reward_velocity_max'), 6, { max: VELOCITY_CAP }),
      // Shared with emergency access so one knob governs "is this device trusted".
      fraudScoreMax: configInt(get('fraud_score_max'), 50, { max: SCORE_CAP }),
      integrityDedupSec: configInt(get('fraud_integrity_dedup_sec'), 86_400, {
        min: DEDUP_MIN,
        max: DEDUP_MAX,
      }),
    };
  }
}

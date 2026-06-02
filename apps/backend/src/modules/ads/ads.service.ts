import { DeviceBlockedError, NotFoundError } from '../../lib/errors.js';
import type { DeviceRepository } from '../device/device.repository.js';
import type { LedgerRepository } from '../ledger/ledger.repository.js';
import type { FraudService } from '../fraud/fraud.service.js';
import type { AdSessionRepository } from './ad-session.repository.js';
import type { RewardService } from './reward.service.js';

export interface SsvRewardInput {
  sessionId: string;
  transactionId: string;
  rawCallback: unknown;
}

export class AdsService {
  constructor(
    private readonly adSessions: AdSessionRepository,
    private readonly devices: DeviceRepository,
    private readonly ledger: LedgerRepository,
    private readonly rewards: RewardService,
    private readonly fraud: FraudService,
  ) {}

  /** Opens an ad-watch attempt for a known, non-blocked device. */
  async startSession(deviceId: string, provider = 'admob'): Promise<{ sessionId: string }> {
    const device = await this.devices.findById(deviceId);
    if (!device) throw new NotFoundError('Device not found');
    if (device.isBlocked) throw new DeviceBlockedError();

    const session = await this.adSessions.create(deviceId, provider);
    return { sessionId: session.id };
  }

  /** Grants a server-verified reward for a completed ad session (idempotent). */
  async grantSsvReward(
    input: SsvRewardInput,
  ): Promise<{ granted: boolean; balanceMinutes: number }> {
    const session = await this.adSessions.findById(input.sessionId);
    if (!session) throw new NotFoundError('Ad session not found');

    // Anti-fraud gate (§9). A flagged device — or an over-cap velocity burst — is
    // silently throttled: the callback is acknowledged 200/granted:false but
    // nothing is credited (hidden cooldown). Keyed on transactionId so AdMob SSV
    // retries don't double-count. Fraud only ever DENIES.
    const assessment = await this.fraud.assessRewardGrant(session.deviceId, input.transactionId);
    if (assessment.blocked) {
      const balanceMinutes = await this.ledger.getBalance(session.deviceId);
      return { granted: false, balanceMinutes };
    }

    const result = await this.rewards.grantAdReward({
      deviceId: session.deviceId,
      transactionId: input.transactionId,
      source: 'admob_ssv',
      sessionId: session.id,
      rawCallback: input.rawCallback,
    });

    if (result.granted) await this.adSessions.markRewarded(session.id, result.minutes);
    return { granted: result.granted, balanceMinutes: result.balanceMinutes };
  }
}

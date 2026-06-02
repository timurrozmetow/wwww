import type { RewardSource } from '@vpn/types';
import type { LedgerRepository } from '../ledger/ledger.repository.js';
import type { RemoteConfigService } from '../remote-config/remote-config.service.js';
import type { RewardTransactionRepository } from './reward-transaction.repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface GrantAdRewardInput {
  deviceId: string;
  transactionId: string;
  source: RewardSource;
  sessionId?: string;
  rawCallback?: unknown;
}

export interface GrantResult {
  granted: boolean;
  minutes: number;
  balanceMinutes: number;
}

/**
 * Credits ad rewards. The amount is ALWAYS server-controlled (from remote
 * config, §8) — never trusted from the client or the ad network. Idempotent on
 * `transactionId` via the ledger's unique reference (§7.3/§7.4).
 */
export class RewardService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly rewardTransactions: RewardTransactionRepository,
    private readonly config: RemoteConfigService,
  ) {}

  async grantAdReward(input: GrantAdRewardInput): Promise<GrantResult> {
    const appConfig = await this.config.getAppConfig();
    const minutes = appConfig.rewardMinutesPerAd;
    const expiresAt = new Date(Date.now() + appConfig.maxBalanceDays * DAY_MS);

    const { created } = await this.ledger.append({
      deviceId: input.deviceId,
      entryType: 'reward_ad',
      minutes,
      referenceId: input.transactionId,
      expiresAt,
      metadata: { source: input.source, sessionId: input.sessionId ?? null },
    });

    if (created) {
      // Best-effort audit; the ledger row is the source of truth.
      await this.rewardTransactions.record({
        transactionId: input.transactionId,
        deviceId: input.deviceId,
        sessionId: input.sessionId ?? null,
        source: input.source,
        minutes,
        rawCallback: input.rawCallback ?? null,
      });
    }

    const balanceMinutes = await this.ledger.getBalance(input.deviceId);
    return { granted: created, minutes, balanceMinutes };
  }
}

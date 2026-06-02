import type { RewardSource } from '@vpn/types';
import { getDb } from '../../db/client.js';
import { rewardTransactions } from '../../db/schema/index.js';
import { isDuplicateKeyError } from '../../lib/db-errors.js';

export interface RecordRewardInput {
  transactionId: string;
  deviceId: string;
  sessionId: string | null;
  source: RewardSource;
  minutes: number;
  rawCallback: unknown;
}

/** Audit-only write of a granted reward + its raw callback. Best-effort. */
export interface RewardTransactionRepository {
  record(input: RecordRewardInput): Promise<void>;
}

export class DrizzleRewardTransactionRepository implements RewardTransactionRepository {
  async record(input: RecordRewardInput): Promise<void> {
    try {
      await getDb()
        .insert(rewardTransactions)
        .values({
          transactionId: input.transactionId,
          deviceId: input.deviceId,
          sessionId: input.sessionId,
          source: input.source,
          minutes: input.minutes,
          rawCallback: input.rawCallback ?? null,
        });
    } catch (err) {
      // The ledger is the idempotency gate; a duplicate audit row is harmless.
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
}

export class InMemoryRewardTransactionRepository implements RewardTransactionRepository {
  readonly records: RecordRewardInput[] = [];

  async record(input: RecordRewardInput): Promise<void> {
    this.records.push(input);
  }
}

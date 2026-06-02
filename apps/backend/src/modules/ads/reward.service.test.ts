import { describe, expect, it } from 'vitest';
import { InMemoryLedgerRepository } from '../ledger/ledger.repository.js';
import { InMemoryRemoteConfigRepository } from '../remote-config/remote-config.repository.js';
import { RemoteConfigService } from '../remote-config/remote-config.service.js';
import { InMemoryRewardTransactionRepository } from './reward-transaction.repository.js';
import { RewardService } from './reward.service.js';

function makeService(rewardMinutes?: number) {
  const ledger = new InMemoryLedgerRepository();
  const rewardTx = new InMemoryRewardTransactionRepository();
  const rows =
    rewardMinutes !== undefined
      ? [{ key: 'reward_minutes_per_ad', value: String(rewardMinutes), valueType: 'number' }]
      : [];
  const config = new RemoteConfigService(new InMemoryRemoteConfigRepository(rows));
  return { service: new RewardService(ledger, rewardTx, config), ledger, rewardTx };
}

describe('RewardService.grantAdReward', () => {
  it('grants the configured minutes once', async () => {
    const { service } = makeService();
    const res = await service.grantAdReward({
      deviceId: 'd1',
      transactionId: 't1',
      source: 'admob_ssv',
    });
    expect(res.granted).toBe(true);
    expect(res.minutes).toBe(30);
    expect(res.balanceMinutes).toBe(30);
  });

  it('is idempotent on transactionId (no double credit, single audit row)', async () => {
    const { service, rewardTx } = makeService();
    await service.grantAdReward({ deviceId: 'd1', transactionId: 't1', source: 'admob_ssv' });
    const second = await service.grantAdReward({
      deviceId: 'd1',
      transactionId: 't1',
      source: 'admob_ssv',
    });
    expect(second.granted).toBe(false);
    expect(second.balanceMinutes).toBe(30);
    expect(rewardTx.records).toHaveLength(1);
  });

  it('accumulates distinct transactions', async () => {
    const { service } = makeService();
    await service.grantAdReward({ deviceId: 'd1', transactionId: 't1', source: 'admob_ssv' });
    const r2 = await service.grantAdReward({
      deviceId: 'd1',
      transactionId: 't2',
      source: 'admob_ssv',
    });
    expect(r2.balanceMinutes).toBe(60);
  });

  it('uses the server-controlled amount from remote config (ignores the network)', async () => {
    const { service } = makeService(45);
    const res = await service.grantAdReward({
      deviceId: 'd1',
      transactionId: 't1',
      source: 'admob_ssv',
    });
    expect(res.minutes).toBe(45);
    expect(res.balanceMinutes).toBe(45);
  });
});

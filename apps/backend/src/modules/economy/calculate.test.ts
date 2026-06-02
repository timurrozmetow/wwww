import { describe, expect, it } from 'vitest';
import type { EconomyInputs } from '@vpn/types';
import { calculateEconomy } from './calculate.js';

const base: EconomyInputs = {
  activeUsers: 1000,
  avgVpnHoursPerUserPerDay: 1,
  rewardMinutesPerAd: 30,
  eCPM: 5,
  fillRate: 0.7,
  avgGbPerHour: 0.5,
  trafficCostPerTb: 5,
};

describe('calculateEconomy', () => {
  it('computes ads, revenue, traffic and profit for a known scenario', () => {
    const r = calculateEconomy(base);
    // 1h/day ÷ 30min = 2 ads/user/day × 1000 users
    expect(r.adsPerDay).toBe(2000);
    expect(r.adsPerMonth).toBe(60000);
    // 60000 × 0.7 = 42000 filled → /1000 × $5
    expect(r.expectedRevenue).toBeCloseTo(210, 6);
    // 1000 × 1h × 30d × 0.5GB ÷ 1024
    expect(r.expectedTrafficTb).toBeCloseTo(14.6484, 3);
    expect(r.estimatedTrafficCost).toBeCloseTo(73.2422, 3);
    expect(r.profitLoss).toBeCloseTo(136.7578, 3);
  });

  it('break-even eCPM zeroes the profit when used as eCPM', () => {
    const r = calculateEconomy(base);
    const atBreakEven = calculateEconomy({ ...base, eCPM: r.breakEvenEcpm });
    expect(atBreakEven.profitLoss).toBeCloseTo(0, 6);
  });

  it('scales revenue and traffic linearly with users (break-even eCPM invariant)', () => {
    const r1 = calculateEconomy(base);
    const r10 = calculateEconomy({ ...base, activeUsers: 10_000 });
    expect(r10.expectedRevenue).toBeCloseTo(r1.expectedRevenue * 10, 6);
    expect(r10.expectedTrafficTb).toBeCloseTo(r1.expectedTrafficTb * 10, 6);
    expect(r10.breakEvenEcpm).toBeCloseTo(r1.breakEvenEcpm, 6);
  });

  it('is safe when reward minutes is the schema minimum and fill rate is zero', () => {
    const r = calculateEconomy({ ...base, fillRate: 0 });
    expect(r.expectedRevenue).toBe(0);
    expect(r.breakEvenEcpm).toBe(0);
    expect(r.profitLoss).toBeCloseTo(-r.estimatedTrafficCost, 6);
  });
});

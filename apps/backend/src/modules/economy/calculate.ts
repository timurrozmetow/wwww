import type { EconomyInputs, EconomyResult } from '@vpn/types';

const DAYS_PER_MONTH = 30;
const GB_PER_TB = 1024;

/**
 * Pure break-even calculator (SPEC §"Admin financial analytics"). All money/
 * traffic figures are MONTHLY except `adsPerDay`. Revenue counts only filled
 * impressions; break-even eCPM is where monthly revenue == traffic cost.
 */
export function calculateEconomy(i: EconomyInputs): EconomyResult {
  const adsPerUserPerDay =
    i.rewardMinutesPerAd > 0 ? (i.avgVpnHoursPerUserPerDay * 60) / i.rewardMinutesPerAd : 0;
  const adsPerDay = i.activeUsers * adsPerUserPerDay;
  const adsPerMonth = adsPerDay * DAYS_PER_MONTH;

  const filledImpressions = adsPerMonth * i.fillRate;
  const expectedRevenue = (filledImpressions / 1000) * i.eCPM;

  const expectedTrafficTb =
    (i.activeUsers * i.avgVpnHoursPerUserPerDay * DAYS_PER_MONTH * i.avgGbPerHour) / GB_PER_TB;
  const estimatedTrafficCost = expectedTrafficTb * i.trafficCostPerTb;

  const profitLoss = expectedRevenue - estimatedTrafficCost;
  const breakEvenEcpm =
    filledImpressions > 0 ? (estimatedTrafficCost * 1000) / filledImpressions : 0;

  return {
    adsPerDay,
    adsPerMonth,
    expectedRevenue,
    expectedTrafficTb,
    estimatedTrafficCost,
    profitLoss,
    breakEvenEcpm,
  };
}

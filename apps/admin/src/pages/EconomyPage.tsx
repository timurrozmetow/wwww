import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { EconomyInputs } from '@vpn/types';
import { adminApi } from '../api/admin';

const DEFAULTS: EconomyInputs = {
  activeUsers: 1000,
  avgVpnHoursPerUserPerDay: 1.5,
  rewardMinutesPerAd: 30,
  eCPM: 4,
  fillRate: 0.6,
  avgGbPerHour: 0.7,
  trafficCostPerTb: 5,
};

const FIELDS: { key: keyof EconomyInputs; label: string; step: string }[] = [
  { key: 'activeUsers', label: 'Active users', step: '1' },
  { key: 'avgVpnHoursPerUserPerDay', label: 'VPN hours / user / day', step: '0.1' },
  { key: 'rewardMinutesPerAd', label: 'Reward minutes / ad', step: '1' },
  { key: 'eCPM', label: 'eCPM ($)', step: '0.1' },
  { key: 'fillRate', label: 'Fill rate (0–1)', step: '0.05' },
  { key: 'avgGbPerHour', label: 'Avg GB / hour', step: '0.1' },
  { key: 'trafficCostPerTb', label: 'Traffic cost / TB ($)', step: '0.5' },
];

const PROJECTION_USERS = [1000, 5000, 10000];

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (n: number, digits = 0) =>
  n.toLocaleString(undefined, { maximumFractionDigits: digits });

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-100">{value}</div>
    </div>
  );
}

export function EconomyPage() {
  const overview = useQuery({ queryKey: ['economy-overview'], queryFn: adminApi.economyOverview });
  const calc = useMutation({ mutationFn: adminApi.economyCalculate });
  const [inputs, setInputs] = useState<EconomyInputs>(DEFAULTS);

  useEffect(() => {
    calc.mutate(DEFAULTS);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    calc.mutate(inputs);
  };

  const result = calc.data;
  const baseUsers = calc.variables?.activeUsers ?? inputs.activeUsers;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
          Overview (from ledger)
        </h2>
        {overview.data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Devices" value={num(overview.data.totalDevices)} />
            <Stat label="Reward min granted" value={num(overview.data.rewardMinutesGranted)} />
            <Stat label="Emergency min" value={num(overview.data.emergencyMinutesGranted)} />
            <Stat label="VPN min used" value={num(overview.data.vpnMinutesUsed)} />
            <Stat label="Ad sessions" value={num(overview.data.adSessions)} />
          </div>
        ) : (
          <p className="text-slate-400">Loading…</p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
        >
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-400">
            Break-even calculator
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="text-sm text-slate-300">
                {f.label}
                <input
                  type="number"
                  step={f.step}
                  min={0}
                  value={inputs[f.key]}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
                />
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={calc.isPending}
            className="mt-4 w-full rounded-lg bg-blue-600 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Calculate
          </button>
        </form>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-400">
            Monthly result
          </h2>
          {result ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Ads / month" value={num(result.adsPerMonth)} />
              <Stat label="Revenue" value={money(result.expectedRevenue)} />
              <Stat label="Traffic" value={`${num(result.expectedTrafficTb, 1)} TB`} />
              <Stat label="Traffic cost" value={money(result.estimatedTrafficCost)} />
              <Stat label="Profit / loss" value={money(result.profitLoss)} />
              <Stat label="Break-even eCPM" value={money(result.breakEvenEcpm)} />
            </div>
          ) : (
            <p className="text-slate-400">Enter inputs and calculate.</p>
          )}
        </div>
      </section>

      {result ? (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
            Projections (scaled by users)
          </h2>
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Users</th>
                  <th className="px-4 py-3 font-medium">Ads / month</th>
                  <th className="px-4 py-3 font-medium">Revenue</th>
                  <th className="px-4 py-3 font-medium">Traffic</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium">Profit / loss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950/40 text-slate-200">
                {PROJECTION_USERS.map((users) => {
                  const factor = baseUsers > 0 ? users / baseUsers : 0;
                  const revenue = result.expectedRevenue * factor;
                  const cost = result.estimatedTrafficCost * factor;
                  return (
                    <tr key={users}>
                      <td className="px-4 py-3">{num(users)}</td>
                      <td className="px-4 py-3">{num(result.adsPerMonth * factor)}</td>
                      <td className="px-4 py-3">{money(revenue)}</td>
                      <td className="px-4 py-3">{num(result.expectedTrafficTb * factor, 1)} TB</td>
                      <td className="px-4 py-3">{money(cost)}</td>
                      <td
                        className={
                          revenue - cost >= 0
                            ? 'px-4 py-3 text-green-400'
                            : 'px-4 py-3 text-red-400'
                        }
                      >
                        {money(revenue - cost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

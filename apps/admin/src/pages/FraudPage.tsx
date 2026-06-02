import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../api/admin';

const SOURCE_COLORS: Record<string, string> = {
  register: 'text-sky-300',
  reward: 'text-amber-300',
  integrity: 'text-fuchsia-300',
  admin: 'text-slate-300',
};

export function FraudPage() {
  const events = useQuery({ queryKey: ['fraud-events'], queryFn: adminApi.fraudEvents });

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Anti-fraud signals. Each event adds its severity to the device&apos;s fraud score; a device
        over <span className="font-mono">fraud_score_max</span> is silently throttled (no reward, no
        emergency). Thresholds and severities live in the{' '}
        <span className="font-medium">Remote Config</span> tab (
        <span className="font-mono">fraud_score_max</span>,{' '}
        <span className="font-mono">reward_velocity_max</span>, …).
      </p>

      {events.isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : events.isError || !events.data ? (
        <p className="text-red-400">Failed to load fraud events.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950/40 text-slate-200">
              {events.data.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 text-xs text-slate-400">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{e.deviceId.slice(0, 8)}…</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.eventType}</td>
                  <td className="px-4 py-2 font-medium text-red-300">+{e.severity}</td>
                  <td
                    className={`px-4 py-2 text-xs ${SOURCE_COLORS[e.source] ?? 'text-slate-400'}`}
                  >
                    {e.source}
                  </td>
                </tr>
              ))}
              {events.data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No fraud events yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

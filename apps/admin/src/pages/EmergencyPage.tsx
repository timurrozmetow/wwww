import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../api/admin';

export function EmergencyPage() {
  const logs = useQuery({ queryKey: ['emergency-logs'], queryFn: adminApi.emergencyLogs });

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Emergency access (15 free minutes when all ad networks fail). Limits live in the{' '}
        <span className="font-medium">Remote Config</span> tab (
        <span className="font-mono">emergency_access_enabled</span>,{' '}
        <span className="font-mono">cooldown_hours</span>,{' '}
        <span className="font-mono">max_emergency_per_day</span>, …).
      </p>

      {logs.isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : logs.isError || !logs.data ? (
        <p className="text-red-400">Failed to load emergency logs.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="px-4 py-3 font-medium">Result</th>
                <th className="px-4 py-3 font-medium">Minutes</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Failed nets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950/40 text-slate-200">
              {logs.data.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 text-xs text-slate-400">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{l.deviceId.slice(0, 8)}…</td>
                  <td className="px-4 py-2">
                    {l.granted ? (
                      <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-400">
                        granted
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-600/20 px-2 py-0.5 text-xs text-slate-400">
                        denied
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{l.minutes}</td>
                  <td className="px-4 py-2 font-mono text-xs">{l.reason}</td>
                  <td className="px-4 py-2">{l.failedNetworks}</td>
                </tr>
              ))}
              {logs.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No emergency events yet.
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

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../api/admin';

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-2 text-3xl font-bold text-slate-100">{value}</div>
    </div>
  );
}

export function DashboardPage() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: adminApi.dashboard });

  if (q.isLoading) return <p className="text-slate-400">Loading…</p>;
  if (q.isError || !q.data) return <p className="text-red-400">Failed to load dashboard.</p>;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total devices" value={q.data.totalDevices} />
      <StatCard label="Blocked devices" value={q.data.blockedDevices} />
      <StatCard label="Reward minutes granted" value={q.data.rewardMinutesGranted} />
      <StatCard label="Ad sessions" value={q.data.adSessions} />
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeviceListItem } from '@vpn/types';
import { adminApi } from '../api/admin';

const PAGE_SIZE = 20;

export function DevicesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ['devices', page],
    queryFn: () => adminApi.devices(page, PAGE_SIZE),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['devices'] });
  const block = useMutation({ mutationFn: adminApi.block, onSuccess: invalidate });
  const unblock = useMutation({ mutationFn: adminApi.unblock, onSuccess: invalidate });
  const mutating = block.isPending || unblock.isPending;

  if (q.isLoading) return <p className="text-slate-400">Loading…</p>;
  if (q.isError || !q.data) return <p className="text-red-400">Failed to load devices.</p>;

  const totalPages = Math.max(1, Math.ceil(q.data.total / PAGE_SIZE));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">Device</th>
            <th className="px-4 py-3 font-medium">Lang</th>
            <th className="px-4 py-3 font-medium">Country</th>
            <th className="px-4 py-3 font-medium">App</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-950/40">
          {q.data.items.map((d: DeviceListItem) => (
            <tr key={d.deviceId} className="text-slate-200">
              <td className="px-4 py-3 font-mono text-xs">{d.deviceId.slice(0, 8)}…</td>
              <td className="px-4 py-3 uppercase">{d.language}</td>
              <td className="px-4 py-3">{d.country ?? '—'}</td>
              <td className="px-4 py-3">{d.appVersion}</td>
              <td className="px-4 py-3">
                {d.isBlocked ? (
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                    blocked
                  </span>
                ) : (
                  <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-400">
                    active
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                {d.isBlocked ? (
                  <button
                    disabled={mutating}
                    onClick={() => unblock.mutate(d.deviceId)}
                    className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-green-500 disabled:opacity-50"
                  >
                    Unblock
                  </button>
                ) : (
                  <button
                    disabled={mutating}
                    onClick={() => block.mutate(d.deviceId)}
                    className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-red-500 disabled:opacity-50"
                  >
                    Block
                  </button>
                )}
              </td>
            </tr>
          ))}
          {q.data.items.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                No devices yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-sm text-slate-400">
        <span>
          {q.data.total} devices · page {page}/{totalPages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminAdProvider, AdminAdProviderUpdate } from '@vpn/types';
import { adminApi } from '../api/admin';

const inputCls =
  'w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100 outline-none focus:border-blue-500';

interface Draft {
  priority: number;
  ecpmEstimate: number;
  fillRate: number;
  adUnitId: string;
  timeoutMs: number;
}

function toDraft(p: AdminAdProvider): Draft {
  return {
    priority: p.priority,
    ecpmEstimate: p.ecpmEstimate,
    fillRate: p.fillRate,
    adUnitId: p.adUnitId,
    timeoutMs: p.timeoutMs,
  };
}

export function AdsPage() {
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ['ad-providers'], queryFn: adminApi.adProviders });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['ad-providers'] });

  const update = useMutation({
    mutationFn: (v: { id: number; body: AdminAdProviderUpdate }) =>
      adminApi.updateAdProvider(v.id, v.body),
    onSuccess: invalidate,
  });
  const toggle = useMutation({
    mutationFn: (v: { id: number; enabled: boolean }) => adminApi.toggleAdProvider(v.id, v.enabled),
    onSuccess: invalidate,
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const startEdit = (p: AdminAdProvider) => {
    setEditId(p.id);
    setDraft(toDraft(p));
  };
  const cancel = () => {
    setEditId(null);
    setDraft(null);
  };
  const save = (id: number) => {
    if (!draft) return;
    update.mutate({ id, body: draft }, { onSuccess: cancel });
  };

  const rows = providers.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
          Ad waterfall — mediation order
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Lower priority is tried first. Disabled providers and the eCPM / fill columns never reach
          the app — the client only receives order, ad unit and timeout.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Prio</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">eCPM $</th>
              <th className="px-4 py-3 font-medium">Fill</th>
              <th className="px-4 py-3 font-medium">Ad unit</th>
              <th className="px-4 py-3 font-medium">Timeout</th>
              <th className="px-4 py-3 font-medium">Enabled</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950/40 text-slate-200">
            {rows.map((p) => {
              const editing = editId === p.id && draft;
              return (
                <tr key={p.id} className={p.enabled ? '' : 'opacity-50'}>
                  <td className="px-4 py-2">
                    {editing ? (
                      <input
                        type="number"
                        value={draft.priority}
                        onChange={(e) =>
                          setDraft((d) => d && { ...d, priority: Number(e.target.value) })
                        }
                        className={inputCls}
                      />
                    ) : (
                      p.priority
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-xs text-slate-500">{p.key}</div>
                  </td>
                  <td className="px-4 py-2">
                    {editing ? (
                      <input
                        type="number"
                        step="0.1"
                        value={draft.ecpmEstimate}
                        onChange={(e) =>
                          setDraft((d) => d && { ...d, ecpmEstimate: Number(e.target.value) })
                        }
                        className={inputCls}
                      />
                    ) : (
                      p.ecpmEstimate.toFixed(2)
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {editing ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={draft.fillRate}
                        onChange={(e) =>
                          setDraft((d) => d && { ...d, fillRate: Number(e.target.value) })
                        }
                        className={inputCls}
                      />
                    ) : (
                      `${Math.round(p.fillRate * 100)}%`
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {editing ? (
                      <input
                        value={draft.adUnitId}
                        onChange={(e) => setDraft((d) => d && { ...d, adUnitId: e.target.value })}
                        className={`${inputCls} w-44`}
                      />
                    ) : (
                      <span className="font-mono text-xs text-slate-400">{p.adUnitId}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {editing ? (
                      <input
                        type="number"
                        value={draft.timeoutMs}
                        onChange={(e) =>
                          setDraft((d) => d && { ...d, timeoutMs: Number(e.target.value) })
                        }
                        className={inputCls}
                      />
                    ) : (
                      `${p.timeoutMs}ms`
                    )}
                  </td>
                  <td className="px-4 py-2">{p.enabled ? 'yes' : 'no'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      {editing ? (
                        <>
                          <button
                            disabled={update.isPending}
                            onClick={() => save(p.id)}
                            className="rounded-md border border-blue-600 bg-blue-600/20 px-2 py-1 text-xs text-blue-200 hover:bg-blue-600/40 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancel}
                            className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:border-slate-500"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(p)}
                            className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:border-blue-500"
                          >
                            Edit
                          </button>
                          <button
                            disabled={toggle.isPending}
                            onClick={() => toggle.mutate({ id: p.id, enabled: !p.enabled })}
                            className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:border-blue-500 disabled:opacity-50"
                          >
                            {p.enabled ? 'Disable' : 'Enable'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  {providers.isLoading ? 'Loading…' : 'No ad providers.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

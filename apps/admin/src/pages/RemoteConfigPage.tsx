import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  REMOTE_CONFIG_VALUE_TYPES,
  type RemoteConfigItem,
  type RemoteConfigSetRequest,
  type RemoteConfigValueType,
} from '@vpn/types';
import { adminApi } from '../api/admin';

const inputCls =
  'rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500';

export function RemoteConfigPage() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ['remote-config'], queryFn: adminApi.remoteConfig });
  const save = useMutation({
    mutationFn: (body: RemoteConfigSetRequest) => adminApi.setRemoteConfig(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['remote-config'] }),
  });

  // Per-row edit overlay (key → draft).
  const [edits, setEdits] = useState<Record<string, { value: string; valueType: string }>>({});
  const draftFor = (item: RemoteConfigItem) =>
    edits[item.key] ?? { value: item.value, valueType: item.valueType };

  const [newRow, setNewRow] = useState<{
    key: string;
    value: string;
    valueType: RemoteConfigValueType;
  }>({ key: '', value: '', valueType: 'string' });

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!newRow.key) return;
    save.mutate(newRow, {
      onSuccess: () => setNewRow({ key: '', value: '', valueType: 'string' }),
    });
  };

  if (config.isLoading) return <p className="text-slate-400">Loading…</p>;
  if (config.isError || !config.data)
    return <p className="text-red-400">Failed to load remote config.</p>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">
        Keys here drive <span className="font-mono">GET /api/app/config</span> (e.g.{' '}
        <span className="font-mono">reward_minutes_per_ad</span>,{' '}
        <span className="font-mono">emergency_minutes</span>,{' '}
        <span className="font-mono">maintenance_mode</span>). Changes apply immediately.
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Value</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950/40 text-slate-200">
            {config.data.map((item) => {
              const draft = draftFor(item);
              return (
                <tr key={item.key}>
                  <td className="px-4 py-2 font-mono text-xs">{item.key}</td>
                  <td className="px-4 py-2">
                    <input
                      value={draft.value}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [item.key]: { value: e.target.value, valueType: draft.valueType },
                        }))
                      }
                      className={`w-full ${inputCls}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={draft.valueType}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [item.key]: { value: draft.value, valueType: e.target.value },
                        }))
                      }
                      className={inputCls}
                    >
                      {REMOTE_CONFIG_VALUE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      disabled={save.isPending}
                      onClick={() =>
                        save.mutate({
                          key: item.key,
                          value: draft.value,
                          valueType: draft.valueType as RemoteConfigValueType,
                        })
                      }
                      className="rounded-md border border-slate-700 px-3 py-1 text-xs hover:border-blue-500 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
            {config.data.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No keys yet — add one below.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={onAdd}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
      >
        <label className="text-sm text-slate-300">
          Key
          <input
            value={newRow.key}
            onChange={(e) => setNewRow((r) => ({ ...r, key: e.target.value }))}
            className={`mt-1 block ${inputCls}`}
          />
        </label>
        <label className="text-sm text-slate-300">
          Value
          <input
            value={newRow.value}
            onChange={(e) => setNewRow((r) => ({ ...r, value: e.target.value }))}
            className={`mt-1 block ${inputCls}`}
          />
        </label>
        <label className="text-sm text-slate-300">
          Type
          <select
            value={newRow.valueType}
            onChange={(e) =>
              setNewRow((r) => ({ ...r, valueType: e.target.value as RemoteConfigValueType }))
            }
            className={`mt-1 block ${inputCls}`}
          >
            {REMOTE_CONFIG_VALUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          Add / set
        </button>
      </form>
    </div>
  );
}

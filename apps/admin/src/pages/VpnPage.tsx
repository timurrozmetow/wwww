import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminVpnServer } from '@vpn/types';
import { adminApi } from '../api/admin';

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'online'
      ? 'bg-green-500/15 text-green-400'
      : status === 'degraded'
        ? 'bg-amber-500/15 text-amber-400'
        : 'bg-red-500/15 text-red-400';
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{status}</span>;
}

export function VpnPage() {
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ['vpn-providers'], queryFn: adminApi.vpnProviders });
  const servers = useQuery({ queryKey: ['vpn-servers'], queryFn: adminApi.vpnServers });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['vpn-servers'] });
    void qc.invalidateQueries({ queryKey: ['vpn-providers'] });
  };
  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => adminApi.toggleVpnServer(v.id, v.enabled),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: adminApi.deleteVpnServer, onSuccess: invalidate });
  const create = useMutation({ mutationFn: adminApi.createVpnServer, onSuccess: invalidate });
  const importSource = useMutation({ mutationFn: adminApi.importVpnSource, onSuccess: invalidate });
  const ping = useMutation({ mutationFn: adminApi.pingVpnServers, onSuccess: invalidate });

  const [form, setForm] = useState({ providerId: '', country: '', name: '', pingMs: 50 });
  const [importForm, setImportForm] = useState({ providerId: '', source: '', country: '' });
  const providerOptions = providers.data ?? [];

  const onImport = (e: FormEvent) => {
    e.preventDefault();
    const providerId = importForm.providerId || providerOptions[0]?.id;
    if (!providerId || !importForm.source.trim()) return;
    importSource.mutate(
      {
        providerId,
        source: importForm.source.trim(),
        country: importForm.country.trim() || undefined,
      },
      { onSuccess: () => setImportForm({ providerId: '', source: '', country: '' }) },
    );
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    const providerId = form.providerId || providerOptions[0]?.id;
    if (!providerId || !form.country || !form.name) return;
    create.mutate(
      { providerId, country: form.country, name: form.name, pingMs: form.pingMs },
      { onSuccess: () => setForm({ providerId: '', country: '', name: '', pingMs: 50 }) },
    );
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
          Import servers
        </h2>
        <form
          onSubmit={onImport}
          className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
        >
          <p className="text-xs text-slate-400">
            Paste a <code className="text-slate-300">happ://crypt4/…</code> link, a subscription
            URL, or vless/vmess/trojan/ss lines. The backend decodes &amp; creates one server per
            config. The raw config never reaches the app UI.
          </p>
          <textarea
            value={importForm.source}
            onChange={(e) => setImportForm((f) => ({ ...f, source: e.target.value }))}
            placeholder="happ://crypt4/…  or  https://sub.example.com/…  or  vless://…"
            rows={3}
            className="block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
          />
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-300">
              Provider
              <select
                value={importForm.providerId || providerOptions[0]?.id || ''}
                onChange={(e) => setImportForm((f) => ({ ...f, providerId: e.target.value }))}
                className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              >
                {providerOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-300">
              Fallback country
              <input
                value={importForm.country}
                maxLength={8}
                placeholder="TM"
                onChange={(e) =>
                  setImportForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))
                }
                className="mt-1 block w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
            <button
              type="submit"
              disabled={importSource.isPending || !importForm.source.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {importSource.isPending ? 'Importing…' : 'Import'}
            </button>
            {importSource.isSuccess ? (
              <span className="text-sm text-green-400">
                Imported {importSource.data.total} server(s) ({importSource.data.sourceKind}).
              </span>
            ) : null}
            {importSource.isError ? (
              <span className="text-sm text-red-400">
                {(importSource.error as Error).message}
              </span>
            ) : null}
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
          Providers
        </h2>
        <div className="flex flex-wrap gap-3">
          {providerOptions.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm"
            >
              <div className="font-medium text-slate-100">{p.name}</div>
              <div className="text-slate-400">
                {p.serverCount} servers · {p.enabled ? 'enabled' : 'disabled'}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">Servers</h2>
          <div className="flex items-center gap-3">
            {ping.isSuccess ? (
              <span className="text-xs text-green-400">Pinged {ping.data.checked} server(s)</span>
            ) : null}
            {ping.isError ? (
              <span className="text-xs text-red-400">{(ping.error as Error).message}</span>
            ) : null}
            <button
              onClick={() => ping.mutate()}
              disabled={ping.isPending}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs hover:border-blue-500 disabled:opacity-50"
            >
              {ping.isPending ? 'Checking…' : 'Check ping'}
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Country</th>
                <th className="px-4 py-3 font-medium">Host</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Ping</th>
                <th className="px-4 py-3 font-medium">Load</th>
                <th className="px-4 py-3 font-medium">Enabled</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950/40 text-slate-200">
              {(servers.data ?? []).map((s: AdminVpnServer) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">{s.name}</td>
                  <td className="px-4 py-3 uppercase">{s.country}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{s.host ?? '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3">{s.pingMs} ms</td>
                  <td className="px-4 py-3">{s.loadPercent}%</td>
                  <td className="px-4 py-3">{s.enabled ? 'yes' : 'no'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        disabled={toggle.isPending}
                        onClick={() => toggle.mutate({ id: s.id, enabled: !s.enabled })}
                        className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:border-blue-500 disabled:opacity-50"
                      >
                        {s.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(s.id)}
                        className="rounded-md border border-slate-700 px-2 py-1 text-xs text-red-300 hover:border-red-500 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(servers.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No servers.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
          Add server
        </h2>
        <form
          onSubmit={onCreate}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
        >
          <label className="text-sm text-slate-300">
            Provider
            <select
              value={form.providerId || providerOptions[0]?.id || ''}
              onChange={(e) => setForm((f) => ({ ...f, providerId: e.target.value }))}
              className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            >
              {providerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            Country
            <input
              value={form.country}
              maxLength={8}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))}
              className="mt-1 block w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="text-sm text-slate-300">
            Name
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="text-sm text-slate-300">
            Ping (ms)
            <input
              type="number"
              min={0}
              value={form.pingMs}
              onChange={(e) => setForm((f) => ({ ...f, pingMs: Number(e.target.value) }))}
              className="mt-1 block w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </section>
    </div>
  );
}

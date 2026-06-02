import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BANNER_SEGMENTS,
  type AdminBanner,
  type AdminPushCampaign,
  type BannerSegment,
} from '@vpn/types';
import { adminApi } from '../api/admin';

const LANGUAGES = ['', 'ru', 'tr', 'tk'] as const;
const inputCls =
  'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-blue-500';

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-slate-400',
  sending: 'text-amber-300',
  sent: 'text-emerald-300',
  failed: 'text-red-300',
};

interface BannerDraft {
  title: string;
  body: string;
  language: string;
  segment: BannerSegment;
  priority: number;
}

const EMPTY_BANNER: BannerDraft = {
  title: '',
  body: '',
  language: '',
  segment: 'all',
  priority: 0,
};

interface CampaignDraft {
  title: string;
  body: string;
  language: string;
  segment: BannerSegment;
  country: string;
}

const EMPTY_CAMPAIGN: CampaignDraft = {
  title: '',
  body: '',
  language: '',
  segment: 'all',
  country: '',
};

function PushCampaignsSection() {
  const qc = useQueryClient();
  const campaigns = useQuery({ queryKey: ['push-campaigns'], queryFn: adminApi.pushCampaigns });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['push-campaigns'] });

  const create = useMutation({ mutationFn: adminApi.createPushCampaign, onSuccess: invalidate });
  const send = useMutation({ mutationFn: adminApi.sendPushCampaign, onSuccess: invalidate });

  const [draft, setDraft] = useState<CampaignDraft>(EMPTY_CAMPAIGN);

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.title || !draft.body) return;
    create.mutate(
      {
        title: draft.title,
        body: draft.body,
        language: draft.language ? (draft.language as 'ru' | 'tr' | 'tk') : null,
        segment: draft.segment,
        country: draft.country || null,
      },
      { onSuccess: () => setDraft(EMPTY_CAMPAIGN) },
    );
  };

  return (
    <>
      <section>
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-slate-400">
          Push campaigns
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Targeted FCM broadcasts. Send is queued to a worker; recipients are resolved by language /
          balance segment / country at send time.
        </p>
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Body</th>
                <th className="px-4 py-3 font-medium">Lang</th>
                <th className="px-4 py-3 font-medium">Segment</th>
                <th className="px-4 py-3 font-medium">Country</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sent / Recip.</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950/40 text-slate-200">
              {(campaigns.data ?? []).map((c: AdminPushCampaign) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 font-medium">{c.title}</td>
                  <td className="px-4 py-2 text-slate-400">{c.body}</td>
                  <td className="px-4 py-2 uppercase">{c.language ?? 'all'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{c.segment}</td>
                  <td className="px-4 py-2 uppercase">{c.country ?? 'all'}</td>
                  <td className={`px-4 py-2 font-medium ${STATUS_COLORS[c.status] ?? ''}`}>
                    {c.status}
                  </td>
                  <td className="px-4 py-2 text-slate-400">
                    {c.sentCount} / {c.recipientCount}
                  </td>
                  <td className="px-4 py-2">
                    {c.status === 'draft' ? (
                      <button
                        disabled={send.isPending}
                        onClick={() => send.mutate(c.id)}
                        className="rounded-md border border-blue-600 bg-blue-600/20 px-2 py-1 text-xs text-blue-200 hover:bg-blue-600/40 disabled:opacity-50"
                      >
                        Send
                      </button>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {(campaigns.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No campaigns.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
          New campaign
        </h2>
        <form
          onSubmit={onCreate}
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:grid-cols-2"
        >
          <input
            placeholder="Title"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            className={inputCls}
          />
          <input
            placeholder="Body"
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            className={inputCls}
          />
          <select
            value={draft.language}
            onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
            className={inputCls}
          >
            {LANGUAGES.map((l) => (
              <option key={l || 'all'} value={l}>
                {l ? l.toUpperCase() : 'All languages'}
              </option>
            ))}
          </select>
          <select
            value={draft.segment}
            onChange={(e) => setDraft((d) => ({ ...d, segment: e.target.value as BannerSegment }))}
            className={inputCls}
          >
            {BANNER_SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            placeholder="Country (e.g. TM) — blank = all"
            value={draft.country}
            onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value.toUpperCase() }))}
            className={inputCls}
            maxLength={8}
          />
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Create campaign
          </button>
        </form>
      </section>
    </>
  );
}

function BannersSection() {
  const qc = useQueryClient();
  const banners = useQuery({ queryKey: ['banners'], queryFn: adminApi.banners });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['banners'] });

  const create = useMutation({ mutationFn: adminApi.createBanner, onSuccess: invalidate });
  const toggle = useMutation({
    mutationFn: (v: { id: number; enabled: boolean }) => adminApi.toggleBanner(v.id, v.enabled),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: adminApi.deleteBanner, onSuccess: invalidate });

  const [draft, setDraft] = useState<BannerDraft>(EMPTY_BANNER);

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.title || !draft.body) return;
    create.mutate(
      {
        title: draft.title,
        body: draft.body,
        language: draft.language ? (draft.language as 'ru' | 'tr' | 'tk') : null,
        segment: draft.segment,
        priority: draft.priority,
      },
      { onSuccess: () => setDraft(EMPTY_BANNER) },
    );
  };

  return (
    <>
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
          In-app banners
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Body</th>
                <th className="px-4 py-3 font-medium">Lang</th>
                <th className="px-4 py-3 font-medium">Segment</th>
                <th className="px-4 py-3 font-medium">Prio</th>
                <th className="px-4 py-3 font-medium">Enabled</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950/40 text-slate-200">
              {(banners.data ?? []).map((b: AdminBanner) => (
                <tr key={b.id}>
                  <td className="px-4 py-2 font-medium">{b.title}</td>
                  <td className="px-4 py-2 text-slate-400">{b.body}</td>
                  <td className="px-4 py-2 uppercase">{b.language ?? 'all'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{b.segment}</td>
                  <td className="px-4 py-2">{b.priority}</td>
                  <td className="px-4 py-2">{b.enabled ? 'yes' : 'no'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        disabled={toggle.isPending}
                        onClick={() => toggle.mutate({ id: b.id, enabled: !b.enabled })}
                        className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:border-blue-500 disabled:opacity-50"
                      >
                        {b.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(b.id)}
                        className="rounded-md border border-slate-700 px-2 py-1 text-xs text-red-300 hover:border-red-500 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(banners.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No banners.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
          New banner
        </h2>
        <form
          onSubmit={onCreate}
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:grid-cols-2"
        >
          <input
            placeholder="Title"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            className={inputCls}
          />
          <input
            placeholder="Body"
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            className={inputCls}
          />
          <select
            value={draft.language}
            onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
            className={inputCls}
          >
            {LANGUAGES.map((l) => (
              <option key={l || 'all'} value={l}>
                {l ? l.toUpperCase() : 'All languages'}
              </option>
            ))}
          </select>
          <select
            value={draft.segment}
            onChange={(e) => setDraft((d) => ({ ...d, segment: e.target.value as BannerSegment }))}
            className={inputCls}
          >
            {BANNER_SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Priority"
            value={draft.priority}
            onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) }))}
            className={inputCls}
          />
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Create banner
          </button>
        </form>
      </section>
    </>
  );
}

export function NotificationsPage() {
  return (
    <div className="space-y-8">
      <PushCampaignsSection />
      <BannersSection />
    </div>
  );
}

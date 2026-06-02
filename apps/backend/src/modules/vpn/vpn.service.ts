import { randomBytes, randomUUID } from 'node:crypto';
import type {
  ServerQuality,
  VpnHeartbeatResponse,
  VpnRecommendation,
  VpnServerView,
  VpnSessionCurrent,
  VpnSessionStartResponse,
  VpnSessionStopResponse,
} from '@vpn/types';
import {
  DeviceBlockedError,
  InsufficientBalanceError,
  NotFoundError,
  UnauthorizedError,
} from '../../lib/errors.js';
import type { DeviceRepository } from '../device/device.repository.js';
import type { LedgerRepository } from '../ledger/ledger.repository.js';
import type { VpnServerRepository, VpnServerRow } from './vpn-server.repository.js';
import {
  DuplicateActiveSessionError,
  type VpnSessionRepository,
  type VpnSessionRow,
} from './vpn-session.repository.js';
import type { VpnLiveSession, VpnSessionStore } from './vpn-session-store.js';

/** Hard cap on a single session regardless of accrued balance. */
export const MAX_SESSION_MINUTES = 720;

const QUALITY_ORDER: Record<ServerQuality, number> = { green: 0, orange: 1, red: 2 };

function serverQuality(s: VpnServerRow): ServerQuality {
  if (s.status !== 'online' || s.pingMs > 180 || s.loadPercent > 85) return 'red';
  if (s.pingMs <= 80 && s.loadPercent <= 50) return 'green';
  return 'orange';
}

/** Lower is better (CLAUDE.md "Автовыбор сервера"). */
function serverScore(s: VpnServerRow): number {
  return (
    s.pingMs +
    s.loadPercent * 1.5 +
    s.recentFailures * 50 +
    s.priority * 0.5 +
    s.countryPriority * 0.3 +
    (s.status === 'online' ? 0 : 500)
  );
}

export interface VpnHeartbeatInput {
  sessionId: string;
  sessionToken: string;
  bytesIn?: number;
  bytesOut?: number;
}

export class VpnService {
  constructor(
    private readonly servers: VpnServerRepository,
    private readonly sessions: VpnSessionRepository,
    private readonly store: VpnSessionStore,
    private readonly devices: DeviceRepository,
    private readonly ledger: LedgerRepository,
  ) {}

  async listServers(): Promise<VpnServerView[]> {
    const servers = await this.servers.listEnabled();
    const best = this.pickBest(servers);
    return servers
      .map((s) => this.toView(s, best?.id ?? null))
      .sort((a, b) => QUALITY_ORDER[a.quality] - QUALITY_ORDER[b.quality] || a.pingMs - b.pingMs);
  }

  async recommend(): Promise<VpnRecommendation> {
    const servers = await this.servers.listEnabled();
    const best = this.pickBest(servers);
    return { server: best ? this.toView(best, best.id) : null };
  }

  async startSession(deviceId: string, serverId?: string): Promise<VpnSessionStartResponse> {
    const device = await this.devices.findById(deviceId);
    if (!device) throw new NotFoundError('Device not found');
    if (device.isBlocked) throw new DeviceBlockedError();

    // Reuse a still-valid active session (decided by the server-time deadline
    // ALONE, §7.6 — not by whether the original server row still exists); only
    // reconcile a session whose deadline has passed (app killed without stop).
    const existing = await this.sessions.findActiveByDevice(deviceId);
    if (existing) {
      if (existing.deadline.getTime() > Date.now()) {
        const server =
          (await this.servers.findById(existing.serverId)) ??
          this.pickBest(await this.servers.listEnabled());
        if (server) {
          return this.buildStartResponse(existing.id, existing.token, existing.deadline, server);
        }
      }
      await this.reconcileStale(existing);
    }

    const balance = await this.ledger.getBalance(deviceId);
    if (balance <= 0) throw new InsufficientBalanceError();

    const server = serverId
      ? await this.servers.findById(serverId)
      : this.pickBest(await this.servers.listEnabled());
    // Must be enabled AND online — never start (and bill) a session on a dead server.
    if (!server || !server.enabled || server.status !== 'online') {
      throw new NotFoundError('Server not available');
    }

    const allottedMinutes = Math.min(balance, MAX_SESSION_MINUTES);
    const startedAtMs = Date.now();
    const deadlineMs = startedAtMs + allottedMinutes * 60_000;
    const deadline = new Date(deadlineMs);
    const id = randomUUID();
    const token = randomBytes(24).toString('base64url');

    try {
      await this.sessions.create({
        id,
        deviceId,
        serverId: server.id,
        token,
        allottedMinutes,
        deadline,
      });
    } catch (err) {
      // Lost a concurrent start race — exactly one active session per device.
      if (err instanceof DuplicateActiveSessionError) {
        const winner = await this.sessions.findActiveByDevice(deviceId);
        if (winner) {
          const winnerServer = (await this.servers.findById(winner.serverId)) ?? server;
          return this.buildStartResponse(winner.id, winner.token, winner.deadline, winnerServer);
        }
      }
      throw err;
    }

    await this.store.put({
      sessionId: id,
      deviceId,
      serverId: server.id,
      token,
      startedAtMs,
      deadlineMs,
      allottedMinutes,
      bytesIn: 0,
      bytesOut: 0,
      lastHeartbeatMs: startedAtMs,
    });

    return this.buildStartResponse(id, token, deadline, server);
  }

  async heartbeat(input: VpnHeartbeatInput): Promise<VpnHeartbeatResponse> {
    const live = await this.store.get(input.sessionId);
    if (!live || live.token !== input.sessionToken) throw new UnauthorizedError('Invalid session');

    const now = Date.now();
    const shouldDisconnect = now >= live.deadlineMs;

    if (shouldDisconnect) {
      const merged: VpnLiveSession = {
        ...live,
        bytesIn: input.bytesIn ?? live.bytesIn,
        bytesOut: input.bytesOut ?? live.bytesOut,
        lastHeartbeatMs: now,
      };
      await this.finalize(merged, now, 'expired', 'time_expired');
    } else {
      await this.store.updateUsage(input.sessionId, {
        bytesIn: input.bytesIn,
        bytesOut: input.bytesOut,
        lastHeartbeatMs: now,
      });
    }

    return {
      remainingSeconds: Math.max(0, Math.floor((live.deadlineMs - now) / 1000)),
      shouldDisconnect,
      serverTime: new Date(now).toISOString(),
    };
  }

  async stopSession(input: VpnHeartbeatInput): Promise<VpnSessionStopResponse> {
    const live = await this.store.get(input.sessionId);
    if (live) {
      if (live.token !== input.sessionToken) throw new UnauthorizedError('Invalid session');
      const now = Date.now();
      const merged: VpnLiveSession = {
        ...live,
        bytesIn: input.bytesIn ?? live.bytesIn,
        bytesOut: input.bytesOut ?? live.bytesOut,
        lastHeartbeatMs: now,
      };
      return this.finalize(merged, now, 'ended', 'user_stopped');
    }

    // Live entry gone. A null live entry does NOT imply the session was
    // finalized (the Redis key can TTL/evict while the row is still active).
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.token !== input.sessionToken) {
      throw new UnauthorizedError('Invalid session');
    }
    if (session.status === 'active') {
      // Never finalized (e.g. connectivity lost before stop) — settle from the
      // durable row now so usage isn't silently dropped.
      return this.settleSessionFromRow(session, Date.now(), 'ended', 'stopped_after_eviction');
    }
    // Already finalized — idempotent: report the stored result.
    return {
      minutesDebited: session.minutesDebited,
      balanceMinutes: await this.ledger.getBalance(session.deviceId),
    };
  }

  async current(deviceId: string): Promise<VpnSessionCurrent | null> {
    const session = await this.sessions.findActiveByDevice(deviceId);
    if (!session) return null;
    const now = Date.now();
    return {
      sessionId: session.id,
      serverId: session.serverId,
      deadline: session.deadline.toISOString(),
      remainingSeconds: Math.max(0, Math.floor((session.deadline.getTime() - now) / 1000)),
      serverTime: new Date(now).toISOString(),
    };
  }

  // --- internals ---------------------------------------------------------

  private pickBest(servers: VpnServerRow[]): VpnServerRow | null {
    // Only consider online servers — never recommend/auto-pick a dead one.
    const online = servers.filter((s) => s.status === 'online');
    if (online.length === 0) return null;
    return online.reduce((best, s) => (serverScore(s) < serverScore(best) ? s : best));
  }

  private toView(s: VpnServerRow, recommendedId: string | null): VpnServerView {
    return {
      id: s.id,
      country: s.country,
      city: s.city,
      name: s.name,
      pingMs: s.pingMs,
      loadPercent: s.loadPercent,
      quality: serverQuality(s),
      recommended: s.id === recommendedId,
    };
  }

  private buildStartResponse(
    sessionId: string,
    token: string,
    deadline: Date,
    server: VpnServerRow,
  ): VpnSessionStartResponse {
    const now = Date.now();
    return {
      sessionId,
      sessionToken: token,
      serverId: server.id,
      deadline: deadline.toISOString(),
      serverTime: new Date(now).toISOString(),
      remainingSeconds: Math.max(0, Math.floor((deadline.getTime() - now) / 1000)),
      // Native module only — never surfaced in the UI (§7.2).
      config: server.configBlob ?? 'VLESS_PLACEHOLDER',
    };
  }

  private finalize(
    live: VpnLiveSession,
    nowMs: number,
    status: 'ended' | 'expired',
    reason: string,
  ): Promise<VpnSessionStopResponse> {
    return this.settle({
      sessionId: live.sessionId,
      deviceId: live.deviceId,
      serverId: live.serverId,
      startedAtMs: live.startedAtMs,
      allottedMinutes: live.allottedMinutes,
      bytesIn: live.bytesIn,
      bytesOut: live.bytesOut,
      nowMs,
      status,
      reason,
    });
  }

  private settleSessionFromRow(
    row: VpnSessionRow,
    nowMs: number,
    status: 'ended' | 'expired',
    reason: string,
  ): Promise<VpnSessionStopResponse> {
    return this.settle({
      sessionId: row.id,
      deviceId: row.deviceId,
      serverId: row.serverId,
      startedAtMs: row.startedAt.getTime(),
      allottedMinutes: row.allottedMinutes,
      bytesIn: row.bytesIn,
      bytesOut: row.bytesOut,
      nowMs,
      status,
      reason,
    });
  }

  /**
   * Single-winner settle: debit usage to the ledger (idempotent on the session's
   * reference), finalize the durable row only if still active, clear live state.
   * minutesDebited is clamped to allotment AND the current balance so the
   * balance can never go negative (§7.5).
   */
  private async settle(p: {
    sessionId: string;
    deviceId: string;
    serverId: string;
    startedAtMs: number;
    allottedMinutes: number;
    bytesIn: number;
    bytesOut: number;
    nowMs: number;
    status: 'ended' | 'expired';
    reason: string;
  }): Promise<VpnSessionStopResponse> {
    const elapsedMinutes = Math.ceil(Math.max(0, p.nowMs - p.startedAtMs) / 60_000);
    const balanceBefore = await this.ledger.getBalance(p.deviceId);
    const minutesDebited = Math.max(0, Math.min(elapsedMinutes, p.allottedMinutes, balanceBefore));

    if (minutesDebited > 0) {
      const { created } = await this.ledger.append({
        deviceId: p.deviceId,
        entryType: 'vpn_usage',
        minutes: -minutesDebited,
        referenceId: `vpn_usage:${p.sessionId}`,
        metadata: {
          serverId: p.serverId,
          bytesIn: p.bytesIn,
          bytesOut: p.bytesOut,
          reason: p.reason,
        },
      });
      if (!created) {
        // A prior finalize already debited this session — don't double-write the
        // audit row; report the amount that actually landed.
        const existing = await this.sessions.findById(p.sessionId);
        await this.store.delete(p.sessionId);
        return {
          minutesDebited: existing?.minutesDebited ?? minutesDebited,
          balanceMinutes: await this.ledger.getBalance(p.deviceId),
        };
      }
    }

    await this.sessions.finalize(p.sessionId, {
      status: p.status,
      minutesDebited,
      bytesIn: p.bytesIn,
      bytesOut: p.bytesOut,
      endedAt: new Date(p.nowMs),
      disconnectReason: p.reason,
    });
    await this.store.delete(p.sessionId);

    return { minutesDebited, balanceMinutes: await this.ledger.getBalance(p.deviceId) };
  }

  /**
   * Finalize a session abandoned without a stop. Uses live state if still in
   * Redis; otherwise settles from the durable row. Idempotent via the ledger
   * reference. (A background reaper does this proactively — Stage 9.)
   */
  private async reconcileStale(row: VpnSessionRow): Promise<void> {
    const live = await this.store.get(row.id);
    const now = Date.now();
    if (live) {
      await this.finalize(live, now, 'expired', 'abandoned');
    } else {
      await this.settleSessionFromRow(row, now, 'expired', 'abandoned');
    }
  }
}

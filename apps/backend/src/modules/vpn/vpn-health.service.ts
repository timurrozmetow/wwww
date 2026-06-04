import { portFromConfigBlob, tcpPing, type TcpPinger } from './tcp-ping.js';
import type { VpnServerRepository } from './vpn-server.repository.js';

export interface PingEntry {
  id: string;
  name: string;
  pingMs: number | null;
  status: string;
}

/**
 * Backend-side server health (CLAUDE.md §6 — the server measures latency, never
 * the phone). Shared by the periodic scheduler, the admin "Check ping" action,
 * and the throttled device recheck. (BullMQ is the §14 scale-up — a single
 * in-process sweep is plenty at 10k installs.)
 */
export class VpnHealthService {
  private lastRunAt = 0;
  private lastResults: PingEntry[] = [];

  constructor(
    private readonly servers: VpnServerRepository,
    private readonly pinger: TcpPinger = tcpPing,
  ) {}

  /** Measures every enabled server and persists pingMs/status/recentFailures. */
  async pingAll(): Promise<PingEntry[]> {
    const servers = await this.servers.listEnabled();
    const results = await Promise.all(
      servers.map(async (s): Promise<PingEntry> => {
        const pingMs = s.host ? await this.pinger(s.host, portFromConfigBlob(s.configBlob)) : null;
        const online = pingMs !== null;
        await this.servers.updateHealth(s.id, {
          pingMs: pingMs ?? s.pingMs,
          status: online ? 'online' : 'offline',
          recentFailures: online ? 0 : s.recentFailures + 1,
        });
        return { id: s.id, name: s.name, pingMs, status: online ? 'online' : 'offline' };
      }),
    );
    this.lastRunAt = Date.now();
    this.lastResults = results;
    return results;
  }

  /**
   * Re-measures only if the last sweep is older than minIntervalMs, otherwise
   * returns the cached result — so a burst of device "check ping" taps triggers
   * at most one sweep per window.
   */
  async pingAllThrottled(minIntervalMs = 15_000): Promise<PingEntry[]> {
    if (this.lastRunAt && Date.now() - this.lastRunAt < minIntervalMs) {
      return this.lastResults;
    }
    return this.pingAll();
  }
}

export interface SchedulerLogger {
  debug(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}

/**
 * Runs a health-check sweep every `intervalMs` (default 3 min). Returns a stop
 * function (wire to app `onClose`). Skips overlapping runs; never throws.
 */
export function startHealthScheduler(
  health: VpnHealthService,
  log: SchedulerLogger,
  intervalMs = 180_000,
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const results = await health.pingAll();
      log.debug({ checked: results.length }, 'vpn health-check sweep');
    } catch (err) {
      log.warn({ err }, 'vpn health-check sweep failed');
    } finally {
      running = false;
    }
  };

  const handle = setInterval(() => void tick(), intervalMs);
  handle.unref?.();
  void tick(); // prime once at startup
  return () => clearInterval(handle);
}

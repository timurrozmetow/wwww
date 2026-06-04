import { connect } from 'node:net';

/**
 * Measures TCP-connect latency to a host:port — the backend's health probe
 * (CLAUDE.md §6: the server measures ping, never the phone). Resolves to the
 * round-trip in ms, or null if the connection failed/timed out.
 */
export type TcpPinger = (host: string, port: number, timeoutMs?: number) => Promise<number | null>;

export const tcpPing: TcpPinger = (host, port, timeoutMs = 3000) =>
  new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    const socket = connect({ host, port });

    const finish = (ms: number | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ms);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(Date.now() - start));
    socket.once('timeout', () => finish(null));
    socket.once('error', () => finish(null));
  });

/** Pulls the upstream port out of a stored sing-box configBlob (defaults to 443). */
export function portFromConfigBlob(configBlob: string | null | undefined): number {
  if (!configBlob) return 443;
  try {
    const parsed = JSON.parse(configBlob) as { outbounds?: Array<{ server_port?: number }> };
    const port = parsed.outbounds?.[0]?.server_port;
    return typeof port === 'number' && port > 0 && port <= 65535 ? port : 443;
  } catch {
    return 443;
  }
}

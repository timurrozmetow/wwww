import type { ServerQuality } from '@vpn/types';
import { colors } from '../theme';

/** ISO-3166 alpha-2 country code → flag emoji (regional indicator letters). */
export function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2 || !/^[a-zA-Z]{2}$/.test(code)) return '🏳️';
  const base = 'A'.charCodeAt(0);
  const points = [...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - base);
  return String.fromCodePoint(...points);
}

/** Server health dot colour (CLAUDE.md §7.2 — green/orange/red, no raw metrics). */
export function qualityColor(quality: ServerQuality): string {
  if (quality === 'green') return colors.success;
  if (quality === 'orange') return colors.warning;
  return colors.danger;
}

/** Latency colour for the ping label: fast=green, ok=amber, slow/dead=red. */
export function pingColor(ms: number): string {
  if (ms <= 0) return colors.textFaint;
  if (ms <= 80) return colors.success;
  if (ms <= 180) return colors.warning;
  return colors.danger;
}

/** Signal-strength glyph from latency (▂▄▆ filled by quality). */
export function signalBars(ms: number): string {
  if (ms <= 0) return '▁▁▁';
  if (ms <= 80) return '▂▄▆';
  if (ms <= 180) return '▂▄▁';
  return '▂▁▁';
}

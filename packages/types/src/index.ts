/**
 * @vpn/types — the single source of truth for cross-app contracts
 * (API DTOs, enums, ledger/event types). Shared by mobile, backend and admin
 * so they never drift.
 */

/** API version segment used in routes and the health payload. */
export const API_VERSION = 'v1' as const;
export type ApiVersion = typeof API_VERSION;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Canonical API error codes (CLAUDE.md §8 — single source of truth). */
export const ErrorCode = {
  ValidationError: 'VALIDATION_ERROR',
  Unauthorized: 'UNAUTHORIZED',
  NotFound: 'NOT_FOUND',
  DeviceBlocked: 'DEVICE_BLOCKED',
  InsufficientBalance: 'INSUFFICIENT_BALANCE',
  RateLimited: 'RATE_LIMITED',
  Internal: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Unified API error envelope. */
export interface ApiError {
  error: {
    code: ErrorCode | string;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const PLATFORMS = ['android'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** UI / content languages (CLAUDE.md §2). */
export const LANGUAGES = ['ru', 'tr', 'tk'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Minute-ledger entry kinds. Balance = signed sum of these (CLAUDE.md §7.5). */
export const LEDGER_ENTRY_TYPES = [
  'reward_ad',
  'emergency_free_access',
  'vpn_usage',
  'admin_adjustment',
  'fraud_reversal',
  'expired_minutes',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/** Response of `GET /health`. */
export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  apiVersion: ApiVersion;
  uptimeSeconds: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Device (anonymous profile — no registration; CLAUDE.md §1, SPEC §"Anonymous")
// ---------------------------------------------------------------------------

/**
 * `POST /api/device/register` request.
 * Note: the FCM push token is captured via the dedicated `/api/device/push-token`
 * endpoint in the notifications stage, not here.
 */
export interface DeviceRegisterRequest {
  /** Returned by a previous register; lets re-registration stay idempotent. */
  deviceId?: string;
  installId: string;
  appVersion: string;
  platform: Platform;
  language: Language;
  country?: string;
  timezone?: string;
  /** Client-reported integrity heuristic: 'genuine' | 'emulator' | 'rooted' | 'debug' | 'unknown'. */
  deviceIntegrityStatus?: string;
  /** Optional Play Integrity token, verified server-side when enabled (anti-fraud, §9). */
  integrityToken?: string;
}

/** Public device view — never exposes fraud internals or raw config. */
export interface DeviceProfile {
  deviceId: string;
  language: Language;
  country: string | null;
  balanceMinutes: number;
  isBlocked: boolean;
  createdAt: string;
}

export type DeviceRegisterResponse = DeviceProfile;

/** `POST /api/device/heartbeat` request (device identified by `x-device-id`). */
export interface HeartbeatRequest {
  appVersion?: string;
}

export interface HeartbeatResponse {
  deviceId: string;
  balanceMinutes: number;
  /** Server time is the billing source of truth (CLAUDE.md §7.6). */
  serverTime: string;
}

// ---------------------------------------------------------------------------
// Rewards / balance
// ---------------------------------------------------------------------------

/** `GET /api/rewards/balance`. */
export interface BalanceResponse {
  deviceId: string;
  balanceMinutes: number;
  serverTime: string;
}

// ---------------------------------------------------------------------------
// App / remote config
// ---------------------------------------------------------------------------

/** `GET /api/app/config` — client-facing remote config (no secrets). */
export interface AppConfig {
  rewardMinutesPerAd: number;
  emergencyMinutes: number;
  maxBalanceDays: number;
  maintenanceMode: boolean;
  forceUpdate: boolean;
  minAppVersion: string;
  splitTunnelingEnabled: boolean;
  featureFlags: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Ads & rewards (Stage 2)
// ---------------------------------------------------------------------------

/** Where a reward credit originated (server-side verified only). */
export const REWARD_SOURCES = ['admob_ssv', 'applovin', 'levelplay'] as const;
export type RewardSource = (typeof REWARD_SOURCES)[number];

/** `POST /api/ads/session/start` — opens an ad-watch attempt. */
export interface AdSessionStartResponse {
  /** Pass this to the ad SDK as SSV custom data so the callback maps back. */
  sessionId: string;
}

/** `GET /api/ads/config` — which rewarded unit to load (full waterfall = Stage 5). */
export interface AdsConfig {
  provider: 'admob';
  rewardedUnitId: string;
  rewardMinutes: number;
}

/** One step of the rewarded-ad waterfall (`GET /api/ads/waterfall-config`). */
export interface AdProviderWaterfallItem {
  key: string;
  name: string;
  adUnitId: string;
  timeoutMs: number;
  priority: number;
}

/** Backend-driven waterfall order — change priorities without an app release. */
export interface AdWaterfallConfig {
  providers: AdProviderWaterfallItem[];
}

/** Operator view of an ad provider (includes economics). */
export interface AdminAdProvider {
  id: number;
  key: string;
  name: string;
  priority: number;
  ecpmEstimate: number;
  fillRate: number;
  adUnitId: string;
  timeoutMs: number;
  enabled: boolean;
}

export interface AdminAdProviderUpdate {
  priority?: number;
  ecpmEstimate?: number;
  fillRate?: number;
  adUnitId?: string;
  timeoutMs?: number;
  enabled?: boolean;
}

/** `POST /api/ads/no-fill-report` — all networks failed; may grant emergency access. */
export interface NoFillReportRequest {
  failedNetworksCount: number;
}

/** Why emergency access was granted/denied (client localizes). */
export type EmergencyReason =
  | 'granted'
  | 'duplicate'
  | 'disabled'
  | 'blocked'
  | 'fraud'
  | 'has_balance'
  | 'insufficient_failures'
  | 'cooldown'
  | 'daily_limit'
  | 'weekly_limit';

export interface EmergencyResult {
  granted: boolean;
  minutes: number;
  balanceMinutes: number;
  reason: EmergencyReason;
}

export interface EmergencyLogEntry {
  id: number;
  deviceId: string;
  granted: boolean;
  minutes: number;
  reason: string;
  failedNetworks: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// In-app banners (Stage 6) — admin-managed, targeted by language/segment/date
// ---------------------------------------------------------------------------

export const BANNER_SEGMENTS = ['all', 'zero_balance', 'has_balance'] as const;
export type BannerSegment = (typeof BANNER_SEGMENTS)[number];

/** Client-facing banner (`GET /api/notifications/in-app`) — no targeting fields. */
export interface BannerView {
  id: number;
  title: string;
  body: string;
  imageUrl: string | null;
  deeplink: string | null;
  priority: number;
}

export interface AdminBanner extends BannerView {
  language: string | null;
  segment: string;
  startsAt: string | null;
  endsAt: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface AdminBannerCreate {
  title: string;
  body: string;
  imageUrl?: string | null;
  deeplink?: string | null;
  /** null = all languages. */
  language?: Language | null;
  segment?: BannerSegment;
  /** ISO timestamps; null = open-ended. */
  startsAt?: string | null;
  endsAt?: string | null;
  priority?: number;
}

// ---------------------------------------------------------------------------
// Push notifications (Stage 6) — FCM, admin campaigns targeted by lang/segment/country
// ---------------------------------------------------------------------------

/** Device registers/refreshes its FCM token (device id via `x-device-id`). */
export interface PushTokenRegisterRequest {
  token: string;
}

export const PUSH_CAMPAIGN_STATUSES = ['draft', 'sending', 'sent', 'failed'] as const;
export type PushCampaignStatus = (typeof PUSH_CAMPAIGN_STATUSES)[number];

/** Admin view of a push campaign (no per-recipient data). */
export interface AdminPushCampaign {
  id: number;
  title: string;
  body: string;
  /** null = all languages. */
  language: string | null;
  segment: BannerSegment;
  /** null = all countries. */
  country: string | null;
  status: PushCampaignStatus;
  recipientCount: number;
  sentCount: number;
  createdAt: string;
  sentAt: string | null;
}

export interface AdminPushCampaignCreate {
  title: string;
  body: string;
  language?: Language | null;
  segment?: BannerSegment;
  country?: string | null;
}

// ---------------------------------------------------------------------------
// VPN (Stage 3) — the user NEVER sees raw config (CLAUDE.md §7.2)
// ---------------------------------------------------------------------------

export const SERVER_QUALITIES = ['green', 'orange', 'red'] as const;
export type ServerQuality = (typeof SERVER_QUALITIES)[number];

/** Public, safe server view — no host, no config, no provider. */
export interface VpnServerView {
  id: string;
  country: string;
  city: string | null;
  name: string;
  pingMs: number;
  loadPercent: number;
  quality: ServerQuality;
  recommended: boolean;
}

export interface VpnRecommendation {
  server: VpnServerView | null;
}

/** `POST /api/vpn/session/start` (device via `x-device-id`). */
export interface VpnSessionStartRequest {
  /** Omit for "auto" (recommended server). */
  serverId?: string;
}

export interface VpnSessionStartResponse {
  sessionId: string;
  /** Short-lived token authenticating heartbeat/stop (CLAUDE.md §7.8). */
  sessionToken: string;
  serverId: string;
  /** Server-authoritative absolute deadline; VPN disconnects at this time (§7.6). */
  deadline: string;
  serverTime: string;
  remainingSeconds: number;
  /** Connection config for the native VPN module ONLY — never shown in UI (§7.2). */
  config: string;
}

export interface VpnHeartbeatRequest {
  sessionId: string;
  sessionToken: string;
  bytesIn?: number;
  bytesOut?: number;
}

export interface VpnHeartbeatResponse {
  remainingSeconds: number;
  shouldDisconnect: boolean;
  serverTime: string;
}

export interface VpnSessionStopRequest {
  sessionId: string;
  sessionToken: string;
  bytesIn?: number;
  bytesOut?: number;
}

export interface VpnSessionStopResponse {
  minutesDebited: number;
  balanceMinutes: number;
}

export interface VpnSessionCurrent {
  sessionId: string;
  serverId: string;
  deadline: string;
  remainingSeconds: number;
  serverTime: string;
}

// ---------------------------------------------------------------------------
// Admin (Stage 4)
// ---------------------------------------------------------------------------

export const ADMIN_ROLES = ['admin', 'viewer'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface AdminLoginRequest {
  email: string;
  password: string;
}

export interface AdminProfile {
  id: number;
  email: string;
  role: AdminRole;
}

export interface AdminLoginResponse {
  token: string;
  admin: AdminProfile;
}

export interface DashboardStats {
  totalDevices: number;
  blockedDevices: number;
  rewardMinutesGranted: number;
  adSessions: number;
}

export interface DeviceListItem {
  deviceId: string;
  language: Language;
  country: string | null;
  appVersion: string;
  isBlocked: boolean;
  fraudScore: number;
  createdAt: string;
  lastSeenAt: string;
}

export interface LedgerEntryView {
  entryType: LedgerEntryType;
  minutes: number;
  referenceId: string | null;
  createdAt: string;
}

export interface DeviceDetail extends DeviceListItem {
  balanceMinutes: number;
  recentLedger: LedgerEntryView[];
}

export interface AuditLogEntry {
  id: number;
  adminId: number;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

/** Canonical fraud-signal kinds recorded in `fraud_events` (anti-fraud, §9). */
export const FRAUD_EVENT_TYPES = [
  'emulator_detected',
  'rooted_device',
  'debug_build',
  'integrity_unknown',
  'integrity_token_invalid',
  'reward_velocity',
] as const;
export type FraudEventType = (typeof FRAUD_EVENT_TYPES)[number];

/** Admin view of a fraud signal — no raw tokens, no traffic content (§9). */
export interface FraudEventView {
  id: number;
  deviceId: string;
  eventType: string;
  severity: number;
  source: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Economy (Stage 7) — break-even calculator + ledger-derived overview
// ---------------------------------------------------------------------------

/** Ledger-derived snapshot (`GET /api/admin/economy/overview`). */
export interface EconomyOverview {
  totalDevices: number;
  rewardMinutesGranted: number;
  emergencyMinutesGranted: number;
  vpnMinutesUsed: number;
  adSessions: number;
}

/** `POST /api/admin/economy/calculate` inputs (SPEC §"Admin financial analytics"). */
export interface EconomyInputs {
  activeUsers: number;
  avgVpnHoursPerUserPerDay: number;
  rewardMinutesPerAd: number;
  /** Revenue per 1000 impressions, USD. */
  eCPM: number;
  /** 0..1. */
  fillRate: number;
  avgGbPerHour: number;
  /** USD per TB of egress. */
  trafficCostPerTb: number;
}

/** Monthly projection (except `adsPerDay`). */
export interface EconomyResult {
  adsPerDay: number;
  adsPerMonth: number;
  expectedRevenue: number;
  expectedTrafficTb: number;
  estimatedTrafficCost: number;
  profitLoss: number;
  /** eCPM at which monthly revenue == traffic cost. */
  breakEvenEcpm: number;
}

// ---------------------------------------------------------------------------
// Admin VPN management (Stage 4) — operator-only views (may include host/status)
// ---------------------------------------------------------------------------

export interface AdminVpnProvider {
  id: string;
  name: string;
  type: string;
  priority: number;
  enabled: boolean;
  serverCount: number;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface AdminVpnProviderCreate {
  name: string;
  type?: string;
  priority?: number;
}

export interface AdminVpnServer {
  id: string;
  providerId: string;
  country: string;
  city: string | null;
  name: string;
  host: string | null;
  status: string;
  pingMs: number;
  loadPercent: number;
  priority: number;
  countryPriority: number;
  enabled: boolean;
  createdAt: string;
}

export interface AdminVpnServerCreate {
  providerId: string;
  country: string;
  name: string;
  city?: string;
  host?: string;
  configBlob?: string;
  pingMs?: number;
  loadPercent?: number;
  status?: string;
  priority?: number;
  countryPriority?: number;
}

export type VpnImportSourceKind = 'happ' | 'subscription-url' | 'inline';

/**
 * Imports servers from a pasted source: a `happ://crypt{N}` link, a subscription
 * URL, or an inline proxy URI / list. The backend decodes/fetches/parses it and
 * creates one server per proxy with a generated sing-box configBlob (§7.2 — the
 * raw config is never returned to clients).
 */
export interface AdminVpnImportRequest {
  providerId: string;
  source: string;
  /** Fallback ISO country for servers whose name has no detectable country. */
  country?: string;
  /** Max servers to import (default 50). */
  limit?: number;
  /** sing-box tun stack override (default gvisor). */
  stack?: 'system' | 'gvisor' | 'mixed';
}

export interface AdminVpnImportResult {
  sourceKind: VpnImportSourceKind;
  imported: AdminVpnServer[];
  total: number;
}

export interface AdminVpnPingEntry {
  id: string;
  name: string;
  /** Round-trip ms, or null if the server didn't answer. */
  pingMs: number | null;
  status: string;
}

export interface AdminVpnPingResult {
  checked: number;
  results: AdminVpnPingEntry[];
}

// ---------------------------------------------------------------------------
// Admin remote config (Stage 4/8) — drives GET /api/app/config
// ---------------------------------------------------------------------------

export const REMOTE_CONFIG_VALUE_TYPES = ['string', 'number', 'boolean', 'json'] as const;
export type RemoteConfigValueType = (typeof REMOTE_CONFIG_VALUE_TYPES)[number];

export interface RemoteConfigItem {
  key: string;
  value: string;
  valueType: string;
}

export interface RemoteConfigSetRequest {
  key: string;
  value: string;
  valueType?: RemoteConfigValueType;
}

import type {
  AdminPushCampaign,
  AdminPushCampaignCreate,
  BannerSegment,
  PushCampaignStatus,
} from '@vpn/types';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import type { DeviceRepository } from '../device/device.repository.js';
import type { LedgerRepository } from '../ledger/ledger.repository.js';
import type { AuditLogRepository } from '../admin/admin.repository.js';
import type { PushCampaignRepository, PushCampaignRow } from './push-campaign.repository.js';
import type { PushTokenRepository } from './push-token.repository.js';
import type { PushMessage, PushSender } from './push-sender.js';

function toAdmin(c: PushCampaignRow): AdminPushCampaign {
  return {
    id: c.id,
    title: c.title,
    body: c.body,
    language: c.language,
    segment: c.segment as BannerSegment,
    country: c.country,
    status: c.status as PushCampaignStatus,
    recipientCount: c.recipientCount,
    sentCount: c.sentCount,
    createdAt: c.createdAt.toISOString(),
    sentAt: c.sentAt ? c.sentAt.toISOString() : null,
  };
}

function segmentMatches(segment: string, balanceMinutes: number): boolean {
  if (segment === 'zero_balance') return balanceMinutes <= 0;
  if (segment === 'has_balance') return balanceMinutes > 0;
  return true; // 'all' / unknown → everyone
}

export interface CampaignSendSummary {
  recipientCount: number;
  sentCount: number;
  failedCount: number;
}

export class PushService {
  constructor(
    private readonly tokens: PushTokenRepository,
    private readonly campaigns: PushCampaignRepository,
    private readonly devices: DeviceRepository,
    private readonly ledger: LedgerRepository,
    private readonly audit: AuditLogRepository,
    private readonly sender: PushSender,
  ) {}

  /** Device registers/refreshes its FCM token (idempotent on the token). */
  async registerToken(deviceId: string, token: string): Promise<void> {
    const device = await this.devices.findById(deviceId);
    if (!device) throw new NotFoundError('Device not found');
    await this.tokens.upsert(deviceId, token, device.platform);
  }

  // --- admin ------------------------------------------------------------

  async list(): Promise<AdminPushCampaign[]> {
    return (await this.campaigns.listAll()).map(toAdmin);
  }

  async createCampaign(
    adminId: number,
    input: AdminPushCampaignCreate,
  ): Promise<AdminPushCampaign> {
    const campaign = await this.campaigns.create({
      title: input.title,
      body: input.body,
      language: input.language ?? null,
      segment: input.segment ?? 'all',
      country: input.country ?? null,
    });
    await this.audit.record({
      adminId,
      action: 'push.campaign.create',
      targetType: 'push_campaign',
      targetId: String(campaign.id),
    });
    return toAdmin(campaign);
  }

  /**
   * Marks a draft campaign as sending and audits it. The actual delivery is run
   * out-of-band by the dispatcher → `sendCampaign` (CLAUDE.md §6). Only a draft
   * can be started — guards against double-send.
   */
  async startCampaign(adminId: number, id: number): Promise<AdminPushCampaign> {
    const campaign = await this.campaigns.findById(id);
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (campaign.status !== 'draft') {
      throw new ValidationError(`Campaign is already ${campaign.status}`);
    }
    await this.campaigns.setStatus(id, 'sending');
    await this.audit.record({
      adminId,
      action: 'push.campaign.send',
      targetType: 'push_campaign',
      targetId: String(id),
    });
    const updated = await this.campaigns.findById(id);
    return toAdmin(updated ?? { ...campaign, status: 'sending' });
  }

  /**
   * Resolves recipients (enabled tokens whose device matches the campaign's
   * language / country / balance segment), delivers via the sender, disables
   * tokens FCM rejected, and records the result. Runs in a worker, not a handler.
   */
  async sendCampaign(id: number): Promise<CampaignSendSummary> {
    const campaign = await this.campaigns.findById(id);
    if (!campaign) throw new NotFoundError('Campaign not found');

    const enabledTokens = await this.tokens.listEnabled();
    const messages: PushMessage[] = [];
    for (const t of enabledTokens) {
      const device = await this.devices.findById(t.deviceId);
      if (!device || device.isBlocked) continue;
      if (campaign.language !== null && device.language !== campaign.language) continue;
      if (campaign.country !== null && device.country !== campaign.country) continue;
      if (campaign.segment !== 'all') {
        const balance = await this.ledger.getBalance(t.deviceId);
        if (!segmentMatches(campaign.segment, balance)) continue;
      }
      messages.push({ token: t.token, title: campaign.title, body: campaign.body });
    }

    let summary: CampaignSendSummary;
    let status: PushCampaignStatus;
    try {
      const result = await this.sender.send(messages);
      for (const token of result.invalidTokens) await this.tokens.disableToken(token);
      summary = {
        recipientCount: messages.length,
        sentCount: result.sent,
        failedCount: result.failed,
      };
      status = 'sent';
    } catch {
      // Delivery transport failed wholesale — mark failed so the admin can retry,
      // and record how many were targeted.
      summary = { recipientCount: messages.length, sentCount: 0, failedCount: messages.length };
      status = 'failed';
    }

    await this.campaigns.recordResult(id, {
      status,
      recipientCount: summary.recipientCount,
      sentCount: summary.sentCount,
      sentAt: new Date(),
    });
    return summary;
  }
}

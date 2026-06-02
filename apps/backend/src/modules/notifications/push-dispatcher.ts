/**
 * Decouples the "send campaign" trigger from the actual delivery loop so the
 * HTTP handler returns immediately (CLAUDE.md §6 — broadcasts go through workers,
 * not request handlers). Production swaps this for a BullMQ-backed dispatcher;
 * the run logic is identical, only the transport changes.
 */
export interface PushDispatcher {
  enqueue(campaignId: number): Promise<void>;
}

export type CampaignRunner = (campaignId: number) => Promise<unknown>;

export interface DispatcherLogger {
  error(obj: unknown, msg?: string): void;
}

/** Fire-and-forget runner: schedules the send on the next tick, never blocks the
 * caller, and routes any failure to the logger (the campaign is marked failed by
 * the runner itself). */
export class InlinePushDispatcher implements PushDispatcher {
  constructor(
    private readonly run: CampaignRunner,
    private readonly logger?: DispatcherLogger,
  ) {}

  async enqueue(campaignId: number): Promise<void> {
    void Promise.resolve()
      .then(() => this.run(campaignId))
      .catch((err) => this.logger?.error({ err, campaignId }, 'push campaign send failed'));
  }
}

import { randomUUID } from 'node:crypto';
import type {
  DeviceRegisterRequest,
  DeviceRegisterResponse,
  HeartbeatResponse,
  Language,
} from '@vpn/types';
import type { LedgerRepository } from '../ledger/ledger.repository.js';
import { DeviceBlockedError, NotFoundError } from '../../lib/errors.js';
import {
  DuplicateInstallIdError,
  type DeviceRepository,
  type DeviceRow,
} from './device.repository.js';

/** Anti-fraud hook invoked on register (§9). Optional so the device flow has no
 * hard dependency on the fraud module. Idempotent/deduped on the fraud side. */
export interface RegistrationAssessor {
  assessRegistration(
    deviceId: string,
    reportedStatus?: string | null,
    integrityToken?: string | null,
  ): Promise<void>;
}

/** Minimal logger surface so a swallowed scoring error is still observable (L1). */
export interface DeviceLogger {
  error(obj: unknown, msg?: string): void;
}

export class DeviceService {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly ledger: LedgerRepository,
    private readonly fraud?: RegistrationAssessor,
    private readonly logger?: DeviceLogger,
  ) {}

  /**
   * Idempotent registration of an anonymous device profile.
   *  - a known `deviceId` (from a prior register) is reused;
   *  - otherwise an existing `installId` is reused (reinstall / double-register race);
   *  - otherwise a fresh device_id is minted.
   * Always returns the current ledger balance, never trusting the client.
   */
  async register(input: DeviceRegisterRequest): Promise<DeviceRegisterResponse> {
    let device = input.deviceId ? await this.devices.findById(input.deviceId) : null;
    if (!device) device = await this.devices.findByInstallId(input.installId);

    if (!device) {
      device = await this.createOrReuse(input);
    }

    // Score integrity signals on every register (no-op + zero DB work for a
    // genuine device; deduped on the fraud side so re-registers don't inflate,
    // while still catching a device that turns rooted later — review M5).
    // Best-effort: a fraud-module hiccup must not break registration, but it must
    // not be invisible either (review L1).
    if (this.fraud) {
      try {
        await this.fraud.assessRegistration(
          device.id,
          input.deviceIntegrityStatus ?? null,
          input.integrityToken ?? null,
        );
      } catch (err) {
        this.logger?.error({ err, deviceId: device.id }, 'fraud registration scoring failed');
      }
    }

    // Enforce the block uniformly with heartbeat/getBalance (anti-fraud, §9).
    // Do this before touch() so a blocked device can't keep itself "fresh".
    if (device.isBlocked) throw new DeviceBlockedError();

    await this.devices.touch(device.id, {
      appVersion: input.appVersion,
      lastSeenAt: new Date(),
    });
    const balanceMinutes = await this.ledger.getBalance(device.id);
    return this.toProfile(device, balanceMinutes);
  }

  /** Create a fresh device, tolerating a concurrent same-installId create race. */
  private async createOrReuse(input: DeviceRegisterRequest): Promise<DeviceRow> {
    try {
      return await this.devices.create({
        id: randomUUID(),
        installId: input.installId,
        appVersion: input.appVersion,
        platform: input.platform,
        language: input.language,
        country: input.country ?? null,
        timezone: input.timezone ?? null,
        deviceIntegrityStatus: input.deviceIntegrityStatus ?? null,
      });
    } catch (err) {
      if (err instanceof DuplicateInstallIdError) {
        const winner = await this.devices.findByInstallId(input.installId);
        if (winner) return winner;
      }
      throw err;
    }
  }

  async heartbeat(deviceId: string, appVersion?: string): Promise<HeartbeatResponse> {
    const device = await this.requireDevice(deviceId);
    await this.devices.touch(device.id, { appVersion, lastSeenAt: new Date() });
    const balanceMinutes = await this.ledger.getBalance(device.id);
    return { deviceId: device.id, balanceMinutes, serverTime: new Date().toISOString() };
  }

  async getBalance(deviceId: string): Promise<{ deviceId: string; balanceMinutes: number }> {
    const device = await this.requireDevice(deviceId);
    const balanceMinutes = await this.ledger.getBalance(device.id);
    return { deviceId: device.id, balanceMinutes };
  }

  private async requireDevice(deviceId: string): Promise<DeviceRow> {
    const device = await this.devices.findById(deviceId);
    if (!device) throw new NotFoundError('Device not found');
    if (device.isBlocked) throw new DeviceBlockedError();
    return device;
  }

  private toProfile(device: DeviceRow, balanceMinutes: number): DeviceRegisterResponse {
    return {
      deviceId: device.id,
      language: device.language as Language,
      country: device.country,
      balanceMinutes,
      isBlocked: device.isBlocked,
      createdAt: device.createdAt.toISOString(),
    };
  }
}

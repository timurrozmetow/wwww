import { desc, eq } from 'drizzle-orm';
import type { AdminRole, AuditLogEntry } from '@vpn/types';
import { getDb } from '../../db/client.js';
import { adminAuditLogs, admins, type AdminRow } from '../../db/schema/index.js';

export type { AdminRow };

export interface NewAdminInput {
  email: string;
  passwordHash: string;
  role: AdminRole;
}

export interface AdminRepository {
  findByEmail(email: string): Promise<AdminRow | null>;
  findById(id: number): Promise<AdminRow | null>;
  create(input: NewAdminInput): Promise<AdminRow>;
  updateLastLogin(id: number): Promise<void>;
}

export interface AuditLogInput {
  adminId: number;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: unknown;
}

export interface AuditLogRepository {
  record(input: AuditLogInput): Promise<void>;
  list(limit: number): Promise<AuditLogEntry[]>;
}

export class DrizzleAdminRepository implements AdminRepository {
  async findByEmail(email: string): Promise<AdminRow | null> {
    const rows = await getDb().select().from(admins).where(eq(admins.email, email)).limit(1);
    return rows[0] ?? null;
  }

  async findById(id: number): Promise<AdminRow | null> {
    const rows = await getDb().select().from(admins).where(eq(admins.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async create(input: NewAdminInput): Promise<AdminRow> {
    await getDb()
      .insert(admins)
      .values({ email: input.email, passwordHash: input.passwordHash, role: input.role });
    const created = await this.findByEmail(input.email);
    if (!created) throw new Error('admin insert did not persist');
    return created;
  }

  async updateLastLogin(id: number): Promise<void> {
    await getDb().update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, id));
  }
}

export class DrizzleAuditLogRepository implements AuditLogRepository {
  async record(input: AuditLogInput): Promise<void> {
    await getDb()
      .insert(adminAuditLogs)
      .values({
        adminId: input.adminId,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata ?? null,
      });
  }

  async list(limit: number): Promise<AuditLogEntry[]> {
    const rows = await getDb()
      .select()
      .from(adminAuditLogs)
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      adminId: r.adminId,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

export class InMemoryAdminRepository implements AdminRepository {
  private readonly byId = new Map<number, AdminRow>();
  private seq = 0;

  async findByEmail(email: string): Promise<AdminRow | null> {
    for (const row of this.byId.values()) {
      if (row.email === email) return row;
    }
    return null;
  }

  async findById(id: number): Promise<AdminRow | null> {
    return this.byId.get(id) ?? null;
  }

  async create(input: NewAdminInput): Promise<AdminRow> {
    const row: AdminRow = {
      id: ++this.seq,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      createdAt: new Date(),
      lastLoginAt: null,
    };
    this.byId.set(row.id, row);
    return row;
  }

  async updateLastLogin(id: number): Promise<void> {
    const row = this.byId.get(id);
    if (row) row.lastLoginAt = new Date();
  }
}

export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly rows: AuditLogEntry[] = [];
  private seq = 0;

  async record(input: AuditLogInput): Promise<void> {
    this.rows.unshift({
      id: ++this.seq,
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      createdAt: new Date().toISOString(),
    });
  }

  async list(limit: number): Promise<AuditLogEntry[]> {
    return this.rows.slice(0, limit);
  }
}

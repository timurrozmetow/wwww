import type { AdminProfile, AdminRole } from '@vpn/types';
import { UnauthorizedError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import type { AdminRepository, AdminRow } from './admin.repository.js';

export class AdminAuthService {
  constructor(private readonly admins: AdminRepository) {}

  /** Verifies credentials (constant-time) and stamps last login. */
  async verifyCredentials(email: string, password: string): Promise<AdminRow> {
    const admin = await this.admins.findByEmail(email);
    // Always run the hash check shape to reduce user-enumeration timing signal.
    const ok = admin !== null && verifyPassword(password, admin.passwordHash);
    if (!admin || !ok) throw new UnauthorizedError('Invalid email or password');
    await this.admins.updateLastLogin(admin.id);
    return admin;
  }

  async createAdmin(email: string, password: string, role: AdminRole = 'admin'): Promise<AdminRow> {
    const existing = await this.admins.findByEmail(email);
    if (existing) throw new Error(`admin already exists: ${email}`);
    return this.admins.create({ email, passwordHash: hashPassword(password), role });
  }

  toProfile(admin: AdminRow): AdminProfile {
    return { id: admin.id, email: admin.email, role: admin.role as AdminRole };
  }
}

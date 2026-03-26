/**
 * auth.service.ts — Business logic for auth
 *
 * Orchestrates: validation → repository → bcrypt → JWT
 * Never touches Express (req/res). Returns plain data or throws AppError.
 * Architecture: Service Layer Pattern
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthRepository } from './auth.repository';
import { createError } from '../../middleware/errorHandler';

// ── Constants ─────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

// Alphanumeric + hyphen; matches DB CHECK constraint
const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegisterResult {
  id: string;
  username: string;
}

export interface LoginResult {
  token: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const AuthService = {
  /**
   * Register a new user.
   * - Validates username format
   * - Checks uniqueness (catches PG unique-violation)
   * - Hashes password with bcrypt
   * - Persists user
   */
  async register(username: string, password: string): Promise<RegisterResult> {
    // ── Input validation ──────────────────────────────────────────────────────
    if (!username || typeof username !== 'string') {
      throw createError(400, 'username is required');
    }
    if (!USERNAME_RE.test(username)) {
      throw createError(
        400,
        'username must contain only alphanumeric characters and hyphens, and cannot start or end with a hyphen'
      );
    }
    if (username.length > 39) {
      throw createError(400, 'username must be 39 characters or fewer');
    }
    if (!password || typeof password !== 'string') {
      throw createError(400, 'password is required');
    }
    if (password.length < 8) {
      throw createError(400, 'password must be at least 8 characters');
    }

    // ── Uniqueness pre-check (friendly error) ─────────────────────────────────
    const existing = await AuthRepository.findByUsername(username);
    if (existing) {
      throw createError(409, `Username "${username}" is already taken`);
    }

    // ── Hash + persist ────────────────────────────────────────────────────────
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    let user: Awaited<ReturnType<typeof AuthRepository.create>>;
    try {
      user = await AuthRepository.create({ username, password_hash });
    } catch (err: unknown) {
      // Postgres unique violation code = 23505 (race condition safety net)
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        throw createError(409, `Username "${username}" is already taken`);
      }
      throw err;
    }

    return { id: user.id, username: user.username };
  },

  /**
   * Login: validate credentials and return a signed JWT.
   */
  async login(username: string, password: string): Promise<LoginResult> {
    if (!username || !password) {
      throw createError(400, 'username and password are required');
    }

    const user = await AuthRepository.findByUsername(username);
    if (!user) {
      // Do not reveal whether the username exists
      throw createError(401, 'Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw createError(401, 'Invalid credentials');
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw createError(500, 'Server misconfiguration: JWT_SECRET not set');
    }

    const token = jwt.sign(
      { sub: user.id, username: user.username },
      secret,
      { expiresIn: JWT_EXPIRY }
    );

    return { token };
  },
};

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
import { otpService } from './otp.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

// Alphanumeric + hyphen; matches DB CHECK constraint
const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

// ── JWT helper ───────────────────────────────────────────────────────────────

function signJwt(userId: string, username: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw createError(500, 'Server misconfiguration: JWT_SECRET not set');
  }
  // Explicitly specify algorithm to match verification side (S5659)
  return jwt.sign({ sub: userId, username }, secret, { expiresIn: JWT_EXPIRY, algorithm: 'HS256' });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegisterResult {
  id: string;
  username: string;
  token: string;
}

export interface LoginResult {
  token: string;
}

export interface MeResult {
  id: string;
  username: string;
  email: string | null;
}

export interface UpdateProfileInput {
  email?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateRegisterInput(username: string, password: string, email: string, otp: string): void {
  const normalizedUsername = username.toLowerCase();
  if (!normalizedUsername) {
    throw createError(400, 'username is required');
  }
  if (!USERNAME_RE.test(normalizedUsername)) {
    throw createError(
      400,
      'username must contain only alphanumeric characters and hyphens, and cannot start or end with a hyphen'
    );
  }
  if (normalizedUsername.length > 39) {
    throw createError(400, 'username must be 39 characters or fewer');
  }
  if (!password || typeof password !== 'string') {
    throw createError(400, 'password is required');
  }
  if (password.length < 8) {
    throw createError(400, 'password must be at least 8 characters');
  }
  if (!email || typeof email !== 'string') {
    throw createError(400, 'email is required');
  }
  if (!EMAIL_RE.test(email.trim())) {
    throw createError(400, 'email must be a valid email address');
  }
  if (email.length > 254) {
    throw createError(400, 'email must be 254 characters or fewer');
  }
  if (!otp || typeof otp !== 'string' || otp.length !== 6) {
    throw createError(400, 'A valid 6-digit OTP is required');
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export const AuthService = {
  async requestOtp(email: string): Promise<void> {
    if (!email || typeof email !== 'string') {
      throw createError(400, 'email is required');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      throw createError(400, 'email must be a valid email address');
    }
    
    // In production Railway/Vercel, we need to ensure this doesn't block the HTTP response
    // if the SMTP server is slow, but we still want to catch immediate configuration errors.
    await otpService.sendOtp(normalizedEmail);
  },

  /**
   * Register a new user.
   * - Validates username + email format
   * - Checks uniqueness (catches PG unique-violation)
   * - Hashes password with bcrypt
   * - Persists user
   */
async register(username: string, password: string, email: string, otp: string): Promise<RegisterResult> {
    // ── Input validation ──────────────────────────────────────────────────────
    validateRegisterInput(username, password, email, otp);
    const normalizedUsername = username.toLowerCase();

    // ── Validate OTP ──────────────────────────────────────────────────────────
    if (!otpService.verifyOtp(email.trim().toLowerCase(), otp)) {
      throw createError(400, 'Invalid or expired OTP');
    }

    // ── Uniqueness pre-check (friendly error) ─────────────────────────────────
    const existing = await AuthRepository.findByUsername(normalizedUsername);
    if (existing) {
      throw createError(409, `Username "${normalizedUsername}" is already taken`);
    }

    // ── Hash + persist ────────────────────────────────────────────────────────
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    let user: Awaited<ReturnType<typeof AuthRepository.create>>;
    try {
      user = await AuthRepository.create({
        username: normalizedUsername,
        password_hash,
        email: email.trim().toLowerCase(),
      });
    } catch (err: unknown) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === '23505') {
        if (pgErr.constraint?.includes('email')) {
          throw createError(409, 'An account with that email already exists');
        }
        throw createError(409, `Username "${normalizedUsername}" is already taken`);
      }
      throw err;
    }

    // Auto-login: issue JWT immediately (user already proved identity via OTP)
    const token = signJwt(user.id, user.username);

    return { id: user.id, username: user.username, token };
  },

  /**
   * Login: validate credentials and return a signed JWT.
   */
  async login(username: string, password: string): Promise<LoginResult> {
    if (!username || !password) {
      throw createError(400, 'username and password are required');
    }

    const user = await AuthRepository.findByUsername(username);

    // Always run bcrypt.compare even when user not found to prevent timing oracle (S6432)
    const DUMMY_HASH = '$2b$12$invalidhashpaddingthatisexactly53charslong........';
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || !valid) {
      throw createError(401, 'Invalid credentials');
    }

    return { token: signJwt(user.id, user.username) };
  },

  async me(userId: string): Promise<MeResult> {
    const user = await AuthRepository.findById(userId);
    if (!user) {
      throw createError(404, 'User not found');
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
    };
  },

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<MeResult> {
    const current = await this.me(userId);

    let email: string | null = current.email;
    if (input.email !== undefined) {
      const trimmed = (input.email ?? '').trim().toLowerCase();
      if (trimmed) {
        if (!EMAIL_RE.test(trimmed)) {
          throw createError(400, 'email must be a valid email address');
        }
        email = trimmed;
      } else {
        email = null;
      }
    }

    const updated = await AuthRepository.updateProfile(userId, {
      email,
    });

    if (!updated) {
      throw createError(404, 'User not found');
    }

    return {
      id: updated.id,
      username: updated.username,
      email: updated.email,
    };
  },

};

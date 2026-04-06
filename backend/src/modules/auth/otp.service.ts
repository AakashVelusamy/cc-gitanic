/**
 * otp.service.ts — Email OTP verification for registration
 *
 * Security measures:
 *   - Cryptographically secure OTP generation (crypto.randomInt)
 *   - Timing-safe comparison (crypto.timingSafeEqual)
 *   - Per-email rate limiting (60s cooldown between sends)
 *   - Max verification attempts (5) before lockout
 *   - Auto-expiry cleanup (60s sweep interval)
 *
 * Architecture: Singleton (in-memory Map store)
 */

import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { createError } from '../../middleware/errorHandler';
import { logger } from '../../lib/logger';

// ── Types ────────────────────────────────────────────────────────────────────

interface OtpEntry {
  hash: string;       // SHA-256 of the OTP (never store plaintext)
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const OTP_VALIDITY_MS   = 5 * 60 * 1000;   // 5 minutes
const COOLDOWN_MS       = 60 * 1000;        // 60s between sends to same email
const MAX_ATTEMPTS      = 5;                // lock out after 5 wrong guesses
const CLEANUP_INTERVAL  = 60 * 1000;        // sweep expired entries every 60s

// ── Singleton transporter ────────────────────────────────────────────────────

function createTransporter(): nodemailer.Transporter | null {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    logger.warn('[otp] SMTP_USER or SMTP_PASS not set — OTP emails will fail');
    return null;
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // upgrade later with STARTTLS
    requireTLS: true,
    auth: { user, pass },
    tls: {
      // Do not fail on Railway outbound unauth cert
      rejectUnauthorized: false,
    },
  });
}

// ── OTP Service ──────────────────────────────────────────────────────────────

class OtpService {
  private readonly store = new Map<string, OtpEntry>();
  private readonly transporter: nodemailer.Transporter | null;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.transporter = createTransporter();

    // Periodic cleanup of expired entries
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [email, entry] of this.store) {
        if (now > entry.expiresAt) this.store.delete(email);
      }
    }, CLEANUP_INTERVAL);

    // Allow process to exit cleanly without waiting for this timer
    this.cleanupTimer.unref();
  }

  /**
   * Generate a cryptographically secure 6-digit OTP.
   * Range: 100000–999999 (always 6 digits, no leading zeros).
   */
  private generateOtp(): string {
    return crypto.randomInt(100_000, 1_000_000).toString();
  }

  /** SHA-256 hash of OTP — we never store the plaintext. */
  private hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  /**
   * Send an OTP to the given email address.
   * Enforces a per-email cooldown to prevent spam.
   */
  async sendOtp(email: string): Promise<void> {
    if (!this.transporter) {
      throw createError(500, 'Email service is not configured (SMTP_USER/SMTP_PASS missing)');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();

    // Rate limit: one OTP per email per cooldown period
    const existing = this.store.get(normalizedEmail);
    if (existing && (now - existing.lastSentAt) < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
      throw createError(429, `Please wait ${waitSec}s before requesting another OTP`);
    }

    const otp = this.generateOtp();

    // Optimistically store it before sending to prevent rapid-fire clicks
    this.store.set(normalizedEmail, {
      hash: this.hashOtp(otp),
      expiresAt: now + OTP_VALIDITY_MS,
      attempts: 0,
      lastSentAt: now,
    });

    try {
      await this.transporter.sendMail({
        from: `"Gitanic" <${process.env.SMTP_USER}>`,
        to: normalizedEmail,
        subject: 'Your Gitanic Verification Code',
        text: `Your verification code is: ${otp}\n\nThis code expires in 5 minutes. If you didn't request this, ignore this email.`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:2rem">
            <h2 style="color:#00f0ff;margin-bottom:0.5rem">Gitanic</h2>
            <p>Your verification code is:</p>
            <div style="font-size:2rem;font-weight:bold;letter-spacing:0.3em;padding:1rem;background:#0a0e1a;color:#00f0ff;border-radius:0.5rem;text-align:center;margin:1rem 0">${otp}</div>
            <p style="color:#888;font-size:0.85rem">This code expires in 5 minutes. If you didn't request this, ignore this email.</p>
          </div>`,
      });

      logger.info(`[otp] Sent verification code to ${normalizedEmail}`);
    } catch (err) {
      // Remove the stored entry so user can retry immediately
      this.store.delete(normalizedEmail);
      logger.error(`[otp] Failed to send email to ${normalizedEmail}: ${String(err)}`);
      throw createError(500, 'Failed to send verification email. Please try again.');
    }
  }

  /**
   * Verify an OTP for the given email.
   * Returns true if valid, false if wrong/expired.
   * Throws 429 if max attempts exceeded.
   * Deletes the entry on success (one-time use).
   */
  verifyOtp(email: string, otp: string): boolean {
    const normalizedEmail = email.trim().toLowerCase();
    const entry = this.store.get(normalizedEmail);

    if (!entry) return false;

    // Expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(normalizedEmail);
      return false;
    }

    // Max attempts exceeded — force re-send
    if (entry.attempts >= MAX_ATTEMPTS) {
      this.store.delete(normalizedEmail);
      throw createError(429, 'Too many failed attempts. Please request a new verification code.');
    }

    // Timing-safe comparison to prevent timing attacks
    const inputHash = this.hashOtp(otp);
    const a = Buffer.from(entry.hash, 'hex');
    const b = Buffer.from(inputHash, 'hex');
    const match = crypto.timingSafeEqual(a, b);

    if (match) {
      this.store.delete(normalizedEmail); // one-time use
      return true;
    }

    // Wrong OTP — increment attempts
    entry.attempts += 1;
    return false;
  }
}

/** Singleton — one OTP service per process. */
export const otpService = new OtpService();

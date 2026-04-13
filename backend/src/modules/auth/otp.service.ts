// email verification service
// generates secure 6-digit one-time passwords
// manages in-memory otp store with expiration
// implements rate-limiting and account lockout
// handles smtp delivery via nodemailer

import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { createError } from '../../middleware/errorHandler';
import { logger } from '../../lib/logger';

// types

interface OtpEntry {
  hash: string;       // sha-256 of otp
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

// constants

const OTP_VALIDITY_MS   = 5 * 60 * 1000;   // 5 minutes
const COOLDOWN_MS       = 60 * 1000;        // 60s between sends to same email
const MAX_ATTEMPTS      = 5;                // lock out after 5 wrong guesses
const CLEANUP_INTERVAL  = 60 * 1000;        // sweep expired entries every 60s

// transporter creation

function createTransporter(): nodemailer.Transporter | null {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    logger.warn('[otp] SMTP_USER or SMTP_PASS not set — OTP emails will fail');
    return null;
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL — more reliably unblocked on Railway than port 587 STARTTLS
    auth: { user, pass },
    // rejectunauthorized: true is the secure default — validates the smtp server certificate
    tls: {
      rejectUnauthorized: true,
    },
  });
}

// otp service implementation

class OtpService {
  private readonly store = new Map<string, OtpEntry>();
  private readonly transporter: nodemailer.Transporter | null;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.transporter = createTransporter();

    // periodic cleanup of expired entries
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [email, entry] of this.store) {
        if (now > entry.expiresAt) this.store.delete(email);
      }
    }, CLEANUP_INTERVAL);

    // allow process to exit cleanly without waiting for this timer
    this.cleanupTimer.unref();
  }

  // generate a cryptographically secure 6-digit otp
  private generateOtp(): string {
    return crypto.randomInt(100_000, 1_000_000).toString();
  }

  // sha-256 hash of otp
  private hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  // send otp with per-email rate limiting
  async sendOtp(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();

    // rate limit: one otp per email per cooldown period
    const existing = this.store.get(normalizedEmail);
    if (existing && (now - existing.lastSentAt) < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
      throw createError(429, `Please wait ${waitSec}s before requesting another OTP`);
    }

    // otp_static env var: bypass random otp — use a fixed code (e.g. "000000")
    // only for development/testing when smtp is unavailable. must not be set in production.
    const staticOtp = process.env.OTP_STATIC;
    if (staticOtp && process.env.NODE_ENV === 'production') {
      logger.error('[otp] OTP_STATIC must not be set in production — it allows anyone to register');
      throw createError(500, 'Server misconfiguration');
    }
    const otp = staticOtp || this.generateOtp();

    this.store.set(normalizedEmail, {
      hash: this.hashOtp(otp),
      expiresAt: now + OTP_VALIDITY_MS,
      attempts: 0,
      lastSentAt: now,
    });

    // in non-production: print otp to stdout (visible in railway/local logs) so dev/test can proceed without smtp.
    // in production: never log the otp — it would expose credentials in log aggregators.
    if (process.env.NODE_ENV !== 'production') {
      process.stdout.write(`[OTP:dev] ${normalizedEmail} → ${otp}\n`);
    }

    if (staticOtp || !this.transporter) return;

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
    } catch (err) {
      logger.warn(`[otp] SMTP delivery failed for ${normalizedEmail}: ${String(err)}`);
    }
  }

  // verify otp for the given email
  verifyOtp(email: string, otp: string): boolean {
    const normalizedEmail = email.trim().toLowerCase();
    const entry = this.store.get(normalizedEmail);

    if (!entry) return false;

    // expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(normalizedEmail);
      return false;
    }

    // max attempts exceeded — force re-send
    if (entry.attempts >= MAX_ATTEMPTS) {
      this.store.delete(normalizedEmail);
      throw createError(429, 'Too many failed attempts. Please request a new verification code.');
    }

    // timing-safe comparison to prevent timing attacks
    const inputHash = this.hashOtp(otp);
    const a = Buffer.from(entry.hash, 'hex');
    const b = Buffer.from(inputHash, 'hex');
    const match = crypto.timingSafeEqual(a, b);

    if (match) {
      this.store.delete(normalizedEmail); // one-time use
      return true;
    }

    // wrong otp — increment attempts
    entry.attempts += 1;
    return false;
  }
}

// singleton otp service
export const otpService = new OtpService();

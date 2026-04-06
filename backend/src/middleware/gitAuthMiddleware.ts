/**
 * gitAuthMiddleware.ts — HTTP Basic auth guard for git-http-backend routes
 *
 * git CLI sends credentials as HTTP Basic auth (base64).
 * This middleware:
 *   1. Prompts unauthenticated requests with WWW-Authenticate
 *   2. Decodes and validates credentials against the DB (bcrypt)
 *   3. Verifies the authenticated user matches the :username in the URL
 *   4. Attaches user identity to res.locals for downstream use
 *
 * Applied only to routes under /git/*
 *
 * Architecture: Middleware Pattern
 */

import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../lib/db';
import { logger } from '../lib/logger';

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
}

export async function gitAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];

  // ── Missing / wrong scheme → challenge client ──────────────────────────────
  if (!authHeader?.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Gitanic", charset="UTF-8"');
    // Use 401 text/plain — git CLI parses this for credential prompting
    res.status(401).type('text/plain').send('Authentication required\n');
    return;
  }

  // ── Decode base64 credentials ──────────────────────────────────────────────
  let credUsername: string;
  let password: string;

  try {
    const decoded   = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const colonIdx  = decoded.indexOf(':');
    if (colonIdx === -1) throw new Error('No colon separator in credentials');
    credUsername = decoded.slice(0, colonIdx);
    password     = decoded.slice(colonIdx + 1);
  } catch (err) {
    logger.warn(`[gitAuth] Malformed Authorization header: ${String(err)}`, {
      meta: { ip: req.ip },
    });
    res.status(400).type('text/plain').send('Malformed Authorization header\n');
    return;
  }

  if (!credUsername || !password) {
    res.set('WWW-Authenticate', 'Basic realm="Gitanic", charset="UTF-8"');
    res.status(401).type('text/plain').send('Authentication required\n');
    return;
  }

  // ── DB lookup ──────────────────────────────────────────────────────────────
  let user: UserRow | undefined;
  try {
    const rows = await query<UserRow>(
      'SELECT id, username, password_hash FROM users WHERE username = $1',
      [credUsername]
    );
    user = rows[0];
  } catch (err) {
    logger.error(`[gitAuth] DB error: ${String(err)}`);
    res.status(500).type('text/plain').send('Internal server error\n');
    return;
  }

  // ── Constant-time bcrypt compare (timing-safe) ─────────────────────────────
  // Always call bcrypt.compare even if user not found to prevent timing oracle
  const dummyHash = '$2b$12$invalidhashpadding......................';
  const hashToCompare = user ? user.password_hash : dummyHash;
  const valid = await bcrypt.compare(password, hashToCompare);

  if (!user || !valid) {
    res.set('WWW-Authenticate', 'Basic realm="Gitanic", charset="UTF-8"');
    res.status(401).type('text/plain').send('Invalid credentials\n');
    return;
  }

  // ── URL ownership check ────────────────────────────────────────────────────
  // The :username segment in the URL must match the authenticated user exactly.
  // This prevents user A from pushing to user B's repo.
  const urlUsername = req.params['username'] as string | undefined;
  if (urlUsername && urlUsername !== user.username) {
    logger.warn(`[gitAuth] User "${user.username}" attempted access to "${urlUsername}" repos`, {
      userId: user.id,
      meta: { urlUsername },
    });
    res.status(403).type('text/plain').send('Forbidden: you do not own this repository\n');
    return;
  }

  // ── Attach identity ────────────────────────────────────────────────────────
  res.locals.user = { sub: user.id, username: user.username, iat: 0, exp: 0 };
  next();
}

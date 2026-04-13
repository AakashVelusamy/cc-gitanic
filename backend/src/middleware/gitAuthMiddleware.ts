// git protocol security middleware
// implements http basic authentication for git
// decodes and validates base64 credentials
// performs secure password hash comparisons
// enforces repository ownership and access
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

  // authenticate via basic auth
  if (!authHeader?.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Gitanic", charset="UTF-8"');
    // use 401 text/plain for git cli
    res.status(401).type('text/plain').send('Authentication required\n');
    return;
  }

  // decode base64 credentials
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

  // database lookup
  let user: UserRow | undefined;
  try {
    const rows = await query<UserRow>(
      'SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER($1)',
      [credUsername]
    );
    user = rows[0];
  } catch (err) {
    logger.error(`[gitAuth] DB error: ${String(err)}`);
    res.status(500).type('text/plain').send('Internal server error\n');
    return;
  }

  // bcrypt comparison
  const DUMMY_HASH = '$2b$12$invalidhashpaddingthatisexactly53charslong........';
  const hashToCompare = user ? user.password_hash : DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCompare);

  if (!user || !valid) {
    res.set('WWW-Authenticate', 'Basic realm="Gitanic", charset="UTF-8"');
    res.status(401).type('text/plain').send('Invalid credentials\n');
    return;
  }

  // verify that authenticated user matches url path
  const urlUsername = req.params['username'] as string | undefined;
  if (urlUsername && urlUsername.toLowerCase() !== user.username.toLowerCase()) {
    logger.warn(`[gitAuth] User "${user.username}" attempted access to "${urlUsername}" repos`, {
      userId: user.id,
      meta: { urlUsername },
    });
    res.status(403).type('text/plain').send('Forbidden: you do not own this repository\n');
    return;
  }

  // attach user identity
  res.locals.user = { sub: user.id, username: user.username, iat: 0, exp: 0 };
  next();
}

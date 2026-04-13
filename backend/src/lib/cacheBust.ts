/**
 * cacheBust.ts
 *
 * Notifies the Vercel frontend edge layer to drop its cached deployment
 * entry for a given user. Called after a successful deployment push.
 *
 * The frontend responds to this with 200; the actual edge Map TTL (60 s)
 * ensures the cache naturally expires. For instant purge, upgrade to
 * Vercel KV writes inside the invalidation endpoint.
 */

import { logger } from '../lib/logger';

const FRONTEND_URL   = process.env.FRONTEND_URL!;   // e.g. https://gitanic.vercel.app
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;

export async function bustDeploymentCache(username: string): Promise<void> {
  if (!FRONTEND_URL || !INTERNAL_SECRET) {
    logger.warn('[cacheBust] FRONTEND_URL or INTERNAL_SECRET not set — skipping cache bust');
    return;
  }

  try {
    const res = await fetch(`${FRONTEND_URL}/api/cache/invalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ username }),
      signal: AbortSignal.timeout(5_000), // 5 s timeout — fire-and-forget
    });

    if (res.ok) {
      logger.info(`[cacheBust] Cache busted for user "${username}"`);
    } else {
      logger.warn(`[cacheBust] Invalidation request failed: ${res.status}`);
    }
  } catch (err) {
    // Non-blocking — a cache bust failure must NOT affect the deployment result.
    logger.warn(`[cacheBust] Invalidation request error: ${String(err)}`);
  }
}

/**
 * Bust the local serve server's (serve.ts) in-memory deployment resolution cache.
 * The serve server runs on SERVE_PORT (default 4000) and maintains a 60s TTL Map
 * from username → deploymentId. After a successful deploy we POST here so the
 * new deploymentId is picked up immediately instead of waiting for the TTL.
 */
export async function bustLocalServeCache(username: string): Promise<void> {
  const servePort = process.env.SERVE_PORT ?? '4000';
  const secret = process.env.INTERNAL_SECRET ?? 'change-me-internal-secret';

  try {
    const res = await fetch(`http://localhost:${servePort}/cache/bust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gitanic-secret': secret,
      },
      body: JSON.stringify({ username }),
      signal: AbortSignal.timeout(3_000),
    });

    if (res.ok) {
      logger.info(`[cacheBust] Local serve cache busted for user "${username}"`);
    } else {
      logger.warn(`[cacheBust] Local serve cache bust failed: ${res.status}`);
    }
  } catch (err) {
    logger.warn(`[cacheBust] Local serve cache bust error: ${String(err)}`);
  }
}

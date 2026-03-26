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

    if (!res.ok) {
      logger.warn(`[cacheBust] Invalidation request failed: ${res.status}`);
    } else {
      logger.info(`[cacheBust] Cache busted for user "${username}"`);
    }
  } catch (err) {
    // Non-blocking — a cache bust failure must NOT affect the deployment result.
    logger.warn(`[cacheBust] Invalidation request error: ${String(err)}`);
  }
}

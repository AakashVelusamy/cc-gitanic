// distribution cache invalidation service
// notifies frontend edge layer of deployment changes
// triggers local serve server memory cache resets
// authorizes requests using internal shared secrets
// implements timeout-guarded fetch calls
import { logger } from '../lib/logger';

const FRONTEND_URL   = process.env.FRONTEND_URL!;
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
      signal: AbortSignal.timeout(5_000),
    });

    if (res.ok) {
      logger.info(`[cacheBust] Cache busted for user "${username}"`);
    } else {
      logger.warn(`[cacheBust] Invalidation request failed: ${res.status}`);
    }
  } catch (err) {
    logger.warn(`[cacheBust] Invalidation request error: ${String(err)}`);
  }
}

// bust the local serve server's in-memory deployment resolution cache
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

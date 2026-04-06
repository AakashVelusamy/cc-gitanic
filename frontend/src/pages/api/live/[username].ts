import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * GET /api/live/[username]
 *
 * Legacy route — the live proxy now lives at
 * /api/live/[username]/[deploymentId]/[[...path]].
 * This stub returns 404 to avoid leaking internal error details.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(404).json({ error: 'Not found' });
}

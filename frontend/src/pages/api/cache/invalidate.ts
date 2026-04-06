import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * POST /api/cache/invalidate
 *
 * Called by the Railway backend after a successful deployment to notify
 * the frontend to warm/update its Edge Config cache for a specific user.
 *
 * Body: { username: string }
 * Headers: x-internal-secret: <INTERNAL_SECRET>
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { username } = req.body as { username?: string };
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'username is required' });
  }

  const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
  const EDGE_CONFIG_ID = process.env.EDGE_CONFIG_ID; // The ID of the Edge Config stores (e.g. edge_config_...)

  if (!VERCEL_API_TOKEN || !EDGE_CONFIG_ID) {
    console.log(`[cache-invalidate] VERCEL_API_TOKEN or EDGE_CONFIG_ID missing. Acknowledging cache bust without updating Edge Config.`);
    return res.status(200).json({ ok: true, username, skipped: true });
  }

  try {
    // 1. Fetch latest active deployment from Supabase
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const qs = new URLSearchParams({
      select: [
        'active_deployment_id',
        'deployment_history!repositories_active_deployment_id_fkey(storage_path)',
        'users!repositories_owner_id_fkey!inner(username)',
      ].join(','),
      'users.username': `eq.${username}`,
      'active_deployment_id': 'not.is.null',
      limit: '1',
    });

    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/repositories?${qs.toString()}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: 'application/json',
      },
    });

    let newCacheValue: { depId: string, storagePath: string } | null = null;

    if (sbRes.ok) {
      const rows = await sbRes.json();
      if (rows.length > 0 && rows[0].active_deployment_id) {
        const storagePath = rows[0].deployment_history?.[0]?.storage_path;
        if (storagePath) {
          newCacheValue = {
            depId: rows[0].active_deployment_id,
            storagePath,
          };
        }
      }
    }

    // 2. Patch Edge Config
    const patchRes = await fetch(`https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/items`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${VERCEL_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            operation: newCacheValue ? 'upsert' : 'delete',
            key: username,
            value: newCacheValue,
          },
        ],
      }),
    });

    if (!patchRes.ok) {
      console.error('[cache-invalidate] Vercel API error:', patchRes.status, await patchRes.text());
      return res.status(502).json({ error: 'Failed to update Edge Config' });
    }

    console.log(`[cache-invalidate] Edge config warmed for username="${username}"`);
    return res.status(200).json({ ok: true, username, updated: true });

  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('[Cache Invalidate] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

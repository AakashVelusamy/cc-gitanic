/**
 * serve.ts — Static Site Server (Proxy/Gateway Pattern)
 *
 * Standalone Express server that serves deployed static sites locally.
 * In production, Vercel Edge Middleware handles this role.
 * Locally, this server replicates that behavior by proxying to Supabase Storage.
 *
 * Request flow:
 *   GET http://localhost:4000/{username}/{path}
 *     → Look up user's active_deployment_id (cached 60s)
 *     → Proxy to Supabase Storage public URL
 *     → SPA fallback: serve index.html for non-file paths
 *
 * Architecture: Proxy/Gateway Pattern + Singleton (db pool)
 */

import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { Request, Response } from 'express';
import { query } from './lib/db';

// ── Configuration ────────────────────────────────────────────────────────────

const PORT         = Number.parseInt(process.env.SERVE_PORT ?? '4000', 10);
const SUPABASE_URL = process.env.SUPABASE_URL!;
const BUCKET       = 'deployments';

if (!SUPABASE_URL) {
  console.error('[serve] SUPABASE_URL is required');
  process.exit(1);
}

// ── In-memory cache (username → { deploymentId, expiresAt }) ─────────────────

interface CacheEntry {
  deploymentId: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds
const cache = new Map<string, CacheEntry>();

async function resolveDeployment(username: string): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(username);
  if (cached && cached.expiresAt > now) {
    return cached.deploymentId;
  }

  const rows = await query<{ active_deployment_id: string }>(
    `SELECT r.active_deployment_id
       FROM repositories r
       JOIN users u ON u.id = r.owner_id
      WHERE u.username = $1
        AND r.active_deployment_id IS NOT NULL
      ORDER BY r.created_at DESC
      LIMIT 1`,
    [username]
  );

  if (rows.length === 0) return null;

  const deploymentId = rows[0].active_deployment_id;
  cache.set(username, { deploymentId, expiresAt: now + CACHE_TTL_MS });
  return deploymentId;
}

// ── Express app ──────────────────────────────────────────────────────────────

/** Valid username: lowercase alphanumeric + hyphens only */
const SAFE_USERNAME_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gitanic-serve', ts: new Date().toISOString() });
});

// Cache bust endpoint — called by deployment pipeline after a successful deploy
app.post('/cache/bust', (req, res) => {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }
  const provided = req.headers['x-gitanic-secret'];
  const providedStr = Array.isArray(provided) ? provided[0] : provided ?? '';
  // Timing-safe comparison prevents secret enumeration via response timing (S6432)
  const secretBuf   = Buffer.from(secret,      'utf8');
  const providedBuf = Buffer.from(providedStr, 'utf8');
  const isValid = secretBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(secretBuf, providedBuf);
  if (!isValid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { username } = req.body as { username?: string };
  if (username) {
    cache.delete(username);
    console.log(`[serve] Cache busted for user "${username.replace(/[\r\n]/g, '')}"`);
    res.json({ ok: true, username });
  } else {
    // Bust everything
    cache.clear();
    console.log('[serve] Full cache cleared');
    res.json({ ok: true, all: true });
  }
});

// Static site proxy: /{username}/{path?}
app.get('/:username/*', handleSiteRequest);
app.get('/:username', handleSiteRequest);

async function handleSiteRequest(req: Request, res: Response): Promise<void> {
  const rawUsername = req.params['username'];

  // Skip favicon and other non-user requests
  if (rawUsername === 'favicon.ico' || rawUsername === 'health') {
    res.status(404).end();
    return;
  }

  // Validate username to a known-safe set of characters (S5131)
  if (!SAFE_USERNAME_RE.test(rawUsername)) {
    res.status(400).end();
    return;
  }
  const username = rawUsername;

  try {
    const deploymentId = await resolveDeployment(username);

    if (!deploymentId) {
      // username is validated to safe alphanumeric/hyphen chars; escapeHtml as defence-in-depth
      res.status(404).send(notFoundPage(username));
      return;
    }

    // Build the file path within the deployment
    // req.params[0] is the wildcard match (everything after /{username}/)
    let filePath = req.params[0] || 'index.html';

    // If path doesn't look like a file (no extension), default to index.html (SPA fallback)
    if (!filePath.includes('.')) {
      filePath = filePath.endsWith('/') ? `${filePath}index.html` : 'index.html';
    }

    // Encode every segment of the path to prevent path injection (S7044)
    const encodedPath = filePath
      .split('/')
      .filter((seg) => seg.length > 0 && seg !== '..' && seg !== '.')
      .map(encodeURIComponent)
      .join('/') || 'index.html';

    // Build Supabase Storage public URL from fully-encoded components
    const storageUrl =
      `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(username)}/${encodeURIComponent(deploymentId)}/${encodedPath}`;

    // Proxy the response from Supabase Storage
    const upstream = await fetch(storageUrl);

    if (!upstream.ok) {
      // If the specific file wasn't found, try SPA fallback (index.html)
      if (upstream.status === 404 || upstream.status === 400) {
        const fallbackUrl =
          `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(username)}/${encodeURIComponent(deploymentId)}/index.html`;
        const fallback = await fetch(fallbackUrl);

        if (fallback.ok) {
          res.status(200);
          copyHeaders(fallback, res, 'index.html');
          res.send(Buffer.from(await fallback.arrayBuffer()));
          return;
        }
      }

      res.status(upstream.status).send('Not found');
      return;
    }

    res.status(upstream.status);
    copyHeaders(upstream, res, filePath);
    res.send(Buffer.from(await upstream.arrayBuffer()));

  } catch (err) {
    console.error(`[serve] Error serving ${username}: ${String(err)}`);
    res.status(500).send('Internal server error');
  }
}

/**
 * Forward content-type and cache-control headers from upstream response.
 * Content-Type is ALWAYS determined by the local MIME map (file extension),
 * which guarantees .html → text/html even if Supabase stored it as text/plain.
 * Falls back to the upstream header only for unknown extensions.
 */
function copyHeaders(upstream: globalThis.Response, res: Response, filePath: string): void {
  const localMime = inferMimeType(filePath);
  const upstreamCt = upstream.headers.get('content-type');
  res.set('Content-Type', localMime ?? upstreamCt ?? 'application/octet-stream');

  const cc = upstream.headers.get('cache-control');
  if (cc) res.set('Cache-Control', cc);

  // Allow cross-origin requests for fonts/assets
  res.set('Access-Control-Allow-Origin', '*');
}

/** Map file extensions to MIME types. Returns null for unknown extensions. */
function inferMimeType(filePath: string): string | null {
  const map: Record<string, string> = {
    '.html':  'text/html; charset=utf-8',
    '.htm':   'text/html; charset=utf-8',
    '.css':   'text/css; charset=utf-8',
    '.js':    'application/javascript; charset=utf-8',
    '.mjs':   'application/javascript; charset=utf-8',
    '.cjs':   'application/javascript; charset=utf-8',
    '.json':  'application/json; charset=utf-8',
    '.map':   'application/json',
    '.svg':   'image/svg+xml',
    '.png':   'image/png',
    '.jpg':   'image/jpeg',
    '.jpeg':  'image/jpeg',
    '.gif':   'image/gif',
    '.webp':  'image/webp',
    '.avif':  'image/avif',
    '.ico':   'image/x-icon',
    '.woff':  'font/woff',
    '.woff2': 'font/woff2',
    '.ttf':   'font/ttf',
    '.eot':   'application/vnd.ms-fontobject',
    '.otf':   'font/otf',
    '.txt':   'text/plain; charset=utf-8',
    '.md':    'text/markdown; charset=utf-8',
    '.xml':   'application/xml',
    '.mp4':   'video/mp4',
    '.webm':  'video/webm',
    '.mp3':   'audio/mpeg',
    '.wav':   'audio/wav',
    '.pdf':   'application/pdf',
    '.jsx':   'application/javascript; charset=utf-8',
    '.tsx':   'application/javascript; charset=utf-8',
    '.ts':    'application/typescript; charset=utf-8',
  };
  return map[path.extname(filePath).toLowerCase()] ?? null;
}

/** Escape a string for safe inclusion in HTML content (prevents XSS). */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Simple 404 HTML page. */
function notFoundPage(username: string): string {
  // Escape username before injecting into HTML to prevent XSS
  const safeUsername = escapeHtml(username);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Not Found — Gitanic</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0e1a; color: #e0e6f0; font-family: system-ui, sans-serif;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { text-align: center; max-width: 420px; padding: 3rem 2rem;
            background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
            border-radius: 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.75rem; }
    p { color: #8892a8; font-size: 0.95rem; line-height: 1.5; }
    code { color: #00f0ff; background: rgba(0,240,255,0.08); padding: 0.15em 0.4em;
           border-radius: 0.25em; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="card">
    <h1>No deployment found</h1>
    <p>User <code>${safeUsername}</code> has no active deployment.<br/>
    Push code and click <strong>Deploy</strong> in the Gitanic dashboard to get started.</p>
  </div>
</body>
</html>`;
}

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[serve] Gitanic static site server listening on http://localhost:${PORT}`);
  console.log(`[serve] Visit http://localhost:${PORT}/{username}/ to view deployed sites`);
});
import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/edge-config';

// -- Config ------------------------------------------------------------------
const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? 'gitanic.com'; // e.g. gitanic.com
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!; // e.g. https://xxx.supabase.co
const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/deployments`; // public bucket

interface CacheEntry {
  depId: string;
  storagePath: string;
}

// -- Proxy -------------------------------------------------------------------
export async function proxy(req: NextRequest) {
  const hostname = req.headers.get('host') ?? '';

  // 1. Detect if this is a subdomain request.
  const subdomain = extractSubdomain(hostname, ROOT_DOMAIN);

  if (!subdomain) {
    // Root domain or www; let Next.js handle it normally.
    return NextResponse.next();
  }

  const username = subdomain;
  const urlPath = req.nextUrl.pathname; // e.g. /about or /
  const assetPath = urlPath === '/' ? '/index.html' : urlPath;

  try {
    // 2. Look up active deployment (exclusively via Edge Config).
    const cacheEntry = await resolveDeployment(username);

    if (!cacheEntry) {
      return notFoundResponse(username);
    }

    // 3. Rewrite to Supabase Storage public URL.
    const target = `${STORAGE_BASE}/${cacheEntry.storagePath}${assetPath}`;
    return NextResponse.rewrite(target);
  } catch (err) {
    console.error('[proxy] Error resolving deployment:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 502 });
  }
}

// -- Helpers -----------------------------------------------------------------

function extractSubdomain(hostname: string, rootDomain: string): string | null {
  const host = hostname.replaceAll(/:\d+$/, '');
  if (host === rootDomain || host === `www.${rootDomain}`) return null;
  if (host.endsWith(`.${rootDomain}`)) {
    const sub = host.slice(0, host.length - rootDomain.length - 1);
    if (!sub.includes('.') && sub !== 'www') return sub;
  }
  return null;
}

/**
 * Fetch the active deployment for a given username.
 * Uses Vercel Edge Config for low-latency lookups.
 *
 * NOTE: For maximum security, we no longer fall back to Supabase REST here
 * to avoid putting the SERVICE_ROLE_KEY in the frontend environment.
 */
async function resolveDeployment(username: string): Promise<CacheEntry | null> {
  try {
    if (process.env.EDGE_CONFIG) {
      const cached = await get<CacheEntry>(username);
      if (cached?.depId && cached?.storagePath) {
        return cached;
      }
    }
  } catch (err) {
    console.warn('[proxy] Edge Config read failed:', err);
  }
  return null;
}

function escapeHtml(str: string): string {
  return str
    .replaceAll(/&/g, '&amp;')
    .replaceAll(/</g, '&lt;')
    .replaceAll(/>/g, '&gt;')
    .replaceAll(/"/g, '&quot;')
    .replaceAll(/'/g, '&#39;');
}

function notFoundResponse(username: string): NextResponse {
  // Escape the username to prevent reflected XSS in the 404 page
  const safeUsername = escapeHtml(username);
  const safeRootDomain = escapeHtml(ROOT_DOMAIN);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>No deployment found - Gitanic</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0d1117; color: #c9d1d9;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; }
    h1 { color: #e6edf3; }
    a { color: #58a6ff; text-decoration: none; }
  </style>
</head>
<body>
  <div class="box">
    <h1>404</h1>
    <p><strong>${safeUsername}</strong> has no active deployment yet.</p>
    <p>Visit <a href="https://${safeRootDomain}">Gitanic</a> to create one.</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

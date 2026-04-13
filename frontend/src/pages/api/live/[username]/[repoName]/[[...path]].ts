import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    responseLimit: false,
    externalResolver: true,
  },
};

/** Safe username: lowercase alphanumeric, hyphens only, max 64 chars */
const USERNAME_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

/** UUID v4 format for deployment IDs */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Safe repo name: alphanumeric, hyphen, underscore, dot, 1-100 chars */
const REPO_NAME_RE = /^[a-zA-Z0-9._-]{1,100}$/;

/** Reject path segments that attempt traversal or contain dangerous characters */
function isSafePathSegment(segment: string): boolean {
  if (segment === '..') return false;
  if (segment === '.') return false;
  if (segment.includes('\0')) return false;
  if (/[/\\]/.test(segment)) return false;
  return true;
}

function inferContentType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    'html': 'text/html; charset=utf-8',
    'css': 'text/css; charset=utf-8',
    'js': 'application/javascript',
    'json': 'application/json',
    'svg': 'image/svg+xml',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'ico': 'image/x-icon',
    'txt': 'text/plain; charset=utf-8',
  };
  return ext ? map[ext] || 'application/octet-stream' : 'application/octet-stream';
}

/** Rewrite HTML asset paths and inject a <base> tag so relative resources resolve correctly. */
function rewriteHtml(html: string, basePath: string): string {
  const baseTag = `<base href="${basePath}/" />`;
  const rewritten = html
    .replaceAll(/(src|href)="\/([^"]+)"/g, `$1="${basePath}/$2"`)
    .replaceAll(/(src|href)='\/([^']+)'/g, `$1='${basePath}/$2'`);

  if (rewritten.includes('<head>')) {
    return rewritten.replace('<head>', `<head>${baseTag}`);
  }
  if (rewritten.includes('<HEAD>')) {
    return rewritten.replace('<HEAD>', `<HEAD>${baseTag}`);
  }
  return baseTag + rewritten;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { username, repoName, path } = req.query;

    const uname = Array.isArray(username) ? username[0] : username;
    const repoOrId = Array.isArray(repoName) ? repoName[0] : repoName;

    // --- Input validation (SSRF / path-traversal guards) ---
    if (!uname || !USERNAME_RE.test(uname)) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    if (!repoOrId || (!REPO_NAME_RE.test(repoOrId) && !UUID_RE.test(repoOrId))) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    let depId = '';

    // If it's already a UUID, use it directly (legacy support)
    if (UUID_RE.test(repoOrId)) {
        depId = repoOrId;
    } else {
        // Resolve repo name to deployment ID via backend
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const resolveUrl = `${apiBase}/api/repos/resolve/${uname}/${repoOrId}`;
        
        try {
            const resolveRes = await fetch(resolveUrl);
            if (!resolveRes.ok) {
                return res.status(resolveRes.status).send('Deployment not found for this repository');
            }
            const data = await resolveRes.json();
            depId = data.deploymentId;
        } catch (err) {
            console.error('[live] Failed to resolve deployment:', err);
            return res.status(500).json({ error: 'Resolution failed' });
        }
    }

    if (!depId || !UUID_RE.test(depId)) {
      return res.status(400).json({ error: 'Invalid deployment' });
    }

    // Parse path segments and validate each one
    let pathArr: string[] = [];
    if (Array.isArray(path)) {
      pathArr = path;
    } else if (typeof path === 'string') {
      pathArr = [path];
    }

    for (const segment of pathArr) {
      if (!isSafePathSegment(segment)) {
        return res.status(400).json({ error: 'Invalid request' });
      }
    }

    const relativePath = pathArr.length === 0 ? 'index.html' : pathArr.join('/');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    // Construct the upstream URL strictly from validated components only 
    const targetUrl = `${supabaseUrl}/storage/v1/object/public/deployments/${uname}/${depId}/${relativePath}`;

    const supabaseRes = await fetch(targetUrl);

    if (!supabaseRes.ok) {
      // Do not echo back the relativePath to avoid information disclosure
      res.status(supabaseRes.status).send('Asset not found');
      return;
    }

    const contentType = inferContentType(relativePath);
    const buffer = await supabaseRes.arrayBuffer();

    if (contentType.includes('text/html')) {
        const htmlStr = rewriteHtml(Buffer.from(buffer).toString('utf-8'), `/api/live/${uname}/${repoOrId}`);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.send(htmlStr);
        return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(Buffer.from(buffer));

  } catch {
    // Do not expose internal error details
    res.status(500).json({ error: 'Internal server error' });
  }
}

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { username, deploymentId, path } = req.query;

    const uname = Array.isArray(username) ? username[0] : username;
    const depId = Array.isArray(deploymentId) ? deploymentId[0] : deploymentId;

    // --- Input validation (SSRF / path-traversal guards) ---
    if (!uname || !USERNAME_RE.test(uname)) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    if (!depId || !UUID_RE.test(depId)) {
      return res.status(400).json({ error: 'Invalid request' });
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
        let htmlStr = Buffer.from(buffer).toString('utf-8');
        const baseTag = `<base href="/api/live/${uname}/${depId}/" />`;
        if (htmlStr.includes('<head>')) {
            htmlStr = htmlStr.replace('<head>', `<head>${baseTag}`);
        } else if (htmlStr.includes('<HEAD>')) {
            htmlStr = htmlStr.replace('<HEAD>', `<HEAD>${baseTag}`);
        } else {
            htmlStr = baseTag + htmlStr;
        }
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

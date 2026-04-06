import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    responseLimit: false,
    externalResolver: true,
  },
};

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
    
    // Parse the path array correctly
    let pathArr: string[] = [];
    if (Array.isArray(path)) {
      pathArr = path;
    } else if (typeof path === 'string') {
      pathArr = [path];
    }
    
    const relativePath = pathArr.length === 0 ? 'index.html' : pathArr.join('/');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const targetUrl = `${supabaseUrl}/storage/v1/object/public/deployments/${uname}/${depId}/${relativePath}`;

    const supabaseRes = await fetch(targetUrl);

    if (!supabaseRes.ok) {
      res.status(supabaseRes.status).send(`Failed to load ${relativePath}`);
      return;
    }

    const contentType = inferContentType(relativePath);
    const buffer = await supabaseRes.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: 'Proxy failed' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { username, path } = req.query;
  const usernameStr = Array.isArray(username) ? username[0] : username;
  const pathArr = Array.isArray(path) ? path : (path ? [path] : []);
  
  // Use edge config or fallback
  const assetPath = pathArr.length === 0 ? 'index.html' : pathArr.join('/');
  
  // Wait, to proxy we need the active deployment from DB. 
  // Let's just make the URL: /api/live/[username]/[deploymentId]/[...path]
  res.status(500).json({ error: 'Moved' });
}

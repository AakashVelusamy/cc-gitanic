// dynamic user deployment routing entry
// handles live traffic requests for deployed sites
// provides fallback for non-existent users
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(404).json({ error: 'Not found' });
}

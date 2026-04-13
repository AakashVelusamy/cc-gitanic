// database connectivity layer
// manages postgresql connection pooling
// configures ssl for production environments
// provides generic async query helper
// handles unexpected pool errors
import { Pool, PoolConfig, QueryResultRow } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('[db] DATABASE_URL environment variable is not set');
}

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

// singleton pool instance
export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[db] Unexpected pg pool error:', err.message);
});

// generic query helper
export async function query<T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const { rows } = await pool.query<T>(text, params);
  return rows;
}

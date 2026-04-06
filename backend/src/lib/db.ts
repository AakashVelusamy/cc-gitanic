/**
 * db.ts — pg.Pool singleton
 *
 * Provides a single shared connection pool for the entire backend process.
 * The pool is lazily initialised on first import and reused on all subsequent
 * imports (Node module cache guarantees singleton behaviour).
 *
 * Architecture: Singleton Pattern
 */

import { Pool, PoolConfig, QueryResultRow } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('[db] DATABASE_URL environment variable is not set');
}

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  // SSL is required for Supabase (Railway outbound) in production
  // rejectUnauthorized is false because Supabase pooler can use self-signed certs
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  // Connection pool tuning
  max: 10,          // max simultaneous clients
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

/** Singleton pg.Pool — import and use directly; never instantiate another Pool. */
export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[db] Unexpected pg pool error:', err.message);
});

/**
 * Convenience query helper.
 * Automatically acquires + releases a client from the pool.
 */
export async function query<T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const { rows } = await pool.query<T>(text, params);
  return rows;
}

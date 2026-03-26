/**
 * auth.repository.ts — Data access layer for auth
 *
 * All raw SQL lives here. No business logic.
 * Architecture: Repository Pattern
 */

import { query } from '../../lib/db';

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface CreateUserInput {
  username: string;
  password_hash: string;
}

export const AuthRepository = {
  /**
   * Find a user by username. Returns undefined if not found.
   */
  async findByUsername(username: string): Promise<UserRow | undefined> {
    const rows = await query<UserRow>(
      `SELECT id, username, password_hash, created_at
         FROM users
        WHERE username = $1
        LIMIT 1`,
      [username]
    );
    return rows[0];
  },

  /**
   * Find a user by UUID. Returns undefined if not found.
   */
  async findById(id: string): Promise<UserRow | undefined> {
    const rows = await query<UserRow>(
      `SELECT id, username, password_hash, created_at
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [id]
    );
    return rows[0];
  },

  /**
   * Insert a new user row. Returns the created row.
   * Throws a DB unique-violation error if username is taken.
   */
  async create(input: CreateUserInput): Promise<UserRow> {
    const rows = await query<UserRow>(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username, password_hash, created_at`,
      [input.username, input.password_hash]
    );
    // INSERT … RETURNING always yields exactly one row
    return rows[0];
  },
};

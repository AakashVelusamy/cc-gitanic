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
  email: string | null;
  password_hash: string;
  created_at: string;
}

export interface CreateUserInput {
  username: string;
  password_hash: string;
  email: string;
}

export interface UpdateProfileInput {
  email?: string | null;
}

export const AuthRepository = {
  /**
   * Find a user by username (case-insensitive). Returns undefined if not found.
   */
  async findByUsername(username: string): Promise<UserRow | undefined> {
    const rows = await query<UserRow>(
      `SELECT id, username, email, password_hash, created_at
         FROM users
        WHERE LOWER(username) = LOWER($1)
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
      `SELECT id, username, email, password_hash, created_at
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [id]
    );
    return rows[0];
  },

  /**
   * Insert a new user row. Returns the created row.
   * Throws a DB unique-violation error if username or email is taken.
   */
  async create(input: CreateUserInput): Promise<UserRow> {
    const rows = await query<UserRow>(
      `INSERT INTO users (username, password_hash, email)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, password_hash, created_at`,
      [input.username, input.password_hash, input.email]
    );
    return rows[0];
  },

  async updateProfile(id: string, input: UpdateProfileInput): Promise<UserRow | undefined> {
    const rows = await query<UserRow>(
      `UPDATE users
          SET email = $2
        WHERE id = $1
        RETURNING id, username, email, password_hash, created_at`,
      [id, input.email]
    );
    return rows[0];
  },
};

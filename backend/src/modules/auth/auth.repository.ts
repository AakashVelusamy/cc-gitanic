// data access layer for users
// manages account registration and profile records
// facilitates secure lookup by username or id
// provides profile update and synchronization logic
// enforces unique identity constraints at data level

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
  // find user by username
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

  // find user by id
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

  // insert new user row
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

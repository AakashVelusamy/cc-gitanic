/**
 * repo.repository.ts — Data access layer for repositories
 *
 * All raw SQL lives here. No business logic.
 * Architecture: Repository Pattern
 */

import { query, pool } from '../../lib/db';
import { PoolClient } from 'pg';

export interface RepoRow {
  id: string;
  name: string;
  owner_id: string;
  auto_deploy_enabled: boolean;
  active_deployment_id: string | null;
  created_at: string;
  updated_at?: string;
}

export interface RepoOwnerRow {
  name: string;
  username: string;
}

export interface CreateRepoInput {
  name: string;
  owner_id: string;
}

export const RepoRepository = {
  /** List all repositories with owner usernames (used for startup reconcile). */
  async findAllWithOwnerUsername(): Promise<RepoOwnerRow[]> {
    return query<RepoOwnerRow>(
      `SELECT r.name, u.username
         FROM repositories r
         JOIN users u ON u.id = r.owner_id
        ORDER BY u.username ASC, r.name ASC`
    );
  },

  /** List all repos belonging to a user, newest first. */
  async findAllByOwner(ownerId: string): Promise<RepoRow[]> {
    return query<RepoRow>(
      `SELECT r.id, r.name, r.owner_id, r.auto_deploy_enabled, r.active_deployment_id, r.created_at,
              COALESCE((SELECT MAX(h.deployed_at) FROM deployment_history h WHERE h.repo_id = r.id), r.created_at) AS updated_at
         FROM repositories r
        WHERE r.owner_id = $1
        ORDER BY updated_at DESC`,
      [ownerId]
    );
  },

  /** Find a single repo by owner + name. Returns undefined if not found. */
  async findByOwnerAndName(ownerId: string, name: string): Promise<RepoRow | undefined> {
    const rows = await query<RepoRow>(
      `SELECT r.id, r.name, r.owner_id, r.auto_deploy_enabled, r.active_deployment_id, r.created_at,
              COALESCE((SELECT MAX(h.deployed_at) FROM deployment_history h WHERE h.repo_id = r.id), r.created_at) AS updated_at
         FROM repositories r
        WHERE r.owner_id = $1 AND r.name = $2
        LIMIT 1`,
      [ownerId, name]
    );
    return rows[0];
  },

  /** Find a single repo by UUID. */
  async findById(id: string): Promise<RepoRow | undefined> {
    const rows = await query<RepoRow>(
      `SELECT r.id, r.name, r.owner_id, r.auto_deploy_enabled, r.active_deployment_id, r.created_at,
              COALESCE((SELECT MAX(h.deployed_at) FROM deployment_history h WHERE h.repo_id = r.id), r.created_at) AS updated_at
         FROM repositories r
        WHERE r.id = $1
        LIMIT 1`,
      [id]
    );
    return rows[0];
  },

  /** Insert a new repository row. Returns the created row. */
  async create(input: CreateRepoInput): Promise<RepoRow> {
    const rows = await query<RepoRow>(
      `INSERT INTO repositories (name, owner_id)
       VALUES ($1, $2)
       RETURNING id, name, owner_id, auto_deploy_enabled, active_deployment_id, created_at, created_at as updated_at`,
      [input.name, input.owner_id]
    );
    return rows[0];
  },

  /**
   * Atomically swap the active deployment pointer.
   * Only called with a deployment whose status = 'success'.
   * Also sets auto_deploy_enabled = true (trigger handles it, but we mirror here for clarity).
   */
  async setActiveDeployment(
    repoId: string,
    deploymentId: string,
    client?: PoolClient
  ): Promise<void> {
    const sql = `
      UPDATE repositories
         SET active_deployment_id = $1,
             auto_deploy_enabled  = true
       WHERE id = $2
    `;
    if (client) {
      await client.query(sql, [deploymentId, repoId]);
    } else {
      await query(sql, [deploymentId, repoId]);
    }
  },

  /** Delete a repo (CASCADE removes deployments + logs). */
  async delete(id: string, ownerId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM repositories WHERE id = $1 AND owner_id = $2`,
      [id, ownerId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async enableAutoDeploy(id: string, ownerId: string): Promise<void> {
    await query(
      `UPDATE repositories
          SET auto_deploy_enabled = true
        WHERE id = $1 AND owner_id = $2`,
      [id, ownerId]
    );
  },
};

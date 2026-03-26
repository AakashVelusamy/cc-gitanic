/**
 * deployment.repository.ts — Data access layer for deployments + logs
 *
 * Append-only tables. No UPDATE allowed on completed rows (enforced by DB
 * triggers). The only UPDATE permitted is status transitions while the pipeline
 * is running.
 *
 * Architecture: Repository Pattern
 */

import { query } from '../../lib/db';
import { pool } from '../../lib/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DeployStatus = 'pending' | 'building' | 'success' | 'failed';

export interface DeploymentRow {
  id: string;
  repo_id: string;
  user_id: string;
  commit_sha: string | null;
  commit_message: string | null;
  status: DeployStatus;
  duration_ms: number | null;
  storage_path: string | null;
  deployed_at: string;
}

export interface LogRow {
  id: string;
  user_id: string;
  repo_id: string;
  deployment_id: string;
  log_text: string;
  created_at: string;
}

export interface CreateDeploymentInput {
  repo_id: string;
  user_id: string;
  commit_sha?: string;
  commit_message?: string;
}

// ── DeploymentRepository ──────────────────────────────────────────────────────

export const DeploymentRepository = {
  /** Create a new deployment row with status = 'pending'. */
  async create(input: CreateDeploymentInput): Promise<DeploymentRow> {
    const rows = await query<DeploymentRow>(
      `INSERT INTO deployment_history (repo_id, user_id, commit_sha, commit_message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, repo_id, user_id, commit_sha, commit_message,
                 status, duration_ms, storage_path, deployed_at`,
      [input.repo_id, input.user_id, input.commit_sha ?? null, input.commit_message ?? null]
    );
    return rows[0];
  },

  /** Transition status to 'building'. */
  async markBuilding(id: string): Promise<void> {
    await query(
      `UPDATE deployment_history SET status = 'building' WHERE id = $1 AND status = 'pending'`,
      [id]
    );
  },

  /**
   * Mark deployment as 'success'.
   * Sets duration_ms and storage_path.
   * ⚠️ The DB trigger (trg_auto_deploy_on_success) atomically swaps
   * repositories.active_deployment_id when this update fires.
   */
  async markSuccess(id: string, durationMs: number, storagePath: string): Promise<void> {
    await query(
      `UPDATE deployment_history
          SET status = 'success', duration_ms = $2, storage_path = $3
        WHERE id = $1`,
      [id, durationMs, storagePath]
    );
  },

  /**
   * Mark deployment as 'failed'.
   * DOES NOT touch repositories.active_deployment_id (DB trigger only fires on 'success').
   */
  async markFailed(id: string, durationMs: number): Promise<void> {
    await query(
      `UPDATE deployment_history
          SET status = 'failed', duration_ms = $2
        WHERE id = $1`,
      [id, durationMs]
    );
  },

  /**
   * Update commit_sha and commit_message after HEAD checkout.
   * Called at Step 3b — before build runs.
   */
  async updateCommitInfo(id: string, sha: string, message: string): Promise<void> {
    await query(
      `UPDATE deployment_history
          SET commit_sha = $2, commit_message = $3
        WHERE id = $1`,
      [id, sha, message]
    );
  },


  /** Fetch all deployments for a repo, newest first. */
  async findAllByRepo(repoId: string): Promise<DeploymentRow[]> {
    return query<DeploymentRow>(
      `SELECT id, repo_id, user_id, commit_sha, commit_message,
              status, duration_ms, storage_path, deployed_at
         FROM deployment_history
        WHERE repo_id = $1
        ORDER BY deployed_at DESC`,
      [repoId]
    );
  },

  /** Fetch a single deployment by ID. */
  async findById(id: string): Promise<DeploymentRow | undefined> {
    const rows = await query<DeploymentRow>(
      `SELECT id, repo_id, user_id, commit_sha, commit_message,
              status, duration_ms, storage_path, deployed_at
         FROM deployment_history
        WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0];
  },

  /**
   * Return an ordered list of successful deployment IDs for a repo.
   * Newest first — used by StorageService.pruneOldDeployments().
   */
  async findSuccessfulDepIds(repoId: string): Promise<string[]> {
    const rows = await query<{ id: string }>(
      `SELECT id FROM deployment_history
        WHERE repo_id = $1 AND status = 'success'
        ORDER BY deployed_at DESC`,
      [repoId]
    );
    return rows.map((r) => r.id);
  },
};


// ── LogRepository ─────────────────────────────────────────────────────────────

export const LogRepository = {
  /** Append a single log line. */
  async append(
    deploymentId: string,
    repoId: string,
    userId: string,
    text: string
  ): Promise<void> {
    await pool.query(
      `INSERT INTO logs (user_id, repo_id, deployment_id, log_text)
       VALUES ($1, $2, $3, $4)`,
      [userId, repoId, deploymentId, text]
    );
  },

  /** Fetch all log lines for a deployment, ordered chronologically. */
  async findByDeployment(deploymentId: string): Promise<LogRow[]> {
    return query<LogRow>(
      `SELECT id, user_id, repo_id, deployment_id, log_text, created_at
         FROM logs
        WHERE deployment_id = $1
        ORDER BY created_at ASC`,
      [deploymentId]
    );
  },
};

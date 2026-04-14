// data access layer for deployments
// manages deployment state transitions and history
// coordinates persistence of build and error logs
// selectively retrieves deployment metadata and status
// handles bulk retrieval and cleanup id lookups

import { query, pool } from '../../lib/db';

// deployment types

export const DEPLOY_STATUS = {
  PENDING:  'pending',
  BUILDING: 'building',
  SUCCESS:  'success',
  FAILED:   'failed',
} as const;

export type DeployStatus = typeof DEPLOY_STATUS[keyof typeof DEPLOY_STATUS];

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

// deploymentrepository implementation

export const DeploymentRepository = {
  // create a new pending deployment row
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

  // mark as building
  async markBuilding(id: string): Promise<void> {
    await query(
      `UPDATE deployment_history SET status = $2 WHERE id = $1 AND status = $3`,
      [id, DEPLOY_STATUS.BUILDING, DEPLOY_STATUS.PENDING]
    );
  },

  // mark as success
  async markSuccess(id: string, durationMs: number, storagePath: string): Promise<void> {
    await query(
      `UPDATE deployment_history
          SET status = $4, duration_ms = $2, storage_path = $3
        WHERE id = $1`,
      [id, durationMs, storagePath, DEPLOY_STATUS.SUCCESS]
    );
  },

  // mark as failed
  async markFailed(id: string, durationMs: number): Promise<void> {
    await query(
      `UPDATE deployment_history
          SET status = $3, duration_ms = $2
        WHERE id = $1`,
      [id, durationMs, DEPLOY_STATUS.FAILED]
    );
  },

  // update commit information
  async updateCommitInfo(id: string, sha: string, message: string): Promise<void> {
    await query(
      `UPDATE deployment_history
          SET commit_sha = $2, commit_message = $3
        WHERE id = $1`,
      [id, sha, message]
    );
  },


  // find all repo deployments
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

  // find by id
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

  // get list of successful deployment ids
  async findSuccessfulDepIds(repoId: string): Promise<string[]> {
    const rows = await query<{ id: string }>(
      `SELECT id FROM deployment_history
        WHERE repo_id = $1 AND status = $2
        ORDER BY deployed_at DESC`,
      [repoId, DEPLOY_STATUS.SUCCESS]
    );
    return rows.map((r) => r.id);
  },
};


// logrepository implementation

export const LogRepository = {
  // append a log line
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

  // find all logs for a deployment
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

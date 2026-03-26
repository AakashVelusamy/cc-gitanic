-- =============================================================
-- Gitanic — PostgreSQL Schema (Supabase)
-- Migration: 001_initial_schema.sql
-- =============================================================

-- Enable required Postgres extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- TABLE: users
-- Stores registered Gitanic users.
-- username: alphanumeric + hyphen only (enforced via CHECK).
-- =============================================================
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Enforce alphanumeric + hyphen only (no leading/trailing hyphen)
    CONSTRAINT chk_username_format
        CHECK (username ~ '^[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9]$'
               OR username ~ '^[a-zA-Z0-9]$')
);

COMMENT ON TABLE  users IS 'Registered Gitanic users.';
COMMENT ON COLUMN users.username  IS 'URL-safe identifier; alphanumeric + hyphen, no leading/trailing hyphen.';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash of the user''s password.';


-- =============================================================
-- TABLE: deployment_history
-- Append-only record of every deployment attempt.
-- Declared BEFORE repositories so the FK can be forward-resolved
-- via a deferred constraint.
-- =============================================================
CREATE TABLE IF NOT EXISTS deployment_history (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id        UUID        NOT NULL,   -- FK added after repositories is created
    user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    commit_sha     TEXT,
    commit_message TEXT,
    status         TEXT        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'building', 'success', 'failed')),
    duration_ms    INTEGER,
    storage_path   TEXT,               -- Supabase Storage path: deployments/{user}/{depId}
    deployed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  deployment_history IS 'Append-only deployment log. Records every pipeline run.';
COMMENT ON COLUMN deployment_history.status       IS 'pending | building | success | failed';
COMMENT ON COLUMN deployment_history.storage_path IS 'Supabase Storage prefix: deployments/{username}/{id}/';
COMMENT ON COLUMN deployment_history.duration_ms  IS 'Wall-clock build duration in milliseconds.';


-- Indexes on deployment_history
CREATE INDEX IF NOT EXISTS idx_deploy_user ON deployment_history (user_id);
CREATE INDEX IF NOT EXISTS idx_deploy_repo ON deployment_history (repo_id);


-- =============================================================
-- TABLE: repositories
-- One repo per (owner_id, name) pair.
-- active_deployment_id → pointer to the LIVE deployment.
-- MUST NOT change on a failed deployment (enforced at service layer).
-- =============================================================
CREATE TABLE IF NOT EXISTS repositories (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 TEXT        NOT NULL,
    owner_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    auto_deploy_enabled  BOOLEAN     NOT NULL DEFAULT false,
    active_deployment_id UUID        REFERENCES deployment_history(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_repo_owner_name UNIQUE (owner_id, name)
);

COMMENT ON TABLE  repositories IS 'Git repositories managed by Gitanic.';
COMMENT ON COLUMN repositories.auto_deploy_enabled  IS 'Set to true after the first successful deployment.';
COMMENT ON COLUMN repositories.active_deployment_id IS 'FK to the currently LIVE deployment. NEVER updated on failure.';


-- =============================================================
-- Add deferred FK: deployment_history.repo_id → repositories(id)
-- =============================================================
ALTER TABLE deployment_history
    ADD CONSTRAINT fk_deploy_repo
    FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE;


-- =============================================================
-- TABLE: logs
-- Append-only streaming log lines for each deployment.
-- =============================================================
CREATE TABLE IF NOT EXISTS logs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users(id)              ON DELETE CASCADE,
    repo_id       UUID        NOT NULL REFERENCES repositories(id)       ON DELETE CASCADE,
    deployment_id UUID        NOT NULL REFERENCES deployment_history(id) ON DELETE CASCADE,
    log_text      TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE logs IS 'Append-only streaming log lines emitted during deployment pipeline steps.';


-- Indexes on logs
CREATE INDEX IF NOT EXISTS idx_logs_user       ON logs (user_id);
CREATE INDEX IF NOT EXISTS idx_logs_repo       ON logs (repo_id);
CREATE INDEX IF NOT EXISTS idx_logs_deployment ON logs (deployment_id);


-- =============================================================
-- Row-Level Security (RLS)
-- Users may only read/write their own data.
-- Service role bypasses RLS for backend operations.
-- =============================================================
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs              ENABLE ROW LEVEL SECURITY;

-- users: each user can see only their own row
CREATE POLICY "users_self_read"   ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_self_update" ON users FOR UPDATE USING (auth.uid() = id);

-- repositories: owner can CRUD their own repos
CREATE POLICY "repos_owner_all"   ON repositories FOR ALL USING (auth.uid() = owner_id);

-- deployment_history: owner can read
CREATE POLICY "deploys_owner_read" ON deployment_history FOR SELECT USING (auth.uid() = user_id);

-- logs: owner can read
CREATE POLICY "logs_owner_read"    ON logs FOR SELECT USING (auth.uid() = user_id);

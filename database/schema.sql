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
    email         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Enforce alphanumeric + hyphen only (no leading/trailing hyphen)
    CONSTRAINT chk_username_format
        CHECK (username ~ '^[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9]$'
               OR username ~ '^[a-zA-Z0-9]$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email) WHERE email IS NOT NULL;

COMMENT ON TABLE  users IS 'Registered Gitanic users.';
COMMENT ON COLUMN users.username  IS 'URL-safe identifier; alphanumeric + hyphen, no leading/trailing hyphen.';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash of the user''s password.';
COMMENT ON COLUMN users.email IS 'Email address for user login and notifications.';


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
-- TABLE: deployment_history
-- Append-only record of every deployment attempt.
-- =============================================================
CREATE TABLE IF NOT EXISTS deployment_history (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id        UUID        NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    commit_sha     TEXT,
    commit_message TEXT,
    status         TEXT        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'building', 'success', 'failed')),
    duration_ms    INTEGER,
    storage_path   TEXT,
    deployed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  deployment_history IS 'Append-only deployment log. Records every pipeline run.';
COMMENT ON COLUMN deployment_history.status       IS 'pending | building | success | failed';
COMMENT ON COLUMN deployment_history.storage_path IS 'Supabase Storage prefix: deployments/{username}/{id}/';
COMMENT ON COLUMN deployment_history.duration_ms  IS 'Wall-clock build duration in milliseconds.';

CREATE INDEX IF NOT EXISTS idx_deploy_user ON deployment_history (user_id);
CREATE INDEX IF NOT EXISTS idx_deploy_repo ON deployment_history (repo_id);


-- =============================================================
-- TABLE: logs
-- Append-only streaming log lines for each deployment.
-- =============================================================
CREATE TABLE IF NOT EXISTS logs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        REFERENCES users(id)              ON DELETE SET NULL,
    repo_id       UUID        NOT NULL REFERENCES repositories(id)       ON DELETE CASCADE,
    deployment_id UUID        REFERENCES deployment_history(id) ON DELETE SET NULL,
    log_text      TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE logs IS 'Append-only streaming log lines emitted during deployment pipeline steps.';

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

CREATE POLICY "users_self_read"   ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_self_update" ON users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "repos_owner_all"   ON repositories FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "deploys_owner_read" ON deployment_history FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "logs_owner_read"    ON logs FOR SELECT USING (auth.uid() = user_id);


-- =============================================================
-- Deployment history immutability trigger
-- =============================================================
CREATE OR REPLACE FUNCTION deployment_history_is_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.repo_id     <> OLD.repo_id
    OR NEW.user_id     <> OLD.user_id
    OR NEW.deployed_at <> OLD.deployed_at
    THEN
        RAISE EXCEPTION
            'deployment_history: immutable fields (repo_id, user_id, deployed_at) cannot be changed.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deployment_history_immutable
BEFORE UPDATE ON deployment_history
FOR EACH ROW
EXECUTE FUNCTION deployment_history_is_immutable();


-- =============================================================
-- Realtime configuration for logs
-- =============================================================
ALTER TABLE logs REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE logs;
    END IF;
END $$;


-- =============================================================
-- Migration: 002_auto_deploy_trigger.sql
-- Purpose: DB trigger that sets active_deployment_id and
--          auto_deploy_enabled when a deployment succeeds.
--          Belt-and-suspenders with the service-layer call.
-- =============================================================

-- Function: runs when deployment_history.status transitions to 'success'
CREATE OR REPLACE FUNCTION auto_deploy_on_success()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only act on the transition TO success (not re-updates of already-successful rows)
    IF NEW.status = 'success' AND OLD.status <> 'success' THEN
        UPDATE repositories
           SET active_deployment_id = NEW.id,
               auto_deploy_enabled  = true
         WHERE id = NEW.repo_id;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger: fires AFTER UPDATE on deployment_history, only when status becomes 'success'
DROP TRIGGER IF EXISTS trg_auto_deploy_on_success ON deployment_history;

CREATE TRIGGER trg_auto_deploy_on_success
AFTER UPDATE ON deployment_history
FOR EACH ROW
WHEN (NEW.status = 'success' AND OLD.status <> 'success')
EXECUTE FUNCTION auto_deploy_on_success();

COMMENT ON FUNCTION auto_deploy_on_success()
    IS 'Atomically sets repositories.active_deployment_id and auto_deploy_enabled=true when a deployment succeeds.';

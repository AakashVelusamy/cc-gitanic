-- database schema definition
-- defines core domain entities for users and projects
-- implements row-level security for multi-tenant isolation
-- coordinates deployment history and realtime log tracking
-- enforces directory-safe identity constraints
-- triggers automated site status synchronization

-- gitanic postgresql schema (supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- registered gitanic users
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    email         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- alphanumeric + hyphen format (no leading/trailing hyphen)
    CONSTRAINT chk_username_format
        CHECK (username ~ '^[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9]$'
               OR username ~ '^[a-zA-Z0-9]$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email) WHERE email IS NOT NULL;

COMMENT ON TABLE  users IS 'Registered Gitanic users.';
COMMENT ON COLUMN users.username  IS 'URL-safe identifier; alphanumeric + hyphen.';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash.';
COMMENT ON COLUMN users.email IS 'User login and notification email.';

-- git repositories
CREATE TABLE IF NOT EXISTS repositories (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 TEXT        NOT NULL,
    owner_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    auto_deploy_enabled  BOOLEAN     NOT NULL DEFAULT false,
    active_deployment_id UUID        REFERENCES deployment_history(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_repo_owner_name UNIQUE (owner_id, name)
);

COMMENT ON TABLE  repositories IS 'Project repositories.';
COMMENT ON COLUMN repositories.auto_deploy_enabled  IS 'True after first successful deployment.';
COMMENT ON COLUMN repositories.active_deployment_id IS 'FK to current LIVE deployment.';

-- deployment history log
DO $$ BEGIN
    CREATE TYPE deployment_status AS ENUM ('pending', 'building', 'success', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- enum constants to avoid literal duplication
CREATE OR REPLACE FUNCTION ds_success() RETURNS deployment_status AS $$ SELECT 'success'::deployment_status $$ LANGUAGE SQL IMMUTABLE;


CREATE TABLE IF NOT EXISTS deployment_history (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id        UUID        NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    commit_sha     TEXT,
    commit_message TEXT,
    status         deployment_status NOT NULL DEFAULT 'pending',
    duration_ms    INTEGER,
    storage_path   TEXT,
    deployed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  deployment_history IS 'Pipeline run records.';
COMMENT ON COLUMN deployment_history.status       IS 'deployment_status enum';
COMMENT ON COLUMN deployment_history.storage_path IS 'Storage prefix: deployments/{username}/{id}/';
COMMENT ON COLUMN deployment_history.duration_ms  IS 'Build duration in ms.';

CREATE INDEX IF NOT EXISTS idx_deploy_user ON deployment_history (user_id);
CREATE INDEX IF NOT EXISTS idx_deploy_repo ON deployment_history (repo_id);

-- deployment log lines
CREATE TABLE IF NOT EXISTS logs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        REFERENCES users(id)              ON DELETE SET NULL,
    repo_id       UUID        NOT NULL REFERENCES repositories(id)       ON DELETE CASCADE,
    deployment_id UUID        REFERENCES deployment_history(id) ON DELETE SET NULL,
    log_text      TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE logs IS 'Pipeline execution logs.';

CREATE INDEX IF NOT EXISTS idx_logs_user       ON logs (user_id);
CREATE INDEX IF NOT EXISTS idx_logs_repo       ON logs (repo_id);
CREATE INDEX IF NOT EXISTS idx_logs_deployment ON logs (deployment_id);

-- row-level security
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs              ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_self_read"   ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_self_update" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "repos_owner_all"   ON repositories FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "deploys_owner_read" ON deployment_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "logs_owner_read"    ON logs FOR SELECT USING (auth.uid() = user_id);

-- deployment history immutability
CREATE OR REPLACE FUNCTION deployment_history_is_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.repo_id     <> OLD.repo_id
    OR NEW.user_id     <> OLD.user_id
    OR NEW.deployed_at <> OLD.deployed_at
    THEN
        RAISE EXCEPTION 'deployment_history: immutable fields cannot be changed.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deployment_history_immutable
BEFORE UPDATE ON deployment_history
FOR EACH ROW
EXECUTE FUNCTION deployment_history_is_immutable();

-- realtime configuration
ALTER TABLE logs REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE logs;
    END IF;
END $$;

-- update repo status on successful deployment
CREATE OR REPLACE FUNCTION auto_deploy_on_success()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = ds_success() AND OLD.status <> ds_success() THEN
        UPDATE repositories
           SET active_deployment_id = NEW.id,
               auto_deploy_enabled  = true
         WHERE id = NEW.repo_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_deploy_on_success
AFTER UPDATE ON deployment_history
FOR EACH ROW
WHEN (NEW.status = ds_success() AND OLD.status <> ds_success())
EXECUTE FUNCTION auto_deploy_on_success();

COMMENT ON FUNCTION auto_deploy_on_success()
    IS 'Sets repository active deployment on success.';

-- extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- users
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email         TEXT UNIQUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_username_format
        CHECK (username ~ '^(?!.*--)[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$'),

    CONSTRAINT chk_email_format
        CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- repositories
CREATE TABLE IF NOT EXISTS repositories (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 TEXT NOT NULL,
    owner_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    auto_deploy_enabled  BOOLEAN NOT NULL DEFAULT false,
    active_deployment_id UUID, -- fk added later
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_repo_owner_name UNIQUE (owner_id, name)
);

-- deployment status enum
DO $$ BEGIN
    CREATE TYPE deployment_status AS ENUM ('pending', 'building', 'success', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- deployment history
CREATE TABLE IF NOT EXISTS deployment_history (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id        UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    commit_sha     TEXT, -- adjusted for pending flow
    commit_message TEXT,
    status         deployment_status NOT NULL DEFAULT 'pending',
    duration_ms    INTEGER CHECK (duration_ms >= 0),
    storage_path   TEXT,
    deployed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- fk fix (after table exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name = 'fk_active_deployment') THEN
        ALTER TABLE repositories
        ADD CONSTRAINT fk_active_deployment
        FOREIGN KEY (active_deployment_id)
        REFERENCES deployment_history(id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- logs
CREATE TABLE IF NOT EXISTS logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    repo_id       UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    deployment_id UUID REFERENCES deployment_history(id) ON DELETE CASCADE,
    log_text      TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- indexing (performance)
CREATE INDEX IF NOT EXISTS idx_deploy_user   ON deployment_history (user_id);
CREATE INDEX IF NOT EXISTS idx_deploy_repo   ON deployment_history (repo_id);
CREATE INDEX IF NOT EXISTS idx_logs_user     ON logs (user_id);
CREATE INDEX IF NOT EXISTS idx_logs_repo     ON logs (repo_id);
CREATE INDEX IF NOT EXISTS idx_logs_deploy_ts ON logs (deployment_id, created_at);

-- row level security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- policies
DO $$ 
BEGIN
    -- users
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_self_select') THEN
        CREATE POLICY users_self_select ON users FOR SELECT USING (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_self_update') THEN
        CREATE POLICY users_self_update ON users FOR UPDATE USING (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_self_insert') THEN
        CREATE POLICY users_self_insert ON users FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;

    -- repositories
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'repos_owner_all') THEN
        CREATE POLICY repos_owner_all ON repositories FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
    END IF;

    -- deployments
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deploy_owner_select') THEN
        CREATE POLICY deploy_owner_select ON deployment_history FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deploy_owner_insert') THEN
        CREATE POLICY deploy_owner_insert ON deployment_history FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deploy_owner_update') THEN
        CREATE POLICY deploy_owner_update ON deployment_history FOR UPDATE USING (auth.uid() = user_id);
    END IF;

    -- logs
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'logs_owner_select') THEN
        CREATE POLICY logs_owner_select ON logs FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'logs_owner_insert') THEN
        CREATE POLICY logs_owner_insert ON logs FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- immutability enforcement (dropped for flexibility as per request)
DROP TRIGGER IF EXISTS trg_deployment_immutable ON deployment_history;
DROP FUNCTION IF EXISTS enforce_deployment_immutability();

-- status transition control
CREATE OR REPLACE FUNCTION validate_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    enums deployment_status[] := enum_range(NULL::deployment_status);
    s_pending CONSTANT deployment_status := enums[1];
    s_building CONSTANT deployment_status := enums[2];
    s_success CONSTANT deployment_status := enums[3];
    s_failed CONSTANT deployment_status := enums[4];
BEGIN
    -- if status is not changing, it's not a transition; allow all such updates
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- restrict transitions from 'pending'
    IF OLD.status = s_pending AND NEW.status NOT IN (s_building, s_failed) THEN
        RAISE EXCEPTION 'Invalid transition';
    END IF;

    -- restrict transitions from 'building'
    IF OLD.status = s_building AND NEW.status NOT IN (s_success, s_failed) THEN
        RAISE EXCEPTION 'Invalid transition';
    END IF;

    -- allow other transitions (like re-running from success or failed)
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_status_transition ON deployment_history;
CREATE TRIGGER trg_status_transition
BEFORE UPDATE ON deployment_history
FOR EACH ROW EXECUTE FUNCTION validate_status_transition();

-- auto deploy trigger
CREATE OR REPLACE FUNCTION auto_deploy_on_success()
RETURNS TRIGGER AS $$
DECLARE
    s_success CONSTANT deployment_status := (enum_range(NULL::deployment_status))[3];
BEGIN
    IF NEW.status = s_success AND OLD.status <> s_success THEN
        UPDATE repositories
        SET active_deployment_id = NEW.id,
            auto_deploy_enabled  = true
        WHERE id = NEW.repo_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_deploy ON deployment_history;
CREATE TRIGGER trg_auto_deploy
AFTER UPDATE ON deployment_history
FOR EACH ROW
EXECUTE FUNCTION auto_deploy_on_success();

-- realtime optimization
ALTER TABLE logs REPLICA IDENTITY USING INDEX logs_pkey;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        -- Add to publication if not already there
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'logs') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE logs;
        END IF;
    END IF;
END $$;
-- =============================================================
-- Gitanic — Functions & Triggers
-- Migration: 002_functions_triggers.sql
-- =============================================================

-- =============================================================
-- FUNCTION: prevent_active_deployment_change_on_failure
-- Enforces the core invariant:
--   active_deployment_id MUST NOT change when a deployment fails.
-- Called by trg_guard_active_deployment_pointer.
-- =============================================================
CREATE OR REPLACE FUNCTION prevent_active_deployment_change_on_failure()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    dep_status TEXT;
BEGIN
    -- Only intercept when active_deployment_id is being changed
    IF NEW.active_deployment_id IS DISTINCT FROM OLD.active_deployment_id
       AND NEW.active_deployment_id IS NOT NULL
    THEN
        SELECT status INTO dep_status
        FROM deployment_history
        WHERE id = NEW.active_deployment_id;

        IF dep_status <> 'success' THEN
            RAISE EXCEPTION
                'Cannot set active_deployment_id to deployment % with status "%". Only "success" deployments may be active.',
                NEW.active_deployment_id,
                dep_status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_active_deployment_pointer
BEFORE UPDATE OF active_deployment_id ON repositories
FOR EACH ROW
EXECUTE FUNCTION prevent_active_deployment_change_on_failure();


-- =============================================================
-- FUNCTION: set_auto_deploy_on_first_success
-- After the first successful deployment, flips
-- repositories.auto_deploy_enabled = true.
-- =============================================================
CREATE OR REPLACE FUNCTION set_auto_deploy_on_first_success()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only act on transitions TO 'success'
    IF NEW.status = 'success' AND OLD.status <> 'success' THEN
        UPDATE repositories
        SET
            active_deployment_id = NEW.id,
            auto_deploy_enabled  = true
        WHERE id = NEW.repo_id
          AND (active_deployment_id IS NULL OR NOT auto_deploy_enabled);

        -- For subsequent deploys, just swap the active pointer
        UPDATE repositories
        SET active_deployment_id = NEW.id
        WHERE id = NEW.repo_id
          AND auto_deploy_enabled = true
          AND active_deployment_id IS DISTINCT FROM NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_deploy_on_success
AFTER UPDATE OF status ON deployment_history
FOR EACH ROW
EXECUTE FUNCTION set_auto_deploy_on_first_success();


-- =============================================================
-- FUNCTION: deployment_history_is_immutable
-- Ensures deployment_history rows are append-only
-- (no column may be changed except status + duration_ms + storage_path
--  which are written once by the pipeline).
-- =============================================================
CREATE OR REPLACE FUNCTION deployment_history_is_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Immutable fields
    IF NEW.repo_id        <> OLD.repo_id
    OR NEW.user_id        <> OLD.user_id
    OR NEW.commit_sha     IS DISTINCT FROM OLD.commit_sha
    OR NEW.commit_message IS DISTINCT FROM OLD.commit_message
    OR NEW.deployed_at    <> OLD.deployed_at
    THEN
        RAISE EXCEPTION 'deployment_history rows are append-only. Immutable fields cannot be changed.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deployment_history_immutable
BEFORE UPDATE ON deployment_history
FOR EACH ROW
EXECUTE FUNCTION deployment_history_is_immutable();


-- =============================================================
-- FUNCTION: logs_are_immutable
-- Ensures log rows can never be updated or deleted.
-- =============================================================
CREATE OR REPLACE FUNCTION logs_are_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'logs are append-only and cannot be modified or deleted.';
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_logs_no_update
BEFORE UPDATE ON logs
FOR EACH ROW
EXECUTE FUNCTION logs_are_immutable();

CREATE TRIGGER trg_logs_no_delete
BEFORE DELETE ON logs
FOR EACH ROW
EXECUTE FUNCTION logs_are_immutable();

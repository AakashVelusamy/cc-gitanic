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

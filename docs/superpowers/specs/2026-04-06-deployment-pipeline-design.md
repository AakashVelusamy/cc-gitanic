# Deployment Pipeline — Design Spec

**Date:** 2026-04-06
**Status:** Approved

## Goal

Wire up the complete deployment pipeline so that:
1. Clicking **Deploy** in the UI builds and deploys a static site
2. The deployed site is accessible at `http://localhost:4000/{username}/`
3. After first successful deploy, every `git push` to `main` auto-deploys
4. Only one active deployment per user (one subdomain = one live site)

## Architecture Summary

The backend pipeline code (10 steps, FIFO queue, Strategy Pattern, Observer Pattern) is already fully implemented. Three fixes are needed to make it operational, plus a new static file server.

## Fix 1: Wire `setActiveDeployment()` in Pipeline Step 7

**File:** `backend/src/modules/deployment/deployment.service.ts`

The pipeline calls `markSuccess()` at step 7 but never updates `repositories.active_deployment_id` or `auto_deploy_enabled`. The code relies on a DB trigger (`trg_auto_deploy_on_success`) that does not exist.

**Fix:** After `markSuccess()`, call `RepoRepository.setActiveDeployment(repoId, deploymentId)`. This function already exists in `repo.repository.ts` and atomically sets both `active_deployment_id` and `auto_deploy_enabled = true`.

```typescript
// Step 7 — after markSuccess:
await RepoRepository.setActiveDeployment(repoId, deploymentId);
```

This ensures:
- `active_deployment_id` points to the new deployment
- `auto_deploy_enabled = true` enables subsequent hook-triggered deploys
- Failed deployments never reach this code path (catch block runs instead)

## Fix 2: Database Migration for Auto-Deploy Trigger (Belt-and-Suspenders)

**File:** `database/migrations/002_auto_deploy_trigger.sql`

Optional safety net: a DB trigger that mirrors the service-layer logic. If the service layer call fails or is bypassed, the trigger catches it.

```sql
CREATE OR REPLACE FUNCTION auto_deploy_on_success()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'success' AND OLD.status <> 'success' THEN
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
WHEN (NEW.status = 'success' AND OLD.status <> 'success')
EXECUTE FUNCTION auto_deploy_on_success();
```

Note: The immutability trigger in migration 001 already only checks `repo_id`, `user_id`, `deployed_at` — it does NOT block `commit_sha`/`commit_message` updates. No fix needed there.

## Fix 3: New Static Site Server (Port 4000)

**File:** `backend/src/serve.ts`

A standalone Express server that serves deployed static sites locally. In production, this role is handled by Vercel Edge Middleware + Supabase Storage. Locally, this server replicates that behavior.

**Pattern:** Proxy/Gateway

**Request flow:**
```
GET http://localhost:4000/{username}/
  → Look up user's active_deployment_id from DB
  → Proxy to Supabase Storage:
      {SUPABASE_URL}/storage/v1/object/public/deployments/{username}/{deploymentId}/{path}
  → SPA fallback: if path not found, serve index.html
```

**Implementation details:**
- Standalone entry point (separate from API server)
- Uses the same `db.ts` pool for lookups
- Caches active_deployment_id per username (in-memory Map, 60s TTL) to avoid DB hits on every asset request
- Proxies responses (status, headers, body) transparently from Supabase Storage
- Returns 404 page if no active deployment exists for the username
- `npm run serve` script to start it

**Why separate process:**
- Clean separation of concerns (API vs file serving)
- Mirrors production architecture (Railway API vs Vercel Edge)
- Can be independently scaled/restarted
- No risk of static file requests interfering with API routes

## Frontend Changes

**File:** `frontend/src/pages/repos/[name].tsx`

Add a "View Live Site" button/link when `active_deployment_id` is not null. Links to `http://localhost:4000/{username}/`. The deploy button behavior stays the same (POST → redirect to repo page).

**API response change:** The `GET /api/repos/:repoName` endpoint already returns `active_deployment_id` in the repo data. No backend API changes needed.

## Patterns Used

| Pattern | Where | Purpose |
|---------|-------|---------|
| Strategy | `strategies/index.ts` | Vite/React/Static build selection |
| Factory | `repo.service.ts` | Atomic bare repo creation + hook install |
| Observer | `deployEvents.ts` + `logSubscribers.ts` | Event-driven logging + Realtime broadcast |
| Singleton | `deployQueue.ts`, `db.ts`, `supabase.ts` | One instance per process |
| FIFO Queue | `deployQueue.ts` | One build at a time |
| Repository | `*.repository.ts` | SQL isolation from business logic |
| MVC | Controllers + Services + Pages | HTTP → business logic → data |
| Proxy/Gateway | `serve.ts` (NEW) | Local static file serving via Supabase Storage proxy |

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `backend/src/modules/deployment/deployment.service.ts` | EDIT | Add `setActiveDeployment()` call after `markSuccess()` |
| `backend/src/serve.ts` | NEW | Static site server on port 4000 |
| `backend/package.json` | EDIT | Add `serve` npm script |
| `database/migrations/002_auto_deploy_trigger.sql` | NEW | DB trigger for auto-deploy activation |
| `frontend/src/pages/repos/[name].tsx` | EDIT | Add "View Live Site" link |

## Success Criteria

1. Click Deploy on a repo with an `index.html` → pipeline runs → site accessible at `localhost:4000/{username}/`
2. Push a change to `main` branch → auto-deploy triggers → site updates automatically
3. Only the latest successful deployment is live (atomic pointer swap)
4. Failed deployments never break the live site
5. Build strategies correctly detect and build Vite/React/Static projects

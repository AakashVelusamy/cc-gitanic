# Deployment Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing deployment pipeline so Deploy button builds + serves static sites at `localhost:4000/{username}/`, and subsequent pushes to main auto-deploy.

**Architecture:** The 10-step pipeline (queue, strategies, observer, storage) is already implemented. We fix three wiring gaps (setActiveDeployment call, DB trigger, serve.ts) and add a "View Live Site" link to the frontend.

**Tech Stack:** Express, pg, Supabase Storage SDK, TypeScript, Next.js (frontend)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/modules/deployment/deployment.service.ts` | EDIT | Add `setActiveDeployment()` call after `markSuccess()` |
| `database/migrations/002_auto_deploy_trigger.sql` | CREATE | DB trigger: on deployment success, set active_deployment_id + auto_deploy_enabled |
| `backend/src/serve.ts` | CREATE | Standalone Express server (port 4000) that proxies deployed sites from Supabase Storage |
| `backend/package.json` | EDIT | Add `serve` npm script |
| `backend/.env.example` | EDIT | Add `SERVE_PORT` variable |
| `frontend/src/pages/repos/[name].tsx` | EDIT | Add "View Live Site" button when active_deployment_id exists |

---

### Task 1: Fix Pipeline Step 7 — Wire `setActiveDeployment()`

**Files:**
- Modify: `backend/src/modules/deployment/deployment.service.ts:178-184`

The pipeline calls `markSuccess()` but never updates `repositories.active_deployment_id` or `auto_deploy_enabled`. The existing `RepoRepository.setActiveDeployment()` does exactly this but is never called.

- [ ] **Step 1: Add the setActiveDeployment call after markSuccess**

In `backend/src/modules/deployment/deployment.service.ts`, after line 181 (`await DeploymentRepository.markSuccess(...)`) and before line 183 (`await log('[history]...')`), add:

```typescript
    // Atomically swap the live-site pointer + enable auto-deploy for future pushes
    await RepoRepository.setActiveDeployment(repoId, deploymentId);
    await log(`[db] active_deployment_id → ${deploymentId.slice(0, 8)}, auto_deploy_enabled → true`);
```

The `RepoRepository` import already exists at line 27:
```typescript
import { RepoRepository } from '../repos/repo.repository';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd backend && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
cd backend
git add src/modules/deployment/deployment.service.ts
git commit -m "fix: wire setActiveDeployment() call in pipeline step 7

After markSuccess(), atomically set active_deployment_id and
auto_deploy_enabled=true on the repository row. Previously the
code relied on a DB trigger that did not exist."
```

---

### Task 2: Create DB Migration — Auto-Deploy Trigger

**Files:**
- Create: `database/migrations/002_auto_deploy_trigger.sql`

Belt-and-suspenders safety net. The service layer (Task 1) handles this, but the trigger provides defense-in-depth.

- [ ] **Step 1: Write the migration file**

Create `database/migrations/002_auto_deploy_trigger.sql`:

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add database/migrations/002_auto_deploy_trigger.sql
git commit -m "feat: add auto_deploy_on_success DB trigger (migration 002)

Defense-in-depth trigger that sets active_deployment_id and
auto_deploy_enabled=true when deployment_history.status
transitions to 'success'. Mirrors the service-layer call."
```

**Note for applying:** Run this SQL in the Supabase SQL Editor or via `psql` against the project database. The service-layer fix in Task 1 works independently — the trigger is a safety net.

---

### Task 3: Create Static Site Server (`serve.ts`)

**Files:**
- Create: `backend/src/serve.ts`
- Modify: `backend/package.json`
- Modify: `backend/.env.example`

Standalone Express server on port 4000 that proxies deployed static files from Supabase Storage. Pattern: Proxy/Gateway (mirrors Vercel Edge Middleware in production).

- [ ] **Step 1: Add SERVE_PORT to .env.example**

Append to `backend/.env.example`:

```bash

# ── Static Site Server ──────────────────────────────────────
SERVE_PORT=4000
```

- [ ] **Step 2: Write serve.ts**

Create `backend/src/serve.ts`:

```typescript
/**
 * serve.ts — Static Site Server (Proxy/Gateway Pattern)
 *
 * Standalone Express server that serves deployed static sites locally.
 * In production, Vercel Edge Middleware handles this role.
 * Locally, this server replicates that behavior by proxying to Supabase Storage.
 *
 * Request flow:
 *   GET http://localhost:4000/{username}/{path}
 *     → Look up user's active_deployment_id (cached 60s)
 *     → Proxy to Supabase Storage public URL
 *     → SPA fallback: serve index.html for non-file paths
 *
 * Architecture: Proxy/Gateway Pattern + Singleton (db pool)
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import { query } from './lib/db';

// ── Configuration ────────────────────────────────────────────────────────────

const PORT         = parseInt(process.env.SERVE_PORT ?? '4000', 10);
const SUPABASE_URL = process.env.SUPABASE_URL!;
const BUCKET       = 'deployments';

if (!SUPABASE_URL) {
  console.error('[serve] SUPABASE_URL is required');
  process.exit(1);
}

// ── In-memory cache (username → { deploymentId, expiresAt }) ─────────────────

interface CacheEntry {
  deploymentId: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds
const cache = new Map<string, CacheEntry>();

async function resolveDeployment(username: string): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(username);
  if (cached && cached.expiresAt > now) {
    return cached.deploymentId;
  }

  const rows = await query<{ active_deployment_id: string }>(
    `SELECT r.active_deployment_id
       FROM repositories r
       JOIN users u ON u.id = r.owner_id
      WHERE u.username = $1
        AND r.active_deployment_id IS NOT NULL
      ORDER BY r.created_at DESC
      LIMIT 1`,
    [username]
  );

  if (rows.length === 0) return null;

  const deploymentId = rows[0].active_deployment_id;
  cache.set(username, { deploymentId, expiresAt: now + CACHE_TTL_MS });
  return deploymentId;
}

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gitanic-serve', ts: new Date().toISOString() });
});

// Static site proxy: /{username}/{path?}
app.get('/:username/*', handleSiteRequest);
app.get('/:username', handleSiteRequest);

async function handleSiteRequest(req: Request, res: Response): Promise<void> {
  const username = req.params['username'];

  // Skip favicon and other non-user requests
  if (username === 'favicon.ico' || username === 'health') {
    res.status(404).end();
    return;
  }

  try {
    const deploymentId = await resolveDeployment(username);

    if (!deploymentId) {
      res.status(404).send(notFoundPage(username));
      return;
    }

    // Build the file path within the deployment
    // req.params[0] is the wildcard match (everything after /{username}/)
    let filePath = req.params[0] || 'index.html';

    // If path doesn't look like a file (no extension), default to index.html (SPA fallback)
    if (!filePath.includes('.')) {
      filePath = filePath.endsWith('/') ? filePath + 'index.html' : 'index.html';
    }

    // Build Supabase Storage public URL
    const storageUrl =
      `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${username}/${deploymentId}/${filePath}`;

    // Proxy the response from Supabase Storage
    const upstream = await fetch(storageUrl);

    if (!upstream.ok) {
      // If the specific file wasn't found, try SPA fallback (index.html)
      if (upstream.status === 404 || upstream.status === 400) {
        const fallbackUrl =
          `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${username}/${deploymentId}/index.html`;
        const fallback = await fetch(fallbackUrl);

        if (fallback.ok) {
          res.status(200);
          copyHeaders(fallback, res);
          res.send(Buffer.from(await fallback.arrayBuffer()));
          return;
        }
      }

      res.status(upstream.status).send('Not found');
      return;
    }

    res.status(upstream.status);
    copyHeaders(upstream, res);
    res.send(Buffer.from(await upstream.arrayBuffer()));

  } catch (err) {
    console.error(`[serve] Error serving ${username}: ${String(err)}`);
    res.status(500).send('Internal server error');
  }
}

/** Forward content-type and cache-control headers from upstream response. */
function copyHeaders(upstream: globalThis.Response, res: Response): void {
  const ct = upstream.headers.get('content-type');
  if (ct) res.set('Content-Type', ct);

  const cc = upstream.headers.get('cache-control');
  if (cc) res.set('Cache-Control', cc);

  // Allow cross-origin requests for fonts/assets
  res.set('Access-Control-Allow-Origin', '*');
}

/** Simple 404 HTML page. */
function notFoundPage(username: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Not Found — Gitanic</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0e1a; color: #e0e6f0; font-family: system-ui, sans-serif;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { text-align: center; max-width: 420px; padding: 3rem 2rem;
            background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
            border-radius: 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.75rem; }
    p { color: #8892a8; font-size: 0.95rem; line-height: 1.5; }
    code { color: #00f0ff; background: rgba(0,240,255,0.08); padding: 0.15em 0.4em;
           border-radius: 0.25em; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="card">
    <h1>No deployment found</h1>
    <p>User <code>${username}</code> has no active deployment.<br/>
    Push code and click <strong>Deploy</strong> in the Gitanic dashboard to get started.</p>
  </div>
</body>
</html>`;
}

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[serve] Gitanic static site server listening on http://localhost:${PORT}`);
  console.log(`[serve] Visit http://localhost:${PORT}/{username}/ to view deployed sites`);
});
```

- [ ] **Step 3: Add npm script to package.json**

In `backend/package.json`, add to the `"scripts"` object:

```json
"serve": "ts-node-dev --respawn --transpile-only src/serve.ts"
```

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
cd backend && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 5: Manual smoke test**

Start the serve server:
```bash
cd backend && npm run serve
```

In another terminal, hit the health check:
```bash
curl http://localhost:4000/health
```
Expected: `{"status":"ok","service":"gitanic-serve",...}`

Hit a nonexistent user:
```bash
curl http://localhost:4000/nobody/
```
Expected: 404 HTML page with "No deployment found" and "nobody" displayed.

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/serve.ts package.json .env.example
git commit -m "feat: add static site server on port 4000 (Proxy/Gateway)

Standalone Express server that proxies deployed static files from
Supabase Storage. Caches active_deployment_id per username (60s TTL).
SPA fallback to index.html for client-side routing.
Mirrors Vercel Edge Middleware behavior for local development."
```

---

### Task 4: Frontend — Add "View Live Site" Link

**Files:**
- Modify: `frontend/src/pages/repos/[name].tsx`

Add a "View Live Site" button next to Deploy when the repo has an active deployment (`active_deployment_id !== null`).

- [ ] **Step 1: Add ExternalLink import and live site URL constant**

In `frontend/src/pages/repos/[name].tsx`, update the lucide-react import (line 8) to include `ExternalLink`:

```typescript
import { BookOpen, Activity, GitBranch, ShieldAlert, Terminal, Trash2, Rocket, Copy, Check, Lock, ExternalLink } from 'lucide-react';
```

Add `active_deployment_id` to the `RepoData` interface (after line 15, `created_at`):

```typescript
  active_deployment_id: string | null;
```

- [ ] **Step 2: Add the View Live Site button**

In the button row (around line 191-203), add the "View Live Site" link BEFORE the Deploy button. Replace the `<div className="flex flex-row items-center gap-3 shrink-0">` block:

```tsx
              <div className="flex flex-row items-center gap-3 shrink-0">
                {repo.active_deployment_id && (
                  <a
                    href={`http://localhost:4000/${username}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-accent/10 text-accent hover:bg-accent hover:text-accent-foreground transition-colors px-4 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-accent/20 hover:border-accent shadow-lg h-[42px] w-full sm:w-auto"
                  >
                    <ExternalLink size={16} />
                    Live Site
                  </a>
                )}
                <button onClick={handleDeploy} disabled={deploying} className="btn-primary flex items-center justify-center gap-2 shadow-lg shadow-primary/20 h-[42px] px-4 w-full sm:w-auto">
                  {deploying ? <div className="w-4 h-4 border-2 border-background/20 border-t-background rounded-full animate-spin"></div> : <Rocket size={16} />}
                  Deploy
                </button>
                <button 
                  onClick={handleDelete} 
                  className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors px-4 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-destructive/20 hover:border-destructive shadow-lg h-[42px] w-full sm:w-auto"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
```

- [ ] **Step 3: Verify frontend builds**

Run:
```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/pages/repos/\\[name\\].tsx
git commit -m "feat: add View Live Site button on repo page

Shows a styled link to localhost:4000/{username}/ when the repo
has an active deployment (active_deployment_id is not null).
Opens in new tab."
```

---

### Task 5: End-to-End Smoke Test

No code changes — this task validates the full pipeline works together.

- [ ] **Step 1: Ensure backend is running**

```bash
cd backend && npm run dev
```

- [ ] **Step 2: Start the static site server**

In a separate terminal:
```bash
cd backend && npm run serve
```

- [ ] **Step 3: Ensure frontend is running**

In a separate terminal:
```bash
cd frontend && npm run dev
```

- [ ] **Step 4: Test the deploy flow**

1. Open `http://localhost:3001` in the browser
2. Log in and navigate to a repo that has an `index.html` at its root
3. Click the **Deploy** button
4. Watch the backend terminal for pipeline logs (10 steps)
5. After success, refresh the repo page — the **View Live Site** button should appear
6. Click **View Live Site** — it should open `http://localhost:4000/{username}/` and show the deployed site

- [ ] **Step 5: Test auto-deploy**

1. From a local clone of the repo, make a change to `index.html`
2. Commit and push to `main`:
   ```bash
   git add . && git commit -m "test auto-deploy" && git push origin main
   ```
3. Watch the backend terminal — the post-receive hook should trigger `/internal/deploy`
4. The pipeline should run automatically
5. Refresh `http://localhost:4000/{username}/` — the change should appear (after ~60s cache TTL or restart serve)

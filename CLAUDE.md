# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Gitanic** is a distributed, cloud-native Git hosting and static deployment platform (university Cloud Computing project). Three specialist free-tier services own strictly separated concerns:

| Service | Responsibility |
|---------|---------------|
| **Vercel** | Next.js frontend, wildcard `*.gitanic.com` subdomain routing, Edge Middleware |
| **Railway** | Express API, Git HTTP server (`git-http-backend` CGI), deployment build pipeline, bare repos on persistent volume |
| **Supabase** | PostgreSQL database, Storage (static build artefacts), Realtime log streaming |

The backend is a **Modular Monolith** — one Node.js/Express process with well-separated internal modules. Microservices were explicitly rejected (2–5 users, single developer).

## Commands

### Backend
```bash
cd backend
npm run dev       # Dev server with hot reload (ts-node-dev)
npm run build     # Compile TypeScript → /dist
npm start         # Run compiled dist/index.js
```

### Frontend
```bash
cd frontend
npm run dev       # Dev server on port 3001
npm run build     # Next.js production build
npm run lint      # ESLint
```

### JavaFX Client
```bash
cd javafx
mvn clean install   # Build
mvn javafx:run      # Run desktop client
```

### Database
Apply migrations in order via Supabase SQL editor or psql:
```
database/migrations/001_initial_schema.sql
database/migrations/002_functions_triggers.sql
database/migrations/003_realtime_setup.sql
database/migrations/004_user_profile_fields.sql
database/migrations/005_add_email.sql
database/migrations/006_fix_immutability_trigger.sql
```

**Migration 006 (Critical):** Fixes the `deployment_history_is_immutable()` trigger function. The original trigger was blocking `commit_sha` and `commit_message` updates, which are intentionally written in two phases:
- Phase A (step 1): `INSERT` with NULL values
- Phase B (step 3b): `UPDATE` with actual values from git HEAD

The fix removes these two fields from the immutability check, keeping only true identity fields (repo_id, user_id, deployed_at). Without this fix, all deployments fail at step 3b with "immutable fields cannot be changed".

> **Note:** The frontend uses **Next.js 16.2.1** with breaking API changes. Read `frontend/AGENTS.md` and check `node_modules/next/dist/docs/` before writing any Next.js code.

## Architecture

### Backend Modules (`backend/src/`)

Controller → Service → Repository pattern throughout. Never put SQL in controllers; never put HTTP logic in services.

```
src/
├── index.ts                        # Express app entry point + startup bootstrap
├── lib/
│   ├── db.ts                       # Singleton pg.Pool
│   ├── supabase.ts                 # Singleton Supabase client
│   ├── logger.ts                   # Singleton Logger (Observer subscriber)
│   └── deployQueue.ts              # FIFO deploy queue
├── middleware/
│   ├── authMiddleware.ts           # JWT Bearer validation
│   ├── gitAuthMiddleware.ts        # HTTP Basic auth for Git HTTP
│   ├── requestLogger.ts
│   └── errorHandler.ts
├── modules/
│   ├── auth/                       # auth.controller / .service / .repository
│   ├── repos/                      # repo.controller / .service / .repository / .factory / .git.service
│   │   └── repo.git.service.ts     # Read git tree/blob/commits from bare repos
│   ├── deploy/
│   │   ├── deploy.controller / .service / .repository / .queue
│   │   └── strategies/
│   │       ├── deploy.strategy.ts  # Interface: detect() + build()
│   │       ├── static.strategy.ts  # StaticDeployStrategy
│   │       └── react.strategy.ts   # ReactDeployStrategy
│   ├── git/
│   │   ├── git.handler.ts          # git-http-backend CGI proxy
│   │   └── git.service.ts          # child_process wrapper
│   └── logs/
│       ├── log.service.ts          # Observer subscriber → writes to Supabase LOGS
│       └── log.repository.ts
└── routes/
    ├── api.routes.ts               # /api/v1/* REST routes
    └── internal.routes.ts          # /internal/* hook endpoints
```

#### Repository Bootstrap (`reconcileReposOnDisk`)

On server startup, the backend optionally reconciles the database with the filesystem:

```typescript
export async function reconcileReposOnDisk(): Promise<void>
```

**Purpose:** In local development, seed SQL may insert repository rows directly into the DB without running `RepositoryFactory.init()`. This bootstrap function detects missing bare repos and initializes them atomically.

**Behavior:**
- Reads all repos from DB with their owner usernames
- For each repo: checks if the bare repo exists on disk at `{REPOS_ROOT}/{username}/{name}.git`
- If missing: calls `RepoFactory.init()` to create it
- Logs results: scanned count, created count, and any failures

**Control:** Enabled via `SYNC_REPOS_ON_STARTUP` env var (defaults to `true` in dev, `false` in production).

### Design Patterns

| Pattern | Location | Purpose |
|---------|----------|---------|
| **MVC** | Entire web layer | Next.js pages = View; Express controllers = Controller; Services = Model logic |
| **Repository** | `*.repository.ts` | All SQL isolated — services never write raw queries |
| **Strategy** | `deploy/strategies/` | Swap build algorithm at runtime. `detect()` + `build()` interface. Priority: Vite > React > Static. Adding new frameworks = new strategy class only |
| **Factory** | `repos/repo.factory.ts` | `RepositoryFactory.create(username, repoName)` runs `git init --bare` + writes post-receive hook atomically |
| **Observer** | `deploy.service.ts` + `log.service.ts` | EventEmitter emits `deploy:start/step/success/failed`; LogService subscribes and writes to LOGS table |
| **Singleton** | `lib/db.ts`, `lib/supabase.ts`, `lib/logger.ts` | One connection pool per process |
| **Queue (FIFO)** | `deployQueue.ts` | One build at a time — prevents Railway free-tier compute exhaustion |

### Deployment Pipeline (10 Steps)

1. **Enqueue** — `DeployService.enqueue()` creates pending DB row, pushes to FIFO queue. Only one build runs at a time.
2. **Validate** — check `repositories.auto_deploy_enabled = true` (if hook-triggered). Manual API calls always allowed. Check repo exists and is owned by user.
3. **Checkout** — `git --work-tree=/tmp/build/{user}/{depId} --git-dir=/repos/{user}/{repo}.git checkout HEAD --` (reads current branch tip, typically main)
3b. **History** — read commit SHA + message via `git rev-parse HEAD` and `git log -1 --pretty=%s`, persist to deployment row
4. **Detect** — Strategy pattern: `ViteStrategy` checks `vite.config.*`; `ReactStrategy` checks `react-scripts` in `package.json`; `StaticStrategy` checks `index.html`. Precedence: Vite > React > Static (first match wins). Unsupported projects (Next.js, Nuxt, Remix, backend servers) get explicit rejection messages.
5. **Build** — sandboxed `child_process.execFileSync` with:
   - Restricted `$PATH`: `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin` (no access to arbitrary binaries)
   - `$HOME=/tmp` (no access to user home directory or secrets)
   - `NODE_ENV=production`, `CI=true`
   - Timeouts: `npm ci` 120s, framework build 180s
   - No `$DATABASE_URL`, `$JWT_SECRET`, `$SUPABASE_SERVICE_ROLE_KEY` (secrets not in env during build)
6. **Upload** — files uploaded individually to `deployments/{username}/{dep_id}/` in Supabase Storage with parallel batches (5 concurrent)
7. **Atomic DB update** — `UPDATE repositories SET active_deployment_id = $newId`. Only runs after successful upload. Failure leaves pointer unchanged → live site never broken.
8. **Storage Pruning** — after successful upload, keep last 3–5 successful deployments in Storage, delete older deployment folders (history rows kept forever)
9. **Cleanup** — `rm -rf /tmp/build/{user}/{depId}`. Always runs, even on failure (finally block).
10. **Emit** — `deploy:success` or `deploy:failed` event. LogService writes final log entry. Frontend receives Supabase Realtime broadcast update.

**Failure Handling (Invariant):** Any error at any step immediately:
- Calls `DeploymentRepository.markFailed()` (does NOT update `active_deployment_id`)
- Calls `StorageService.deleteDeployment()` to remove partial uploads (prevents orphaned objects)
- Emits `deploy:failed` event
- Re-throws exception to deployQueue (logs and marks job failed)
- The live site is never exposed to a failed deployment — `active_deployment_id` is immutable after success.

### Deployment Trigger Logic (Two-Phase Model)

- **Phase 1 (first deploy):** User clicks Deploy button in web UI. Pipeline runs. On **success only**, DB trigger `trg_auto_deploy_on_success` atomically sets `auto_deploy_enabled = true`. If first deploy fails, the flag stays false.
- **Phase 2 (auto-deploy):** Subsequent `git push` to `main` branch triggers via post-receive hook **only if** `auto_deploy_enabled = true`. Push to any other branch is silently ignored (no error, no deployment).
- **Manual re-deploy:** Deploy button always works regardless of `auto_deploy_enabled` flag.

**Branch Policy:** Only `main` branch triggers auto-deploy. Master, develop, feature branches, etc. are ignored entirely. This is enforced:
- In the thin post-receive hook (`repo.service.ts` buildPostReceiveHook): `if [ "$branch" = "main" ]`
- In the service layer (`internal.ts` POST /internal/deploy): `if (branch !== 'main')` → 200 OK ignored response

The post-receive hook is deliberately thin — it reads stdin, detects `main` only, and calls `POST /internal/deploy`. All business logic (flag validation, access control, deployment queueing) lives in the service layer, not the hook.

### Git Storage & File Browsing

**Storage:**
- Bare repos stored at `/repos/{username}/{repo}.git` on Railway's **persistent volume** (POSIX filesystem required for Git pack operations — cannot use object storage)
- Build workspaces at `/tmp/build/{username}/{depId}/` — ephemeral, deleted after each deploy
- Smart HTTP via `git-http-backend` CGI — Express proxies directly (no NGINX)
- Every git push/pull/clone authenticates via HTTP Basic Auth checked against Supabase DB before `git-http-backend` is invoked

**File Browsing API (via `repo.git.service.ts`):**
- **List tree:** `GET /api/repos/:name/tree?ref=HEAD&path=` returns `TreeEntry[]` with mode, type (`blob|tree`), sha, name, path
- **Get blob:** `GET /api/repos/:name/blob?ref=HEAD&path=file.txt` returns `BlobResult` with content (utf8 or base64), size, encoding, isBinary flag
- **List commits:** `GET /api/repos/:name/commits?ref=HEAD&limit=20` returns `CommitInfo[]` with sha, shortSha, author, message, date
- Implementation: Uses `git ls-tree`, `git show`, `git log` with output parsing. No intermediate storage — all reads directly from bare repos.

### Frontend Subdomain Routing & Realtime (`frontend/src/middleware.ts` & deployments page)

**Edge Routing:**
Vercel wildcard `*.gitanic.com` routes all subdomain requests to the Next.js app. Edge Middleware intercepts, extracts username from host, looks up `active_deployment_id` (cached in Vercel Edge Config to avoid per-request DB hits), then rewrites to:
```
{SUPABASE_URL}/storage/v1/object/public/deployments/{username}/{deployId}{filePath}
```
Cache is invalidated on each successful deployment via `bustDeploymentCache()` call in pipeline step 11. Vercel is a router only — it never stores files.

**Realtime Log Streaming (`frontend/src/pages/repos/[name]/deployments/[id].tsx`):**
The deployment logs viewer subscribes to Supabase Realtime channel `deployment:{deploymentId}` to stream live build logs. Critical cleanup requirement:
- Store `channelRef.current` when subscribing
- In useEffect cleanup function, remove the channel via `supabase.removeChannel(channelRef.current)`
- Without cleanup, channels accumulate in memory when navigating away, causing memory leaks over time

### Database Schema

**`users`** — `id (uuid PK)`, `username (unique)`, `password_hash`, `created_at`

**`repositories`** — `id`, `name`, `owner_id → users`, `auto_deploy_enabled (default false)`, `active_deployment_id → deployment_history` (NULL until first deploy — the atomic live-site pointer), `created_at`

**`deployment_history`** — append-only audit log. `id`, `repo_id`, `user_id` (denormalized), `commit_sha`, `commit_message`, `status (pending|building|success|failed)`, `duration_ms`, `storage_path`, `deployed_at`

**`logs`** — `id`, `user_id`, `repo_id`, `deployment_id`, `log_text` (structured: `[STEP] message`), `created_at`. Supabase Realtime streams on INSERT → log viewer updates live during build.

## REST API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | None | Create user |
| POST | `/api/auth/login` | None | Returns JWT |
| GET | `/api/repos` | JWT | List user repos |
| POST | `/api/repos` | JWT | Create repo (calls `RepositoryFactory`) |
| GET | `/api/repos/:repoName` | JWT | Get single repo metadata |
| DELETE | `/api/repos/:repoName` | JWT | Delete repo + bare repo on disk |
| GET | `/api/repos/:repoName/tree?ref=HEAD&path=` | JWT | List tree entries (folders/files) at path |
| GET | `/api/repos/:repoName/blob?ref=HEAD&path=file.txt` | JWT | Get file content (text or base64 if binary) |
| GET | `/api/repos/:repoName/commits?ref=HEAD&limit=20` | JWT | List commits for a ref |
| POST | `/api/repos/:repoName/deploy` | JWT | Trigger deploy; sets `auto_deploy=true` on first call |
| GET | `/api/deployments` | JWT | List deployment history |
| GET | `/api/logs/:deployId` | JWT | Logs for a deployment |
| POST | `/internal/deploy` | Internal secret | Called by post-receive hook |
| ALL | `/git/:username/:repo.git/*` | Basic Auth | Git Smart HTTP → `git-http-backend` CGI |

## Environment Variables

**Backend (Railway):**
- `DATABASE_URL` — Supabase PostgreSQL connection string
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase admin (service role key, never exposed to frontend)
- `JWT_SECRET` — 256-bit random secret
- `REPOS_ROOT` — `/repos` (Railway persistent volume mount; defaults to `/repos`)
- `INTERNAL_SECRET` — secures `/internal/deploy` endpoint
- `INTERNAL_BASE_URL` — base URL for post-receive hook callbacks (defaults to `http://localhost:3000`)
- `GIT_HOST` — public git HTTP host for clone URLs (defaults to `localhost:3000`)
- `SYNC_REPOS_ON_STARTUP` — reconcile DB repos with filesystem on boot (`true` in dev, `false` in prod)
- `PORT` — HTTP listen port (defaults to `3000`)

**Frontend (Vercel):**
- `RAILWAY_API_URL` — Railway public domain (`https://api.gitanic.com`)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public Supabase keys
- `ROOT_DOMAIN` — `gitanic.com` (used by middleware for subdomain extraction)
- `EDGE_CONFIG` — Vercel Edge Config connection string (active deployment ID cache)

## JavaFX Client

Lightweight Git GUI wrapper around system CLI — no embedded Git logic. GitHub Desktop-like workflow: login → clone/open → edit/commit/push. Architecture: FXML = View, Controllers handle UI events, Singletons (`AppState`, `EventBus`, `GitCommandService`) manage state and I/O.

**State Management:**
- `AppState` — logged-in user, API base URL, current repo dir, credentials (in-memory)
- `EventBus` — pub/sub for inter-screen events (LOGIN_SUCCESS, REPO_DIR_OPENED, LOGOUT)
- `GitCommandService` — singleton wrapping `ProcessBuilder` for all git CLI operations

**Screens:**
1. **LoginScreen** — username/password login only (no registration, no API URL field). API defaults to `http://localhost:3000`.
2. **CloneScreen** — home screen after login. Clone remote repo via HTTPS URL (credentials injected) or open existing local repo via directory picker. Displays logged-in username and logout button in app bar.
3. **WorkspaceScreen** — local repo editor with staged/unstaged file sidebar + 4 tabs:
   - **Diff** — unstaged changes view
   - **Commit** — stage/unstage files, write message, commit or amend
   - **History** — commit log list; click commit to view full diff; revert commits (creates new revert commit)
   - **Remote** — fetch/pull/push output display

**Git Operations:**
- All git commands via `ProcessBuilder` with environment override (`GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=echo`) to prevent interactive prompts
- Clone/push/pull: HTTP Basic Auth injected into URL via `AppState.injectCredentials()`, then temporarily set remote, execute, restore clean URL
- Revert: `git revert --no-edit` creates new commit undoing target commit; user confirms via dialog
- Staging: `git add/restore --staged` with fallback to `reset HEAD` for older git versions

**Styling:** GitHub Dark theme (`dark-theme.css`) — #0d1117 bg, #58a6ff blue, #238636 green

## Key Constraints

- **Only static sites** — HTML/CSS/JS and built React/Vite output. No SSR, no backend apps. Enforced by deploy strategies with explicit rejection messages for Next.js, Nuxt, Remix, Express, etc.
- **One active deployment per user** — `active_deployment_id` pointer; only updates on success.
- **Only `main` branch** triggers auto-deploy. All other branches (master, develop, feature/*) silently ignored.
- **One build at a time** — in-memory FIFO queue. Future improvement: BullMQ + Redis for persistence across restarts.
- **Storage retention** — last 3–5 successful deployments per user; older storage files deleted (history rows kept).
- **Auto-deploy activation** — Set ONLY by DB trigger `trg_auto_deploy_on_success` on first successful deployment. Controller never pre-sets flag.
- **Immutable deployments** — Once status='success', `active_deployment_id` is final. Failed deployments never touch the pointer. Storage pruning explicitly protects the active deployment ID.
- **Sandbox isolation** — Build scripts run with restricted PATH, no HOME, no access to secrets. Prevents exfiltration of `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `JWT_SECRET`.

## Implementation Status (April 2026)

### Backend: ✅ FULLY IMPLEMENTED
All 32 files production-ready. Verified:
- **6 route modules** (auth, repos, deploy, git, internal, public) — complete with all endpoints
- **4 business modules** (auth, repos, deployment, public) — all 3 layers (controller/service/repository)
- **8 library files** — logger, db, supabase, deployQueue, deployEvents, logSubscribers, storage, cacheBust
- **4 middleware files** — auth, gitAuth, errorHandler, requestLogger
- **4 deployment strategies** — Vite, React, Static (+ detection logic with precedence)
- **All design patterns** — Repository, Strategy, Factory, Observer, Singleton, FIFO Queue, MVC, CGI pass-through
- **Git HTTP protocol** — full smart-http via native git-http-backend with binary-safe parsing
- **Atomic operations** — two-phase repo creation, DB triggers for deployment success
- **Error handling** — comprehensive, with rollback/cleanup on failure
- **Security** — bcrypt hashing, JWT auth, HTTP Basic auth, timing-safe comparisons, sandbox environment

### Frontend: ✅ FULLY IMPLEMENTED (April 2026 update)
All pages connected to backend APIs. Fixed gaps:
- **Private repo detail** (`pages/repos/[name].tsx`) — added commit history section, delete button, uses `git_url` from API
- **Middleware** (`src/middleware.ts`) — proper Next.js Edge Middleware wiring subdomain routing to proxy
- **Routes helper** (`lib/routes.ts`) — added `publicTree` route for public repo navigation
- **TypeScript** — zero errors on both backend and frontend builds

### Build Verification: ✅ CLEAN
- Backend: `npx tsc --noEmit` → 0 errors, `npm run build` → clean compilation
- Frontend: `npx tsc --noEmit` → 0 errors

## Implementation Notes (March 2026 Audit Fixes)

This section documents critical implementation details verified against the Master Plan.

### 1. Branch Policy (Main-Only)
- **Post-receive hook** (`backend/src/modules/repos/repo.service.ts` buildPostReceiveHook): only sends `main` branch to `/internal/deploy`
- **Service layer** (`backend/src/routes/internal.ts` POST /internal/deploy): validates `if (branch !== 'main')` and returns 200 OK with ignored message
- **Rationale**: Thin hook, fat service — policy lives in app layer, not hook script

### 2. First-Deploy Activation
- **Controller** (`backend/src/modules/deployment/deployment.controller.ts`): does NOT call `enableAutoDeploy()` before pipeline
- **Pipeline** (`backend/src/modules/deployment/deployment.service.ts`): runs with flag as-is (typically false)
- **DB trigger** (`database/migrations/002_functions_triggers.sql` trg_auto_deploy_on_success): sets flag to true ONLY when status='success'
- **Guarantee**: Failed first deployment keeps flag false; next hook push is rejected by internal.ts

### 3. Immutability Trigger Fix
- **Migration 006** removes `commit_sha` and `commit_message` from immutability check
- **Why**: These fields are intentionally mutable during step 3b when commit info is fetched and written
- **Bug before fix**: All deployments failed with "immutable fields cannot be changed" at updateCommitInfo()

### 4. Sandbox Environment
- **Constants** (`backend/src/modules/deployment/strategies/index.ts` SAFE_ENV):
  ```typescript
  const SAFE_ENV: NodeJS.ProcessEnv = {
    PATH:     '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    HOME:     '/tmp',
    NODE_ENV: 'production',
    CI:       'true',
  };
  ```
- **Applied to**: React and Vite strategies' `npm ci` and build commands
- **Prevents**: Build scripts from accessing DATABASE_URL, JWT_SECRET, SUPABASE_SERVICE_ROLE_KEY in process.env

### 5. Failure Handling & Partial Upload Cleanup
- **On any pipeline error** (`backend/src/modules/deployment/deployment.service.ts` catch block):
  1. Call `DeploymentRepository.markFailed()` — does NOT update active_deployment_id
  2. Call `StorageService.deleteDeployment()` — removes partial uploads
  3. Emit `deploy:failed` event
- **Invariant**: Failed deployment never leaves orphaned objects in Storage or broken pointer

### 6. Realtime Channel Cleanup
- **Frontend** (`frontend/src/pages/repos/[name]/deployments/[id].tsx`):
  - Store channel ref: `const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)`
  - Cleanup in useEffect: `supabase.removeChannel(channelRef.current)`
- **Why**: Without cleanup, channels leak from memory across page navigations

### 7. Storage Path Documentation
- **Param description** (`backend/src/lib/storage.service.ts` pruneOldDeployments JSDoc): ordered "newest → oldest"
- **Matches slicing logic**: `recentDepIds.slice(0, KEEP_DEPLOYMENTS)` takes first N (newest)

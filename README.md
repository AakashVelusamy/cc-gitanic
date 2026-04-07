# Gitanic

A distributed, cloud-native Git hosting and static deployment platform built as a university Cloud Computing project.

Gitanic lets users create Git repositories, push code, and automatically deploy static sites — all from a single platform. It also ships a JavaFX desktop client that works like a lightweight GitHub Desktop.

---

## Architecture

Gitanic is a **three-service distributed system** where each free-tier cloud provider owns strictly separated concerns:

| Service | Responsibility |
|---------|---------------|
| **Vercel** | Next.js 16 frontend, wildcard `*.gitanic.com` subdomain routing, Edge Middleware, deployment cache via Edge Config |
| **Railway** | Express API, Git Smart-HTTP (`git-http-backend` CGI), deployment build pipeline, bare repos on persistent volume (`/repos`) |
| **Supabase** | PostgreSQL database, Storage bucket for static build artifacts, Realtime log streaming |

The backend is a **Modular Monolith** — one Node.js/Express process with well-separated internal modules. Microservices were explicitly rejected (2–5 users, single developer).

```
Browser ──→ Vercel (Next.js) ──→ Railway API (Express)
                ↑                        ↓
         *.gitanic.com           Supabase Storage
         subdomain proxy              (files)
                                 Supabase DB + Realtime
                                      (state + logs)
```

---

## Design Patterns

| Pattern | Location | Purpose |
|---------|----------|---------|
| **MVC** | Entire web layer | Next.js pages = View; Express controllers = Controller; Services = Model logic |
| **Repository** | `*.repository.ts` | All SQL isolated — services never write raw queries |
| **Strategy** | `deploy/strategies/` | Swap build algorithm at runtime. `detect()` + `build()` interface |
| **Factory** | `repos/repo.factory.ts` | `RepositoryFactory.init()` atomically creates bare repos via `git init --bare` |
| **Observer** | `deploy.service.ts` + `log.service.ts` | EventEmitter emits `deploy:start/step/success/failed`; LogService streams to Supabase Realtime |
| **Singleton** | `lib/db.ts`, `lib/supabase.ts`, `lib/logger.ts` | One connection pool per process |
| **Queue (FIFO)** | `lib/deployQueue.ts` | One build at a time — prevents Railway free-tier compute exhaustion |

---

## Repository Structure

```
gitanic/
├── backend/                    # Express API + Git server (Railway)
│   └── src/
│       ├── index.ts            # App entry point
│       ├── lib/                # Singletons: db, supabase, logger, queue, events, storage
│       ├── middleware/         # auth (JWT), gitAuth (Basic), errorHandler, requestLogger
│       ├── modules/
│       │   ├── auth/           # Register, login, OTP, JWT — controller/service/repository
│       │   ├── repos/          # Repo CRUD, git file browsing — controller/service/repository
│       │   └── deployment/     # 10-step pipeline, strategies — controller/service/repository
│       └── routes/             # api.routes, internal.routes, git.routes
│
├── frontend/                   # Next.js 16 SPA (Vercel)
│   └── src/
│       ├── pages/              # App pages + API routes (live proxy, cache invalidation)
│       ├── components/         # Navbar, FileBrowser, DeployButton, MarkdownContent
│       └── lib/                # api.ts, routes.ts, supabase.ts
│
├── javafx/                     # Desktop Git client (standalone)
│   └── src/main/java/com/gitanic/
│       ├── App.java / Main.java
│       ├── AppState.java       # Singleton: current user, credentials, repo dir
│       ├── EventBus.java       # Pub/sub for inter-screen events
│       ├── controllers/        # FXML controllers: Login, Clone, Workspace, Commit, etc.
│       ├── models/             # CommitEntry, FileStatus, Repository, User, etc.
│       └── services/
│           ├── GitCommandService.java   # ProcessBuilder wrapper for all git CLI ops
│           └── NetworkService.java     # REST API client (singleton)
│
└── database/
    └── migrations/             # 006 ordered SQL migrations for Supabase
```

---

## Deployment Pipeline (10 Steps)

Every deployment — whether triggered by a `git push` or the Deploy button — runs this pipeline:

1. **Enqueue** — Create `pending` DB row; push job to in-memory FIFO queue (one build at a time)
2. **Validate** — Verify repo ownership and `auto_deploy_enabled` flag
3. **Checkout** — `git --work-tree=/tmp/build/{user}/{depId} checkout -f HEAD -- .`
3b. **History** — Read `HEAD` commit SHA + message; persist to deployment row
4. **Detect** — Strategy selection (Vite → React CRA → Static HTML; first match wins)
5. **Build** — Sandboxed `execFileSync` with restricted `$PATH`, `$HOME=/tmp`, no secrets in env
6. **Upload** — Parallel batch upload to `deployments/{username}/{depId}/` in Supabase Storage
7. **Atomic DB update** — `UPDATE repositories SET active_deployment_id = $newId`; only on success
8. **Storage pruning** — Keep last 5 successful deployments; delete older folders
9. **Cleanup** — `rm -rf /tmp/build/{user}/{depId}` (always runs, even on failure)
10. **Emit** — `deploy:success` / `deploy:failed` event → Supabase Realtime → live log viewer

**Failure invariant:** Any error immediately calls `markFailed()` (never touches `active_deployment_id`) and deletes partial uploads. The live site is never broken by a failed deployment.

---

## Supported Deployment Types

| Framework | Detection | Output |
|-----------|-----------|--------|
| **Vite** (React, Vue, Svelte, vanilla) | `vite.config.*` at repo root | `dist/` |
| **Create React App** | `react-scripts` in `package.json` | `build/` or `dist/` |
| **Static HTML/CSS/JS** | `index.html` at repo root | repo root |

**Not supported:** Next.js, Nuxt, Remix, SvelteKit (require SSR), or any backend server.

---

## Security Model

### Authentication
- **Web API**: JWT Bearer tokens (HS256, 7-day expiry). `jwt.verify()` uses explicit `algorithms: ['HS256']` to prevent algorithm-confusion attacks.
- **Git HTTP**: HTTP Basic Auth decoded, bcrypt-compared against DB. Constant-time comparison always runs even when the user is not found (prevents timing oracle).
- **Internal routes** (`/internal/deploy`): `X-Gitanic-Secret` header; timing-safe `crypto.timingSafeEqual()` comparison.

### Input Validation
- All user-supplied values (repo names, usernames, refs, file paths) are validated against strict regex allowlists before use.
- Path traversal is prevented at every level: `path.resolve()` checks in TypeScript, `File.getCanonicalFile()` checks in Java.
- Live preview proxy validates `username` and `deploymentId` (UUID format) before constructing upstream Supabase URLs.

### Build Sandbox
```typescript
const SAFE_ENV = {
  PATH: process.env.PATH,   // system path only
  HOME: '/tmp',             // no access to Railway home dir
  NODE_ENV: 'production',
  CI: 'true',
  // No DATABASE_URL, JWT_SECRET, SUPABASE_SERVICE_ROLE_KEY
};
```

### OTP Security
- Cryptographically secure generation via `crypto.randomInt()`
- SHA-256 hashed before storage (plaintext never persisted)
- Timing-safe verification via `crypto.timingSafeEqual()`
- Rate-limited (60s cooldown), max 5 attempts before lockout, 5-minute expiry
- `OTP_STATIC` bypass is blocked in production

### Security Headers (all routes)
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

---

## Subdomain Routing

Vercel wildcard `*.gitanic.com` routes all subdomain requests through Edge Middleware. The middleware extracts `username` from the host, looks up `active_deployment_id` in Vercel Edge Config (cached), and rewrites to:

```
{SUPABASE_URL}/storage/v1/object/public/deployments/{username}/{deploymentId}{filePath}
```

Cache is invalidated by `POST /api/cache/invalidate` after each successful deployment. Vercel is a router only — it never stores files.

---

## JavaFX Desktop Client

A GitHub Desktop-style GUI wrapping the system `git` CLI. No embedded Git logic.

**Screens:** Login → Clone/Open → Workspace (Diff | Commit | History | Remote)

**Key singletons:**
- `AppState` — logged-in user, API base URL, current repo dir, in-memory credentials
- `EventBus` — pub/sub for `LOGIN_SUCCESS`, `REPO_DIR_OPENED`, `LOGOUT` events
- `GitCommandService` — all git operations via `ProcessBuilder` (Holder-pattern singleton)
- `NetworkService` — all REST calls via Java `HttpClient` (Holder-pattern singleton)

**Security:** All git arguments validated, paths canonicalized, credentials never logged, HTTPS enforced for non-localhost API URLs, `GIT_TERMINAL_PROMPT=0` prevents interactive credential prompts.

---

## Getting Started

### Prerequisites
- Node.js 20+
- Java 21 + Maven
- A Supabase project
- A Railway account
- A Vercel account

### Backend (Railway)

```bash
cd backend
npm install
npm run dev        # Dev with hot-reload (ts-node-dev)
npm run build      # Compile TypeScript → dist/
npm start          # Run compiled dist/index.js
```

**Required environment variables:**
```env
DATABASE_URL=                    # Supabase PostgreSQL connection string
SUPABASE_URL=                    # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=       # Supabase service role key (server-side only)
JWT_SECRET=                      # 256-bit random secret
REPOS_ROOT=/repos                # Railway persistent volume mount
INTERNAL_SECRET=                 # Shared secret for /internal/deploy endpoint
INTERNAL_BASE_URL=               # Backend's own public URL
GIT_HOST=                        # Public git HTTP host for clone URLs
SMTP_USER=                       # Gmail address for OTP emails
SMTP_PASS=                       # Gmail app password
PORT=3000
```

### Frontend (Vercel)

```bash
cd frontend
npm install
npm run dev        # Dev server on port 3001
npm run build      # Production build
npm run lint       # ESLint
```

**Required environment variables:**
```env
NEXT_PUBLIC_API_URL=             # Railway backend public URL
NEXT_PUBLIC_SUPABASE_URL=        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase anon key
INTERNAL_SECRET=                 # Same as backend INTERNAL_SECRET
VERCEL_API_TOKEN=                # For Edge Config cache updates
EDGE_CONFIG_ID=                  # Vercel Edge Config store ID
ROOT_DOMAIN=gitanic.com
```

### Database

Apply migrations in order via Supabase SQL editor:

```
database/migrations/001_initial_schema.sql
database/migrations/002_functions_triggers.sql
database/migrations/003_realtime_setup.sql
database/migrations/004_user_profile_fields.sql
database/migrations/005_add_email.sql
database/migrations/006_fix_immutability_trigger.sql
```

Migration 006 is critical — it allows `commit_sha` and `commit_message` to be updated during the build pipeline (two-phase write).

### JavaFX Client

```bash
cd javafx
mvn clean install    # Build fat JAR
mvn javafx:run       # Run desktop client
```

The client defaults to `http://localhost:3000` as the API base URL (configurable via login screen settings).

---

## Database Schema

```sql
users             id, username, email, password_hash, created_at
repositories      id, name, owner_id→users, auto_deploy_enabled, active_deployment_id→deployment_history, created_at
deployment_history id, repo_id, user_id, commit_sha, commit_message, status, duration_ms, storage_path, deployed_at
logs              id, user_id, repo_id, deployment_id, log_text, created_at
```

`active_deployment_id` is the live-site pointer — only updated on `status='success'` by a DB trigger. Failed deployments never touch it.

---

## REST API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | None | Create user (requires OTP) |
| POST | `/api/auth/login` | None | Returns JWT |
| GET | `/api/auth/me` | JWT | Current user profile |
| GET | `/api/repos` | JWT | List user repos |
| POST | `/api/repos` | JWT | Create repo |
| GET | `/api/repos/:name` | JWT | Get repo metadata + git URL |
| DELETE | `/api/repos/:name` | JWT | Delete repo + bare repo on disk |
| GET | `/api/repos/:name/tree?ref=HEAD&path=` | JWT | List directory entries |
| GET | `/api/repos/:name/blob?ref=HEAD&path=file.txt` | JWT | Get file content |
| GET | `/api/repos/:name/commits?ref=HEAD&limit=20` | JWT | List commits |
| POST | `/api/repos/:name/deploy` | JWT | Trigger deployment |
| GET | `/api/deployments` | JWT | List deployment history |
| GET | `/api/logs/:deployId` | JWT | Logs for a deployment |
| POST | `/internal/deploy` | Internal secret | Called by post-receive hook |
| ALL | `/git/:username/:repo.git/*` | Basic Auth | Git Smart HTTP |

---

## Key Constraints

- **Static sites only** — Vite, CRA, or plain HTML/CSS/JS. SSR frameworks (Next.js, Nuxt, Remix) are explicitly rejected.
- **Main branch only** — auto-deploy only triggers on pushes to `main` (or `master`). All other branches are silently ignored.
- **One build at a time** — in-memory FIFO queue prevents resource exhaustion on Railway free tier.
- **Auto-deploy activation** — Set by DB trigger `trg_auto_deploy_on_success` on first successful deployment only. Never pre-set by code.
- **Immutable live pointer** — `active_deployment_id` only advances on success, never on failure.
- **Storage retention** — Last 5 successful deployments kept; older storage folders pruned after each success.
/**
 * routes/git.ts — Production git-http-backend CGI pass-through
 *
 * Handles the full git smart-HTTP protocol without NGINX:
 *   GET  /git/:username/:repo.git/info/refs?service=git-upload-pack   → clone/fetch
 *   GET  /git/:username/:repo.git/info/refs?service=git-receive-pack  → push auth
 *   POST /git/:username/:repo.git/git-upload-pack                     → fetch/clone data
 *   POST /git/:username/:repo.git/git-receive-pack                    → push data
 *
 * Protected by: gitAuthMiddleware (HTTP Basic — validated against DB with bcrypt)
 *
 * Key correctness notes:
 *   1. CONTENT_LENGTH must be forwarded so git-http-backend reads the full body
 *   2. GIT_DIR must NOT be set when GIT_PROJECT_ROOT is used (they conflict)
 *   3. PATH_INFO format must exactly match what git-http-backend expects
 *   4. Header parsing is binary-safe using Buffer concatenation (not string)
 *   5. All I/O is streamed — no buffering in process memory
 *
 * Architecture: Middleware Pattern (gitAuthMiddleware) + native git-http-backend
 */

import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { gitAuthMiddleware } from '../middleware/gitAuthMiddleware';
import { logger } from '../lib/logger';

const router = Router();

// ── Auth guard on every git route ─────────────────────────────────────────────
router.use(gitAuthMiddleware);

// ── CGI environment builder ───────────────────────────────────────────────────

/**
 * Build the minimal set of CGI/1.1 environment variables required by
 * git-http-backend. Extraneous variables are stripped to avoid leaking
 * Railway secrets into the child process environment.
 *
 * @param req          - Incoming Express request
 * @param username     - Repo owner (from URL)
 * @param repoName     - Repo name without .git suffix
 * @param pathInfo     - PATH_INFO starting with /  (e.g. /my-site.git/info/refs)
 * @param queryString  - Raw query string without leading ?
 */
function buildCgiEnv(
  req: Request,
  username: string,
  repoName: string,
  pathInfo: string,
  queryString: string
): NodeJS.ProcessEnv {
  const reposRoot = process.env.REPOS_ROOT ?? '/repos';

  return {
    // ── git-http-backend required vars ──────────────────────────────────────
    GIT_PROJECT_ROOT:   path.join(reposRoot, username),
    GIT_HTTP_EXPORT_ALL: '1',   // allow clone of any repo under PROJECT_ROOT

    // ── CGI/1.1 standard vars ────────────────────────────────────────────────
    REQUEST_METHOD:  req.method,
    PATH_INFO:       pathInfo,          // e.g. /my-site.git/info/refs
    QUERY_STRING:    queryString,       // e.g. service=git-upload-pack
    CONTENT_TYPE:    req.headers['content-type']   ?? '',
    CONTENT_LENGTH:  req.headers['content-length'] ?? '',

    // ── Server identity (required by some git versions) ──────────────────────
    SERVER_NAME:     req.hostname ?? 'localhost',
    SERVER_PORT:     String(req.socket.localPort ?? 80),
    SERVER_PROTOCOL: 'HTTP/1.1',
    SERVER_SOFTWARE: 'gitanic/1.0',

    // ── Client identity ──────────────────────────────────────────────────────
    REMOTE_ADDR: req.socket.remoteAddress ?? '127.0.0.1',
    REMOTE_USER: username,

    // ── Passthrough — only safe subset of process env ────────────────────────
    // PATH is required so git can find sub-commands, HOME for git config
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: process.env.HOME ?? '/root',

    // ── Context for post-receive hook (via env, not git-http-backend) ────────
    // These are passed through to the hook process environment
    GITANIC_REPO:     repoName,
    GITANIC_USERNAME: username,
  };
}

// ── Binary-safe CGI response parser ──────────────────────────────────────────

/**
 * Parses the CGI response from git-http-backend stdout.
 *
 * CGI format:
 *   <headers>\r\n\r\n<body>
 *
 * Uses Buffer throughout (never string) to preserve binary pack data integrity.
 * Supports multi-chunk delivery — buffers until the header separator is found.
 */
class CgiResponseParser {
  private _buf: Buffer = Buffer.alloc(0);
  private _headersEmitted = false;

  constructor(
    private readonly res: Response,
    private readonly _onError: (msg: string) => void
  ) {}

  get headersDone(): boolean { return this._headersEmitted; }

  /** Feed the next stdout chunk from git-http-backend. */
  feed(chunk: Buffer): void {
    if (this._headersEmitted) {
      // Headers already parsed — stream body directly
      this.res.write(chunk);
      return;
    }

    // Accumulate binary data
    this._buf = Buffer.concat([this._buf, chunk]);

    // Look for \r\n\r\n separator
    const sep = this._findSeparator(this._buf);
    if (sep === -1) return; // need more data

    // Split into header section + body remainder
    const headerBuf = this._buf.slice(0, sep);
    const bodyBuf   = this._buf.slice(sep + 4); // skip \r\n\r\n

    this._parseAndApplyHeaders(headerBuf.toString('ascii'));
    this._headersEmitted = true;

    if (bodyBuf.length > 0) {
      this.res.write(bodyBuf);
    }
  }

  /** Call when stdout 'end' fires. */
  end(): void {
    if (!this._headersEmitted) {
      // Backend exited without emitting any headers — emit an error
      this._onError('git-http-backend closed stdout without sending headers');
      if (!this.res.headersSent) {
        this.res.status(502).send('Bad Gateway: git backend produced no output');
      }
      return;
    }
    this.res.end();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _findSeparator(buf: Buffer): number {
    for (let i = 0; i < buf.length - 3; i++) {
      if (
        buf[i]     === 0x0d && // \r
        buf[i + 1] === 0x0a && // \n
        buf[i + 2] === 0x0d && // \r
        buf[i + 3] === 0x0a    // \n
      ) {
        return i;
      }
    }
    return -1;
  }

  private _parseAndApplyHeaders(rawHeaders: string): void {
    let statusSet = false;

    for (const line of rawHeaders.split('\r\n')) {
      if (!line.trim()) continue;
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key   = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();

      if (key === 'status') {
        // CGI Status header: "200 OK" — extract numeric code
        const code = parseInt(value, 10);
        if (!isNaN(code)) {
          this.res.status(code);
          statusSet = true;
        }
      } else {
        this.res.setHeader(key, value);
      }
    }

    // git-http-backend omits Status for 200 — default
    if (!statusSet) this.res.status(200);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * Mounted at /git in index.ts → matches /git/:username/*
 * The wildcard captures everything after /:username/, preserving slashes.
 */
router.all('/:username/*', (req: Request, res: Response): void => {
  const username = req.params['username'] as string;

  // req.params[0] is the wildcard after /:username/
  // e.g.  "my-site.git/info/refs"  or  "my-site.git/git-upload-pack"
  const wildcard  = (req.params as Record<string, string>)['0'] ?? '';
  const dotGitIdx = wildcard.indexOf('.git');

  if (dotGitIdx === -1) {
    res.status(400).send('Invalid git URL — missing .git suffix');
    return;
  }

  const repoName   = wildcard.slice(0, dotGitIdx);           // "my-site"
  const afterDotGit = wildcard.slice(dotGitIdx + 4);         // "/info/refs" or ""
  const pathInfo   = `/${repoName}.git${afterDotGit}`;       // "/my-site.git/info/refs"

  // Raw query string (without leading ?)
  const rawUrl      = req.url;  // includes query string
  const qIdx        = rawUrl.indexOf('?');
  const queryString = qIdx !== -1 ? rawUrl.slice(qIdx + 1) : '';

  logger.debug(`[git] ${req.method} ${pathInfo}?${queryString}`, {
    meta: { username, repoName },
  });

  // ── Spawn git-http-backend ────────────────────────────────────────────────
  const env = buildCgiEnv(req, username, repoName, pathInfo, queryString);

  const backend = spawn('git', ['http-backend'], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // ── Stdin: stream request body → backend ──────────────────────────────────
  req.pipe(backend.stdin, { end: true });

  // Handle stdin errors (client disconnect during push)
  backend.stdin.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE') {
      logger.warn(`[git] stdin write error: ${err.message}`, { meta: { username, repoName } });
    }
  });

  // ── Stdout: binary-safe CGI parser → response ─────────────────────────────
  const parser = new CgiResponseParser(res, (msg) => {
    logger.error(`[git] CGI parse error: ${msg}`, { meta: { username, repoName } });
    if (!res.headersSent) res.status(500).send('Git backend error');
  });

  backend.stdout.on('data', (chunk: Buffer) => parser.feed(chunk));
  backend.stdout.on('end', ()               => parser.end());

  // ── Stderr: log git diagnostics ───────────────────────────────────────────
  backend.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim();
    if (text) {
      logger.warn(`[git-http-backend] ${text}`, { meta: { username, repoName } });
    }
  });

  // ── Process-level errors ──────────────────────────────────────────────────
  backend.on('error', (err) => {
    logger.error(`[git] Failed to spawn git-http-backend: ${err.message}`, {
      meta: { username, repoName },
    });
    if (!res.headersSent) {
      res.status(500).send('Git server error: could not start git-http-backend');
    }
  });

  backend.on('close', (code) => {
    if (code !== 0 && code !== null) {
      logger.warn(`[git] git-http-backend exited with code ${code}`, {
        meta: { username, repoName },
      });
    }
  });

  // ── Client disconnect — kill backend to avoid zombie processes ────────────
  res.on('close', () => {
    if (!backend.killed) backend.kill('SIGTERM');
  });
});

export default router;

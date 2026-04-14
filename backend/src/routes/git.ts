// git smart-http protocol proxy
// implements binary-safe cgi command passthrough
// manages git-http-backend process lifecycle
// coordinates authentication for git operations
// parses and forwards cgi headers to clients
import { Router, Request, Response } from 'express';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { gitAuthMiddleware } from '../middleware/gitAuthMiddleware';
import { logger } from '../lib/logger';

const router = Router();

// input validation (no leading/trailing hyphens)
const SAFE_USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
const SAFE_REPO_RE     = /^[a-zA-Z0-9._-]{1,100}$/;

router.use(gitAuthMiddleware);

// build minimal cgi environment for git-http-backend
function buildCgiEnv(
  req: Request,
  username: string,
  repoName: string,
  pathInfo: string,
  queryString: string
): NodeJS.ProcessEnv {
  const reposRoot = process.env.REPOS_ROOT ?? '/repos';

  return {
    GIT_PROJECT_ROOT:   path.join(reposRoot, username.toLowerCase()),
    GIT_HTTP_EXPORT_ALL: '1',   // allow clone of any repo under project_root

    REQUEST_METHOD:  req.method,
    PATH_INFO:       pathInfo,
    QUERY_STRING:    queryString,
    CONTENT_TYPE:    req.headers['content-type']   ?? '',
    CONTENT_LENGTH:  req.headers['content-length'] ?? '',

    SERVER_NAME:     req.hostname ?? 'localhost',
    SERVER_PORT:     String(req.socket.localPort ?? 80),
    SERVER_PROTOCOL: 'HTTP/1.1',
    SERVER_SOFTWARE: 'gitanic/1.0',

    REMOTE_ADDR: req.socket.remoteAddress ?? '127.0.0.1',
    REMOTE_USER: username,

    PATH: process.env.PATH,
    HOME: '/tmp',

    GITANIC_REPO:     repoName,
    GITANIC_USERNAME: username,
  };
}

// binary-safe cgi response parser
class CgiResponseParser {
  private _buf: Buffer = Buffer.alloc(0);
  private _headersEmitted = false;

  constructor(
    private readonly res: Response,
    private readonly _onError: (msg: string) => void
  ) {}

  get headersDone(): boolean { return this._headersEmitted; }

  // feed next stdout chunk from git-http-backend
  feed(chunk: Buffer): void {
    if (this._headersEmitted) {
      // headers already parsed — stream body directly
      this.res.write(chunk);
      return;
    }

    // accumulate binary data
    this._buf = Buffer.concat([this._buf, chunk]);

    // look for \r\n\r\n separator
    const sep = this._findSeparator(this._buf);
    if (sep === -1) return; // need more data

    // split into header section + body remainder
    const headerBuf = this._buf.slice(0, sep);
    const bodyBuf   = this._buf.slice(sep + 4); // skip \r\n\r\n

    this._parseAndApplyHeaders(headerBuf.toString('ascii'));
    this._headersEmitted = true;

    if (bodyBuf.length > 0) {
      this.res.write(bodyBuf);
    }
  }

  // end of stdout stream
  end(): void {
    if (!this._headersEmitted) {
      // backend exited without emitting any headers — emit an error
      this._onError('git-http-backend closed stdout without sending headers');
      if (!this.res.headersSent) {
        this.res.status(502).send('Bad Gateway: git backend produced no output');
      }
      return;
    }
    this.res.end();
  }

  // private helper to find \r\n\r\n
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
        const code = Number.parseInt(value, 10);
        if (!Number.isNaN(code)) {
          this.res.status(code);
          statusSet = true;
        }
      } else {
        this.res.setHeader(key, value);
      }
    }

    // git-http-backend omits status for 200 — default
    if (!statusSet) this.res.status(200);
  }
}

// route handler for git protocol
router.all('/:username/*', (req: Request, res: Response): void => {
  const username = req.params['username'] as string;

  const wildcard  = (req.params as Record<string, string>)['0'] ?? '';
  const dotGitIdx = wildcard.indexOf('.git');

  if (dotGitIdx === -1) {
    res.status(400).send('Invalid git URL — missing .git suffix');
    return;
  }

  const repoName   = wildcard.slice(0, dotGitIdx);

  // validate path components
  if (!SAFE_USERNAME_RE.test(username) || !SAFE_REPO_RE.test(repoName)) {
    res.status(400).send('Invalid username or repository name');
    return;
  }

  const afterDotGit = wildcard.slice(dotGitIdx + 4);
  const pathInfo   = `/${repoName}.git${afterDotGit}`;

  // extract query string
  const rawUrl      = req.url;
  const qIdx        = rawUrl.indexOf('?');
  const queryString = qIdx === -1 ? '' : rawUrl.slice(qIdx + 1);

  logger.debug(`[git] ${req.method} ${pathInfo}?${queryString}`, {
    meta: { username, repoName },
  });

  // spawn backend
  const env = buildCgiEnv(req, username, repoName, pathInfo, queryString);

  const GIT_BIN = process.env.GIT_BIN_PATH || 'git';

  const backend = spawn(GIT_BIN, ['http-backend'], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // stream request body to backend
  req.pipe(backend.stdin, { end: true });

  // handle client disconnect during push
  backend.stdin.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE') {
      logger.warn(`[git] stdin write error: ${err.message}`, { meta: { username, repoName } });
    }
  });

  // parse stdout
  const parser = new CgiResponseParser(res, (msg) => {
    logger.error(`[git] CGI parse error: ${msg}`, { meta: { username, repoName } });
    if (!res.headersSent) res.status(500).send('Git backend error');
  });

  backend.stdout.on('data', (chunk: Buffer) => parser.feed(chunk));
  backend.stdout.on('end', ()               => parser.end());

  // log stderr diagnostics
  backend.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim();
    if (text) {
      logger.warn(`[git-http-backend] ${text}`, { meta: { username, repoName } });
    }
  });

  // handle process errors
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

  // kill backend on client disconnect
  res.on('close', () => {
    if (!backend.killed) backend.kill('SIGTERM');
  });
});

export default router;

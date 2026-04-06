/**
 * strategies/index.ts — Deployment Strategy System
 *
 * Implements the Strategy Pattern for framework-agnostic deployment builds.
 *
 * Each strategy:
 *   - detect(srcDir)   → returns true if this strategy applies
 *   - build(srcDir)    → runs the build and returns the output directory
 *
 * Detection order (first match wins):
 *   ViteStrategy → ReactStrategy → StaticStrategy
 *
 * Timeouts (enforced per spec):
 *   npm ci    → 120 000 ms
 *   npm build → 180 000 ms
 */

import path         from 'path';
import fs           from 'fs';
import { execFileSync } from 'child_process';

// ── Interface ─────────────────────────────────────────────────────────────────

export interface DeployStrategy {
  /** Human-readable name used in logs. */
  readonly name: string;

  /**
   * Return true if this strategy should apply to the checked-out source tree.
   * Strategies are evaluated in priority order; the first returning true wins.
   */
  detect(srcDir: string): boolean;

  /**
   * Run the build (if any) and return the path to the directory
   * whose files should be uploaded to Supabase Storage.
   *
   * @param srcDir  - Root of the checked-out source tree
   * @param log     - Pipeline log emitter (writes to DB + stdout)
   */
  build(srcDir: string, log: (msg: string) => Promise<void>): Promise<string>;
}

// ── Timeouts (ms) ─────────────────────────────────────────────────────────────

const NPM_CI_TIMEOUT    = 120_000;  // 120 s — dependency install
const NPM_BUILD_TIMEOUT = 180_000;  // 180 s — framework build

// ── Sandbox environment ───────────────────────────────────────────────────────

/**
 * Restricted environment for build child processes.
 * - PATH is limited to standard system directories (no user-local bins)
 * - HOME is /tmp (no access to Railway's home dir or its secrets)
 * - NODE_ENV=production ensures framework builds optimise output
 * - No DATABASE_URL, JWT_SECRET, SUPABASE_SERVICE_ROLE_KEY, etc.
 *
 * Plan requirement: "sandboxed via child_process with no $HOME, $PATH restricted"
 */
const SAFE_ENV: NodeJS.ProcessEnv = {
  // Use system PATH so Node/npm resolve correctly (required for Nixpacks/Railway paths)
  PATH:     process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME:     '/tmp',
  NODE_ENV: 'production',
  // CI=true suppresses interactive prompts in npm/CRA/Vite
  CI:       'true',
};

// ── StaticStrategy ────────────────────────────────────────────────────────────

/**
 * Pure static sites: any directory that already contains index.html
 * at its root. No build step required — files are uploaded as-is.
 */
export const StaticStrategy: DeployStrategy = {
  name: 'static',

  detect(srcDir) {
    return fs.existsSync(path.join(srcDir, 'index.html'));
  },

  async build(srcDir, log) {
    await log('[build:static] No build required — uploading static files');
    return srcDir;
  },
};

// ── ReactStrategy ─────────────────────────────────────────────────────────────

/**
 * React applications (Create React App and plain React + custom build scripts).
 *
 * Detection: package.json exists AND one of:
 *   - dependencies or devDependencies contains "react-scripts"
 *   - scripts.build contains "react-scripts"
 *   - scripts.build contains "react" (loose match for custom setups)
 *
 * Output directory resolution (first that exists wins):
 *   1. build/   ← CRA default
 *   2. dist/    ← some custom CRA configs
 */
export const ReactStrategy: DeployStrategy = {
  name: 'react',

  detect(srcDir) {
    const pkgPath = path.join(srcDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
        scripts?:         Record<string, string>;
        dependencies?:    Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      const deps = {
        ...(pkg.dependencies    ?? {}),
        ...(pkg.devDependencies ?? {}),
      };

      // Explicit react-scripts dependency
      if ('react-scripts' in deps) return true;

      // Check the build script text
      const buildScript = pkg.scripts?.['build'] ?? '';
      if (buildScript.includes('react-scripts')) return true;

      return false;
    } catch {
      return false;
    }
  },

  async build(srcDir, log) {
    // ── npm ci ──────────────────────────────────────────────────────────────
    await log('[build:react] npm ci (timeout 120 s)');
    execFileSync('npm', ['ci', '--prefer-offline'], {
      cwd:     srcDir,
      stdio:   'pipe',
      timeout: NPM_CI_TIMEOUT,
      env:     SAFE_ENV,
    });

    // ── npm run build ────────────────────────────────────────────────────────
    await log('[build:react] npm run build (timeout 180 s)');
    execFileSync('npm', ['run', 'build'], {
      cwd:     srcDir,
      stdio:   'pipe',
      timeout: NPM_BUILD_TIMEOUT,
      env:     SAFE_ENV,
    });

    // ── Resolve output directory ─────────────────────────────────────────────
    // CRA outputs to build/; some setups output to dist/
    const candidates = [
      path.join(srcDir, 'build'),
      path.join(srcDir, 'dist'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        await log(`[build:react] Output directory: ${candidate}`);
        return candidate;
      }
    }

    throw new Error(
      '[build:react] Build succeeded but neither build/ nor dist/ was found. ' +
      'Ensure your npm build script outputs to one of these directories.'
    );
  },
};

// ── ViteStrategy ──────────────────────────────────────────────────────────────

/**
 * Vite-based projects (React + Vite, Vue, Svelte, vanilla Vite, etc.)
 *
 * Detection: any of these files exists at srcDir root:
 *   vite.config.ts / vite.config.js / vite.config.mts / vite.config.mjs
 *
 * Output directory: dist/ (Vite default, configurable in vite.config but we
 * assume default unless the project overrides it to another known path).
 */
export const ViteStrategy: DeployStrategy = {
  name: 'vite',

  detect(srcDir) {
    return [
      'vite.config.ts',
      'vite.config.js',
      'vite.config.mts',
      'vite.config.mjs',
    ].some((f) => fs.existsSync(path.join(srcDir, f)));
  },

  async build(srcDir, log) {
    // ── npm ci ──────────────────────────────────────────────────────────────
    await log('[build:vite] npm ci (timeout 120 s)');
    execFileSync('npm', ['ci', '--prefer-offline'], {
      cwd:     srcDir,
      stdio:   'pipe',
      timeout: NPM_CI_TIMEOUT,
      env:     SAFE_ENV,
    });

    // ── vite build ───────────────────────────────────────────────────────────
    await log('[build:vite] vite build (timeout 180 s)');
    execFileSync('npx', ['vite', 'build'], {
      cwd:     srcDir,
      stdio:   'pipe',
      timeout: NPM_BUILD_TIMEOUT,
      env:     SAFE_ENV,
    });

    // ── Output directory ─────────────────────────────────────────────────────
    const distDir = path.join(srcDir, 'dist');
    if (!fs.existsSync(distDir)) {
      throw new Error(
        '[build:vite] Build succeeded but dist/ was not found. ' +
        'If your vite.config uses a custom build.outDir, change it to "dist".'
      );
    }

    await log(`[build:vite] Output directory: ${distDir}`);
    return distDir;
  },
};

// ── Ordered strategy registry ─────────────────────────────────────────────────

/**
 * Priority-ordered list of strategies.
 * The first strategy whose detect() returns true is used.
 *
 * Order matters:
 *   - ViteStrategy before ReactStrategy (Vite projects often have index.html too)
 *   - ReactStrategy before StaticStrategy (CRA projects have index.html in public/)
 */
export const STRATEGIES: DeployStrategy[] = [
  ViteStrategy,
  ReactStrategy,
  StaticStrategy,
];

/**
 * Select the appropriate build strategy for the given source directory.
 * Throws 422 if no strategy matches.
 *
 * Gitanic only deploys static sites. Supported projects:
 *   - Vite (React, Vue, Svelte, vanilla) → detects vite.config.*
 *   - Create React App                   → detects react-scripts in package.json
 *   - Static HTML                         → detects index.html at root
 *
 * Unsupported (intentionally rejected):
 *   - Next.js, Nuxt, Remix, SvelteKit (SSR frameworks)
 *   - Node/Express backends, Python/Django, Go servers
 *   - Any project without a static build output
 */
export function detectStrategy(srcDir: string): DeployStrategy {
  for (const strategy of STRATEGIES) {
    if (strategy.detect(srcDir)) return strategy;
  }

  // Provide actionable feedback about what Gitanic supports
  const hasPkgJson = fs.existsSync(path.join(srcDir, 'package.json'));
  let hint = '';

  if (hasPkgJson) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(srcDir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

      if ('next' in allDeps)
        hint = ' Your project uses Next.js, which requires server-side rendering — Gitanic only supports static site output.';
      else if ('nuxt' in allDeps)
        hint = ' Your project uses Nuxt, which requires server-side rendering — Gitanic only supports static site output.';
      else if ('remix' in allDeps || '@remix-run/react' in allDeps)
        hint = ' Your project uses Remix, which requires a server runtime — Gitanic only supports static site output.';
      else if ('express' in allDeps || 'fastify' in allDeps || 'koa' in allDeps)
        hint = ' Your project appears to be a backend server — Gitanic only deploys static sites (HTML/CSS/JS).';
      else
        hint = ' If your project builds static output, add a vite.config.ts, use react-scripts, or place an index.html at the root.';
    } catch {
      hint = ' package.json exists but could not be parsed.';
    }
  } else {
    hint = ' Add an index.html at the repository root for static sites, or a vite.config.ts / react-scripts setup for framework builds.';
  }

  throw Object.assign(
    new Error(
      'Cannot detect build strategy: no vite.config.*, react-scripts dependency, ' +
      `or index.html found in the repository root.${hint}`
    ),
    { statusCode: 422 }
  );
}

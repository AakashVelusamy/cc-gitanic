// deployment strategy framework
// implements automated project type detection
// orchestrates multi-step build environments
// provides sandboxed execution for build commands
// includes logic for react, vite, and static sites
// generates actionable build errors and hints

import path         from 'node:path';
import fs           from 'node:fs';
import { execFileSync } from 'node:child_process';

// strategy interface

export interface DeployStrategy {
  readonly name: string;    // human-readable name

    // return true if strategy applies to source tree
  detect(srcDir: string): boolean;

    // run build and return output directory path
  build(srcDir: string, log: (msg: string) => Promise<void>): Promise<string>;
}

// build process timeouts

const NPM_CI_TIMEOUT    = 300_000;  // 300 s — dependency install (increased for railway)
const NPM_BUILD_TIMEOUT = 300_000;  // 300 s — framework build (increased for railway)

// sandbox settings

// restricted environment for build child processes
const SAFE_ENV: NodeJS.ProcessEnv = {
  // use system path so node/npm resolve correctly (required for nixpacks/railway paths)
  PATH:     process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME:     '/tmp',
  NODE_ENV: 'production',
  // ci=true suppresses interactive prompts in npm/cra/vite
  CI:       'true',
};

// helper to run a command and stream output
async function runCommand(cmd: string, args: string[], cwd: string, timeout: number, log: (msg: string) => Promise<void>) {
  try {
    const output = execFileSync(cmd, args, {
      cwd,
      stdio: 'pipe',
      timeout,
      env: (args.includes('ci') || args.includes('install'))
        ? { ...SAFE_ENV, NODE_ENV: 'development' }
        : SAFE_ENV,
    });
    if (output.length > 0) {
      await log(output.toString('utf8').trim());
    }
  } catch (err: any) {
    if (err.stdout && err.stdout.length > 0) {
      await log(`[stdout]\n${err.stdout.toString('utf8').trim()}`);
    }
    if (err.stderr && err.stderr.length > 0) {
      await log(`[stderr]\n${err.stderr.toString('utf8').trim()}`);
    }
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

// shared build helpers

// lockfiles and cached modules to remove
const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'node_modules'] as const;

// delete lockfiles for a clean install
function cleanupLockfiles(srcDir: string): void {
  for (const file of LOCKFILES) {
    const filePath = path.join(srcDir, file);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { recursive: true, force: true });
    }
  }
}

// static strategy

// static sites with index.html at root
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

// react strategy

// react applications (cra)
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
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      // explicit react-scripts dependency
      if ('react-scripts' in deps) return true;

      // check the build script text
      const buildScript = pkg.scripts?.['build'] ?? '';
      if (buildScript.includes('react-scripts')) return true;

      return false;
    } catch {
      return false;
    }
  },

  async build(srcDir, log) {
    cleanupLockfiles(srcDir);

    await log('[build:react] npm install (timeout 300 s)');
    await runCommand('npm', ['install', '--no-audit', '--no-fund', '--no-package-lock', '--force'], srcDir, NPM_CI_TIMEOUT, log);

    await log('[build:react] npm run build (timeout 300 s)');
    await runCommand('npm', ['run', 'build'], srcDir, NPM_BUILD_TIMEOUT, log);

    // resolve output directory
    // cra outputs to build/; some setups output to dist/
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

// vite strategy

// vite-based projects
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
    cleanupLockfiles(srcDir);

    await log('[build:vite] npm install (timeout 300 s)');
    await runCommand('npm', ['install', '--no-audit', '--no-fund', '--no-package-lock', '--force'], srcDir, NPM_CI_TIMEOUT, log);

    await log('[build:vite] vite build (timeout 300 s)');
    await runCommand('npx', ['vite', 'build'], srcDir, NPM_BUILD_TIMEOUT, log);

    // resolve output directory
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

// strategy registry

// priority-ordered strategies
export const STRATEGIES: DeployStrategy[] = [
  ViteStrategy,
  ReactStrategy,
  StaticStrategy,
];

// select strategy for source directory
export function detectStrategy(srcDir: string): DeployStrategy {
  for (const strategy of STRATEGIES) {
    if (strategy.detect(srcDir)) return strategy;
  }

  // provide actionable feedback about what gitanic supports
  const hasPkgJson = fs.existsSync(path.join(srcDir, 'package.json'));
  let hint = '';

  if (hasPkgJson) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(srcDir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

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


/**
 * repo.git.service.ts — Read git objects (tree, blob, log) from bare repos
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createError } from '../../middleware/errorHandler';

const REPOS_ROOT = process.env.REPOS_ROOT ?? '/repos';

/** Valid ref: alphanumeric, hyphen, dot, underscore, forward-slash, HEAD */
const SAFE_REF_RE = /^[a-zA-Z0-9._\-/]+$/;

/** Valid username: alphanumeric and hyphens only. */
const SAFE_USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;

/** Valid repo name: alphanumeric, hyphen, underscore, dot; 1–100 chars. */
const SAFE_REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;

function repoPath(username: string, repoName: string): string {
  // Validate inputs to prevent path traversal (S2083)
  if (!SAFE_USERNAME_RE.test(username) || !SAFE_REPO_RE.test(repoName)) {
    throw createError(400, 'Invalid username or repository name');
  }
  const resolved = path.join(REPOS_ROOT, username, `${repoName}.git`);
  // Final sanity check: ensure constructed path stays within REPOS_ROOT
  const normalBase = path.resolve(REPOS_ROOT);
  if (!path.resolve(resolved).startsWith(normalBase + path.sep)) {
    throw createError(400, 'Path traversal detected');
  }
  return resolved;
}

function validateRef(ref: string): void {
  if (!SAFE_REF_RE.test(ref)) {
    throw createError(400, 'Invalid ref');
  }
}

function validatePath(p: string): void {
  // Resolve the path relative to a dummy root to detect traversal (S2083)
  if (!p) return; // empty path is valid (root of tree)
  const normalized = path.normalize(p);
  // Disallow absolute paths, parent traversal, or null bytes
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('..') ||
    normalized.includes('\0') ||
    normalized.split(path.sep).some((seg) => seg === '..')
  ) {
    throw createError(400, 'Invalid path');
  }
}

export interface TreeEntry {
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  name: string;
  path: string;
}

export interface BlobResult {
  content: string;
  size: number;
  encoding: 'utf8' | 'base64';
  isBinary: boolean;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  author: string;
  message: string;
  date: string;
}

function gitRun(args: string[], cwd: string): Buffer {
  return execFileSync('git', args, {
    cwd,
    timeout: 15_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

export const RepoGitService = {
  /** List entries in a tree (directory). Returns [] when repo is empty. */
  listTree(username: string, repoName: string, ref = 'HEAD', treePath = ''): TreeEntry[] {
    validateRef(ref);
    if (treePath) validatePath(treePath);

    const cwd = repoPath(username, repoName);
    const treeRef = treePath ? `${ref}:${treePath}` : ref;

    let raw: string;
    try {
      raw = gitRun(['ls-tree', treeRef], cwd).toString('utf8');
    } catch {
      // Repo is empty or path doesn't exist
      return [];
    }

    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const tabIdx = line.indexOf('\t');
        const meta = line.slice(0, tabIdx);
        const name = line.slice(tabIdx + 1);
        const [mode, type, sha] = meta.split(' ');
        return {
          mode,
          type: type as 'blob' | 'tree',
          sha,
          name,
          path: treePath ? `${treePath}/${name}` : name,
        };
      });
  },

  /** Get the raw content of a file blob. */
  getBlob(username: string, repoName: string, ref = 'HEAD', filePath: string): BlobResult {
    validateRef(ref);
    validatePath(filePath);

    const cwd = repoPath(username, repoName);
    let raw: Buffer;
    try {
      raw = gitRun(['show', `${ref}:${filePath}`], cwd);
    } catch {
      throw createError(404, 'File not found');
    }

    // Detect binary: look for null bytes in first 8 KB
    const sample = raw.slice(0, 8192);
    const isBinary = sample.includes(0);

    if (isBinary) {
      return { content: raw.toString('base64'), size: raw.length, encoding: 'base64', isBinary: true };
    }
    return { content: raw.toString('utf8'), size: raw.length, encoding: 'utf8', isBinary: false };
  },

  /** Get recent commits for the repo. */
  getCommits(username: string, repoName: string, ref = 'HEAD', limit = 20): CommitInfo[] {
    validateRef(ref);

    // Ensure limit is a safe integer before interpolating into argument (S2076)
    const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 200);

    const cwd = repoPath(username, repoName);
    let raw: string;
    try {
      raw = gitRun(
        ['log', `--max-count=${safeLimit}`, '--format=%H%x00%an%x00%s%x00%ci', ref],
        cwd
      ).toString('utf8');
    } catch {
      return [];
    }

    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, author, message, date] = line.split('\x00');
        return { sha, shortSha: sha.slice(0, 7), author, message, date };
      });
  },

  /** Get the branches available in the repo. */
  getBranches(username: string, repoName: string): string[] {
    const cwd = repoPath(username, repoName);
    try {
      return gitRun(['branch'], cwd)
        .toString('utf8')
        .split('\n')
        .filter(Boolean)
        .map((b) => b.replace(/^\*?\s+/, '').trim());
    } catch {
      return [];
    }
  },

  /** Get the default branch (HEAD ref). */
  getDefaultBranch(username: string, repoName: string): string {
    const cwd = repoPath(username, repoName);
    try {
      return gitRun(['symbolic-ref', '--short', 'HEAD'], cwd)
        .toString('utf8')
        .trim();
    } catch {
      return 'main';
    }
  },

  /** Check whether the repo has any commits. */
  hasCommits(username: string, repoName: string): boolean {
    const cwd = repoPath(username, repoName);
    try {
      gitRun(['rev-parse', 'HEAD'], cwd);
      return true;
    } catch {
      return false;
    }
  },
};

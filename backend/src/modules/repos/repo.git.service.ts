// git object retrieval service
// provides filesystem-level access to bare repositories
// implements secure path and reference validation
// orchestrates git cli calls for tree listing
// handles binary-safe blob extraction and format conversion
// retrieves commit history and branch metadata

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createError } from '../../middleware/errorHandler';

const REPOS_ROOT = process.env.REPOS_ROOT ?? '/repos';

// valid ref regex
const SAFE_REF_RE = /^[a-zA-Z0-9._\-/]+$/;

// valid username regex
const SAFE_USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;

// valid repo name regex
const SAFE_REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;

function repoPath(username: string, repoName: string): string {
  // input validation to prevent path traversal
  if (!SAFE_USERNAME_RE.test(username) || !SAFE_REPO_RE.test(repoName)) {
    throw createError(400, 'Invalid username or repository name');
  }
  const resolved = path.join(REPOS_ROOT, username, `${repoName}.git`);
  // final sanity check: ensure constructed path stays within repos_root
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
  // detection of path traversal
  if (!p) return; // empty path is valid (root of tree)
  const normalized = path.normalize(p);
  // disallow absolute paths, parent traversal, or null bytes
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('..') ||
    normalized.includes('\0') ||
    normalized.split(path.sep).includes('..')
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

import os from 'node:os';
const GIT_BIN = process.env.GIT_BIN_PATH || (os.platform() === 'win32' ? 'git' : '/usr/bin/git');

function gitRun(args: string[], cwd: string): Buffer {
  return execFileSync(GIT_BIN, args, {
    cwd,
    timeout: 15_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

export const RepoGitService = {
  // list entries in a tree
  listTree(username: string, repoName: string, ref = 'HEAD', treePath = ''): TreeEntry[] {
    validateRef(ref);
    if (treePath) validatePath(treePath);

    const cwd = repoPath(username, repoName);
    const treeRef = treePath ? `${ref}:${treePath}` : ref;

    let raw: string;
    try {
      raw = gitRun(['ls-tree', treeRef], cwd).toString('utf8');
    } catch {
      // repo is empty or path doesn't exist
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

  // get raw content of a file blob
  getBlob(username: string, repoName: string, filePath: string, ref = 'HEAD'): BlobResult {
    validateRef(ref);
    validatePath(filePath);

    const cwd = repoPath(username, repoName);
    let raw: Buffer;
    try {
      raw = gitRun(['show', `${ref}:${filePath}`], cwd);
    } catch {
      throw createError(404, 'File not found');
    }

    // detect binary: look for null bytes in first 8 kb
    const sample = raw.slice(0, 8192);
    const isBinary = sample.includes(0);

    if (isBinary) {
      return { content: raw.toString('base64'), size: raw.length, encoding: 'base64', isBinary: true };
    }
    return { content: raw.toString('utf8'), size: raw.length, encoding: 'utf8', isBinary: false };
  },

  // get recent commits
  getCommits(username: string, repoName: string, ref = 'HEAD', limit = 20): CommitInfo[] {
    validateRef(ref);

    // safe limit normalization
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

  // get repo branches
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

  // get default branch
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

  // check for commits
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

/**
 * useRepoPage.ts — Shared hook for [name].tsx and tree/[[...path]].tsx
 *
 * Extracts the common repo data loading, deploy/undeploy/delete actions,
 * Supabase realtime subscriptions, and copy-URL logic to avoid duplication.
 */

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { fetchApi, getCanonicalUsername, getToken, getTokenPayload } from '@/lib/api';
import { routes } from '@/lib/routes';
import { useToast } from '@/contexts/toast-context';
import { supabase } from '@/lib/supabase';
import { detectLanguage, TreeEntry } from '@/components/file-browser';

export interface RepoData {
  id: string;
  name: string;
  auto_deploy_enabled: boolean;
  created_at: string;
  git_url: string;
  active_deployment_id: string | null;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  author: string;
  message: string;
  date: string;
}

// ── Deploy step message resolver ─────────────────────────────────────────────

/**
 * Ordered table of [log-substring, UI-label] pairs.
 * Earlier entries take priority over later ones (first-match wins).
 */
const DEPLOY_STEP_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['strategy selected',    'Strategized' ],
  ['running vite build',   'Building'    ],
  ['npm run build',        'Building'    ],
  ['build:',               'Building'    ],
  ['compiled successfully','Built'       ],
  ['built in',             'Built'       ],
  ['output directory:',    'Built'       ],
  ['workspace removed',    'Cleaned'     ],
  ['cleanup',              'Cleaned'     ],
  ['upload complete',      'Uploaded'    ],
  ['uploading',            'Uploading'   ],  // after "upload complete" to avoid false match
  ['transferred',          'Transferred' ],
  ['transferring',         'Transferring'],  // after "transferred" to avoid false match
] satisfies Array<[string, string]>;

/**
 * Return the first human-readable UI label whose trigger keyword appears in
 * `rawMessage`, or an empty string if none match (no toast will be shown).
 */
function resolveStepLabel(rawMessage: string): string {
  const msg = rawMessage.toLowerCase();
  const match = DEPLOY_STEP_LABELS.find(([keyword]) => msg.includes(keyword));
  return match ? match[1] : '';
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRepoPage(repoName: string, treePath: string = '') {
  const router = useRouter();
  const { toast } = useToast();

  const [repo, setRepo] = useState<RepoData | null>(null);
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [readme, setReadme] = useState<string | null>(null);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [language, setLanguage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [undeploying, setUndeploying] = useState(false);
  const [activeDeploymentTask, setActiveDeploymentTask] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadRepoData = useCallback(async (name: string, path: string = '') => {
    try {
      const data = await fetchApi<RepoData>(`/api/repos/${name}`);
      setRepo(data);

      try {
        const tree = await fetchApi<TreeEntry[]>(`/api/repos/${name}/tree?ref=HEAD&path=${path}`);
        setEntries(tree);

        if (path === '') {
          setLanguage(detectLanguage(tree));
        } else {
          // Fetch root tree in background to detect overall repo language
          fetchApi<TreeEntry[]>(`/api/repos/${name}/tree?ref=HEAD&path=`)
            .then(rootTree => setLanguage(detectLanguage(rootTree)))
            .catch(console.error);
        }

        const rm = tree.find((e) => e.name.toLowerCase() === 'readme.md');
        if (rm) {
          const contents = await fetchApi<{ content: string }>(
            `/api/repos/${name}/blob?ref=HEAD&path=${rm.path}`
          );
          setReadme(contents.content);
        } else {
          setReadme(null);
        }
      } catch {
        setEntries([]);
      }

      try {
        const recentCommits = await fetchApi<CommitInfo[]>(`/api/repos/${name}/commits?ref=HEAD&limit=1000`);
        setCommits(recentCommits);
      } catch {
        setCommits([]);
      }
    } catch (err: unknown) {
      const error = err as { status?: number };
      if (error.status === 401) {
        router.push(routes.login);
      } else {
        toast('Repository not found', 'error');
        router.push(routes.dashboard);
      }
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!repoName) return;
    if (!getToken()) {
      router.push(routes.login);
      return;
    }

    void (async () => {
      const canonicalUsername = await getCanonicalUsername();
      if (canonicalUsername) {
        setUsername(canonicalUsername);
      } else {
        const payload = getTokenPayload();
        if (payload) setUsername(payload.username);
      }
      await loadRepoData(repoName, treePath);
    })();
  }, [repoName, treePath, router, loadRepoData]);

  // ── Realtime: broadcast deployment progress events ──────────────────────────

  useEffect(() => {
    if (!activeDeploymentTask) return;
    const channel = supabase.channel(`deployment:${activeDeploymentTask}`);

    channel.on('broadcast', { event: '*' }, (payload) => {
      const { event, payload: data } = payload;
      const prefix = repo?.active_deployment_id ? 'Redeployment' : 'Deployment';

      switch (event) {
        case 'deploy:start':
          toast(`${prefix} - Started`, 'info');
          break;

        case 'deploy:step': {
          const label = resolveStepLabel(String(data?.message ?? ''));
          if (label) toast(`${prefix} - ${label}`, 'info');
          break;
        }

        case 'deploy:success':
          toast(`${prefix} - Done!`, 'success');
          setDeploying(false);
          setActiveDeploymentTask(null);
          loadRepoData(repoName, treePath);
          break;

        case 'deploy:failed':
          toast(
            `${prefix} - Failed: ${String(data?.message || data?.error || 'Unknown error')}`,
            'error',
          );
          setDeploying(false);
          setActiveDeploymentTask(null);
          break;
      }
    }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeDeploymentTask, repoName, treePath, loadRepoData, toast, repo?.active_deployment_id]);

  // ── Realtime: auto-deploy trigger (DB INSERT on deployments table) ──────────

  useEffect(() => {
    if (!repo?.id) return;
    const channel = supabase.channel(`auto-deploy-${repo.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deployments', filter: `repository_id=eq.${repo.id}` },
        (payload) => {
          setActiveDeploymentTask(payload.new.id as string);
          setDeploying(true);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [repo?.id]);

  // ── Action handlers ─────────────────────────────────────────────────────────

  async function handleDeploy() {
    setDeploying(true);
    try {
      const res = await fetchApi<{ deploymentId: string }>(`/api/repos/${repoName}/deploy`, {
        method: 'POST',
      });
      toast('Deployment enqueued...', 'info');
      setActiveDeploymentTask(res.deploymentId);
    } catch (err: unknown) {
      toast((err as Error).message || 'Something went wrong with the deployment', 'error');
      setDeploying(false);
    }
  }

  async function handleUndeploy(currentPath: string = '') {
    if (!confirm('This will take your site offline. Are you sure?')) return;
    setUndeploying(true);
    try {
      await fetchApi(`/api/repos/${repoName}/deploy`, { method: 'DELETE' });
      toast('Site undeployed successfully', 'success');
      loadRepoData(repoName, currentPath);
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to undeploy', 'error');
    } finally {
      setUndeploying(false);
    }
  }

  async function handleDelete() {
    if (!confirm('This will permanently delete this repository and all its deployments. Are you sure?')) return;
    try {
      await fetchApi(`/api/repos/${repoName}`, { method: 'DELETE' });
      toast('Repository deleted', 'success');
      router.push(routes.dashboard);
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to delete', 'error');
    }
  }

  function handleCopyCloneUrl() {
    if (!repo) return;
    navigator.clipboard.writeText(repo.git_url).catch(console.error);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return {
    repo, entries, readme, commits, language,
    loading, username, deploying, undeploying, copied,
    loadRepoData,
    handleDeploy, handleUndeploy, handleDelete, handleCopyCloneUrl,
  };
}

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { fetchApi, getCanonicalUsername, getToken, getTokenPayload } from '@/lib/api';
import { routes } from '@/lib/routes';
import { useToast } from '@/contexts/toast-context';
import { FileBrowser, TreeEntry, detectLanguage } from '@/components/file-browser';
import { MarkdownContent } from '@/components/markdown-content';
import { BookOpen, Terminal, Trash2, Copy, Check, ExternalLink, Ship, PowerOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { BGPattern } from '@/components/ui/bg-pattern';

interface RepoData {
  id: string;
  name: string;
  auto_deploy_enabled: boolean;
  created_at: string;
  git_url: string;
  active_deployment_id: string | null;
}

interface CommitInfo {
  sha: string;
  shortSha: string;
  author: string;
  message: string;
  date: string;
}

export default function RepositoryPage() {
  const router = useRouter();
  const { name } = router.query as { name: string };

  const [repo, setRepo] = useState<RepoData | null>(null);
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [readme, setReadme] = useState<string | null>(null);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [language, setLanguage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [undeploying, setUndeploying] = useState(false);
  const [activeDeploymentTask, setActiveDeploymentTask] = useState<string | null>(null);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const loadRepoData = useCallback(async (repoName: string, path: string = '') => {
    try {
      const data = await fetchApi<RepoData>(`/api/repos/${repoName}`);
      setRepo(data);

      try {
        const tree = await fetchApi<TreeEntry[]>(`/api/repos/${repoName}/tree?ref=HEAD&path=${path}`);
        setEntries(tree);
        if (!path) setLanguage(detectLanguage(tree));

        const rm = tree.find((e) => e.name.toLowerCase() === 'readme.md');
        if (rm) {
          const contents = await fetchApi<{ content: string }>(
            `/api/repos/${repoName}/blob?ref=HEAD&path=${rm.path}`
          );
          setReadme(contents.content);
        } else {
          setReadme(null);
        }
      } catch {
        setEntries([]);
      }

      try {
        const recentCommits = await fetchApi<CommitInfo[]>(`/api/repos/${repoName}/commits?ref=HEAD&limit=1000`);
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

  useEffect(() => {
    if (!name) return;
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
      await loadRepoData(name);
    })();
  }, [name, router, loadRepoData]);

    async function handleDeploy() {
    setDeploying(true);
    try {
      const res = await fetchApi<{ deploymentId: string }>(`/api/repos/${name}/deploy`, {
        method: 'POST',
      });
      toast('Deployment enqueued...', 'info');
      setActiveDeploymentTask(res.deploymentId);
    } catch (err: unknown) {
      toast((err as Error).message || 'Something went wrong with the deployment', 'error');
      setDeploying(false);
    }
  }

  async function handleUndeploy() {
    if (!confirm('This will take your site offline. Are you sure?')) return;
    setUndeploying(true);
    try {
      await fetchApi(`/api/repos/${name}/deploy`, { method: 'DELETE' });
      toast('Site undeployed successfully', 'success');
      loadRepoData(name);
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to undeploy', 'error');
    } finally {
      setUndeploying(false);
    }
  }

  useEffect(() => {
    if (!activeDeploymentTask) return;
    const channel = supabase.channel(`deployment:${activeDeploymentTask}`);
    
    channel.on('broadcast', { event: '*' }, (payload) => {
        const { event, payload: data } = payload;
        const prefix = repo?.active_deployment_id ? 'Redeployment' : 'Deployment';
        
        switch(event) {
           case 'deploy:start': toast(`${prefix} - Started`, 'info'); break;
           case 'deploy:step': {
             const msg = data.message.toLowerCase();
             let uiMessage = '';
             
             if (msg.includes('strategy selected')) uiMessage = 'Strategized';
             else if (msg.includes('running vite build') || msg.includes('npm run build') || msg.includes('build:')) uiMessage = 'Building';
             else if (msg.includes('compiled successfully') || msg.includes('built in') || msg.includes('output directory:')) uiMessage = 'Built';
             else if (msg.includes('workspace removed') || msg.includes('cleanup')) uiMessage = 'Cleaned';
             else if (msg.includes('uploading')) uiMessage = 'Uploading';
             else if (msg.includes('upload complete')) uiMessage = 'Uploaded';
             else if (msg.includes('transferring')) uiMessage = 'Transferring';
             else if (msg.includes('transferred')) uiMessage = 'Transferred';

             if (uiMessage) {
               toast(`${prefix} - ${uiMessage}`, 'info');
             }
             break;
           }
           case 'deploy:success': 
             toast(`${prefix} - Done!`, 'success');
             setDeploying(false);
             setActiveDeploymentTask(null);
             loadRepoData(name);
             break;
           case 'deploy:failed':
             toast(`${prefix} - Failed: ${data.message || data.error}`, 'error');
             setDeploying(false);
             setActiveDeploymentTask(null);
             break;
        }
    }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeDeploymentTask, name, loadRepoData, toast, repo?.active_deployment_id]);

  useEffect(() => {
    if (!repo?.id) return;
    const channel = supabase.channel(`auto-deploy-${repo.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deployments', filter: `repository_id=eq.${repo.id}` },
        (payload) => {
          setActiveDeploymentTask(payload.new.id);
          setDeploying(true);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [repo?.id]);async function handleDelete() {
    if (!confirm('This will permanently delete this repository and all its deployments. Are you sure?')) return;
    try {
      await fetchApi(`/api/repos/${name}`, { method: 'DELETE' });
      toast('Repository deleted', 'success');
      router.push(routes.dashboard);
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to delete', 'error');
    }
  }

  function handleCopyCloneUrl() {
    if (!repo) return;
    navigator.clipboard.writeText(repo.git_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex-1 bg-background relative overflow-hidden flex flex-col items-center justify-center">
        <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.05)" />
        <Ship className="animate-bounce text-primary opacity-50" size={32} />
      </div>
    );
  }

  if (!repo) {
    return null; /* Handled by toast + redirect */
  }

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-x-hidden pb-12 sm:pb-20">
      <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.05)" />

      {/* Repo Header */}
      <div className="bg-background border-b border-white/5 py-8 mb-8 z-40 backdrop-blur-3xl">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-[0_0_15px_rgba(0,240,255,0.2)] border border-primary/20 shrink-0">
               <BookOpen size={24} />
             </div>
             <div className="min-w-0">
               <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
                   <h1 className="text-2xl md:text-3xl font-bold flex flex-wrap items-center">
                     <Link href={routes.dashboard} className="text-white break-all hover:text-primary transition-colors">{username}</Link>
                     <span className="text-muted-foreground/30 mx-2 font-normal shrink-0">/</span>
                     <span className="text-primary break-all">{repo.name}</span> 
                   </h1>
               </div>
             </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto shrink-0 flex-wrap">
              <div className="flex-1 sm:min-w-[320px] min-w-0 w-full">
                <button
                  className="w-full bg-background border border-primary/20 rounded-lg h-[42px] px-3 flex justify-between items-center gap-3 hover:border-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer text-left"
                  onClick={handleCopyCloneUrl}
                >
                  <div className="flex-1 flex items-center gap-2 min-w-0 overflow-hidden">
                    <Terminal size={14} className="text-primary shrink-0"/>
                    <code className="text-xs text-primary font-mono whitespace-nowrap block truncate min-w-0 w-full" title={repo.git_url}>
                      {repo.git_url}
                    </code>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap bg-secondary px-2 py-1 rounded select-none shrink-0 transition-colors flex items-center justify-center w-[28px] h-[24px]">
                    {copied ? <Check size={14} className="text-foreground" /> : <Copy size={14} />}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-2 lg:flex lg:flex-row items-center gap-3 shrink-0 w-full lg:w-auto flex-wrap">
                {repo.active_deployment_id ? (
                  <>
                    <a
                      href={`/api/live/${username}/${repo.active_deployment_id}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary flex items-center justify-center gap-2 shadow-lg shadow-primary/20 h-[42px] px-4 w-full lg:w-auto shrink-0 overflow-hidden text-sm"
                    >
                      <ExternalLink size={16} className="shrink-0" />
                      <span className="truncate">View Live</span>
                    </a>
                    <button
                      onClick={handleDeploy}
                      disabled={deploying}
                      className="btn-primary flex items-center justify-center gap-2 shadow-lg shadow-primary/20 h-[42px] px-4 w-full lg:w-auto shrink-0 overflow-hidden text-sm"
                    >
                      <Ship className={`shrink-0 ${deploying ? "animate-bounce" : ""}`} size={16} />
                      <span className="truncate">{deploying ? "Deploying" : "Redeploy"}</span>
                    </button>
                    <button
                      onClick={handleUndeploy}
                      disabled={undeploying}
                      className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors px-4 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-destructive/20 hover:border-destructive shadow-lg h-[42px] w-full lg:w-auto shrink-0 overflow-hidden"
                    >
                      {undeploying ? <Ship className="animate-bounce shrink-0" size={16} /> : <PowerOff size={16} className="shrink-0" />}
                      <span className="truncate">Undeploy</span>
                    </button>
                    <button 
                      onClick={handleDelete} 
                      className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors px-4 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-destructive/20 hover:border-destructive shadow-lg h-[42px] w-full lg:w-auto shrink-0 overflow-hidden"
                    >
                      <Trash2 size={16} className="shrink-0" />
                      <span className="truncate">Delete</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleDeploy}
                      disabled={deploying}
                      className="btn-primary flex items-center justify-center gap-2 shadow-lg shadow-primary/20 h-[42px] px-4 w-full lg:w-auto shrink-0"
                    >
                      <Ship className={deploying ? "animate-bounce" : ""} size={16} />
                      Deploy
                    </button>
                    <button 
                      onClick={handleDelete} 
                      className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors px-4 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-destructive/20 hover:border-destructive shadow-lg h-[42px] w-full lg:w-auto shrink-0"
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </>
                )}
              </div>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-8">

        {/* Main Content */}
        <div className="w-full space-y-8 min-w-0">
           <FileBrowser
             repoName={repo.name}
             entries={entries}
             currentPath={currentPath}
             commits={commits}
             language={language}
             onFolderDoubleClick={(path) => {
               const route = path ? routes.repoTree(name, path) : routes.repo(name);
               router.push(route);
             }}
           />

           {readme && (
             <div className="glass rounded-xl overflow-hidden shadow-lg border border-white/5">
                <div className="bg-secondary/40 px-4 py-3 border-b border-white/5 flex items-center gap-2 font-medium">
                  <BookOpen size={16} className="text-muted-foreground" /> README.md
                </div>
                <div className="p-8 prose prose-invert max-w-none prose-a:text-primary hover:prose-a:text-accent prose-headings:border-white/10 prose-hr:border-white/10 prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded prose-pre:bg-[#0b1528] prose-pre:border prose-pre:border-white/5">
                  <MarkdownContent content={readme} />
                </div>
             </div>
           )}
        </div>
        </div>
      </div>
    );
  }

// repository overview and exploration interface
// implements interactive file and directory browser
// provides deployment control and status management
// renders readme content with markdown support
// orchestrates clone url copying and deletion actions
import { useRouter } from 'next/router';
import { routes } from '@/lib/routes';
import { FileBrowser } from '@/components/fileBrowser';
import { MarkdownContent } from '@/components/markdownContent';
import { FolderCode, Ship } from 'lucide-react';
import { BGPattern } from '@/components/ui/bgPattern';
import { useRepoPage } from '@/hooks/useRepoPage';
import { RepoHeader } from '@/components/repoHeader';

export default function RepositoryPage() {
  const router = useRouter();
  const { name } = router.query as { name: string };

  const {
    repo, entries, readme, commits, language,
    loading, username, deploying, undeploying, copied,
    handleDeploy, handleUndeploy, handleDelete, handleEdit, handleCopyCloneUrl,
  } = useRepoPage(name, '');

  if (loading) {
    return (
      <div className="flex-1 bg-background relative overflow-hidden flex flex-col items-center justify-center">
        <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.05)" />
        <Ship className="animate-bounce text-primary opacity-50" size={32} />
      </div>
    );
  }

  if (!repo) {
    return null; /* handled by toast + redirect */
  }

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-x-hidden">
      <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.05)" />

      <RepoHeader
        repo={repo}
        username={username}
        deploying={deploying}
        undeploying={undeploying}
        copied={copied}
        onDeploy={handleDeploy}
        onUndeploy={() => handleUndeploy('')}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onCopy={handleCopyCloneUrl}
      />

      <div className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-8">
        <div className="w-full space-y-8 min-w-0">
          <FileBrowser
            repoName={repo.name}
            entries={entries}
            currentPath=""
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
                <FolderCode size={16} className="text-muted-foreground" /> README.md
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

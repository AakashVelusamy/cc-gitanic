import Link from 'next/link';
import { Folder, FileText, Clock } from 'lucide-react';
import { routes } from '@/lib/routes';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export interface TreeEntry {
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  name: string;
  path: string;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  author: string;
  message: string;
  date: string;
}

interface FileBrowserProps {
  repoName: string;
  entries: TreeEntry[];
  currentPath?: string;
  ref?: string;
  loading?: boolean;
  onFolderDoubleClick?: (path: string) => void;
  commits?: CommitInfo[];
}

export function FileBrowser({ repoName, entries, currentPath = '', ref = 'HEAD', loading, onFolderDoubleClick, commits = [] }: FileBrowserProps) {
  // Sort: directories first, then files, both alphabetical
  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Build breadcrumb parts
  const parts = currentPath ? currentPath.split('/') : [];

  const getTreeRoute = (path?: string) => routes.repoTree(repoName, path);
  const getBlobRoute = (path: string) => routes.repoBlob(repoName, path);

  if (loading) {
    return (
      <div className="glass rounded-xl overflow-hidden mb-6 border border-white/5 shadow-lg">
        <div className="bg-secondary/40 px-4 py-3 border-b border-white/5 flex items-center font-medium">
           <Folder size={18} className="text-muted-foreground mr-2" /> Source Code
        </div>
        <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
           <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (entries.length === 0 && !currentPath) {
    return (
      <div className="glass rounded-xl overflow-hidden mb-6 border border-white/5 shadow-lg">
        <div className="bg-secondary/40 px-4 py-3 border-b border-white/5 flex items-center font-medium">
           <Folder size={18} className="text-muted-foreground mr-2" /> Source Code
        </div>
        <div className="p-12 text-center flex flex-col items-center">
          <FileText className="text-muted-foreground opacity-50" size={32} />
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl overflow-hidden mb-6 border border-white/5 shadow-lg">
      <div className="bg-white/[0.02] px-4 py-3 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center flex-wrap gap-3 text-sm min-w-0">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                {parts.length === 0 ? (
                  <BreadcrumbPage className="flex items-center gap-1.5">
                    <Folder size={14} /> {repoName}
                  </BreadcrumbPage>
                ) : onFolderDoubleClick ? (
                  <BreadcrumbLink asChild>
                    <button onClick={() => onFolderDoubleClick('')} className="flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer">
                      <Folder size={14} /> {repoName}
                    </button>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={getTreeRoute()} className="flex items-center gap-1.5">
                      <Folder size={14} /> {repoName}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {parts.map((part, i) => {
                const partPath = parts.slice(0, i + 1).join('/');
                const isLast = i === parts.length - 1;
                return (
                  <span key={partPath} className="contents">
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage>{part}</BreadcrumbPage>
                      ) : onFolderDoubleClick ? (
                        <BreadcrumbLink asChild>
                          <button onClick={() => onFolderDoubleClick(partPath)} className="bg-transparent border-none p-0 cursor-pointer">{part}</button>
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link href={getTreeRoute(partPath)}>{part}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </span>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
          {commits && commits.length > 0 && (
            <div className="flex items-center min-w-0 flex-1 truncate">
              <span className="text-xs text-muted-foreground truncate" title={commits[0].message}>
                {commits[0].message}
              </span>
            </div>
          )}
        </div>
        {commits && commits.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground w-fit shrink-0 px-3 py-1 bg-background/50 rounded-full border border-white/5 self-end md:self-auto">
             <Clock size={12} className="text-muted-foreground/70" />
             <span className="font-medium">{commits.length} commit{commits.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <tbody>
            {/* Parent directory link */}
            {currentPath && (
              <tr 
                className="border-b border-white/5 hover:bg-white/5 transition-colors group cursor-pointer"
                onClick={() => {
                  if (onFolderDoubleClick) {
                    onFolderDoubleClick(parts.length > 1 ? parts.slice(0, -1).join('/') : '');
                  }
                }}
              >
                <td className="py-2.5 px-4">
                  {onFolderDoubleClick ? (
                    <div className="flex items-center gap-3 text-primary group-hover:text-accent transition-colors font-medium text-sm">
                      <Folder size={18} className="text-muted-foreground" />
                      ..
                    </div>
                  ) : (
                    <Link
                      href={
                        parts.length > 1
                          ? getTreeRoute(parts.slice(0, -1).join('/'))
                          : getTreeRoute()
                      }
                      className="flex items-center gap-3 text-primary group-hover:text-accent transition-colors font-medium text-sm"
                    >
                      <Folder size={18} className="text-muted-foreground" />
                      ..
                    </Link>
                  )}
                </td>
                <td className="py-2.5 px-4 text-right"></td>
              </tr>
            )}

            {sorted.map((entry) => {
              const href =
                entry.type === 'tree'
                  ? getTreeRoute(entry.path)
                  : getBlobRoute(entry.path);

              return (
                <tr 
                  key={entry.sha + entry.name} 
                  className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors group cursor-pointer"
                  onClick={() => {
                      if (entry.type === 'tree' && onFolderDoubleClick) {
                          onFolderDoubleClick(entry.path);
                      }
                  }}
                >
                  <td className="py-2.5 px-4">
                    {entry.type === 'tree' && onFolderDoubleClick ? (
                      <div className="flex items-center gap-3 text-foreground group-hover:text-primary transition-colors text-sm">
                        <Folder size={18} className="text-muted-foreground group-hover:text-primary/70 transition-colors" />
                        <span className="truncate">{entry.name}</span>
                      </div>
                    ) : (
                      <Link href={href} className="flex items-center gap-3 text-foreground group-hover:text-primary transition-colors text-sm">
                        {entry.type === 'tree' ? (
                          <Folder size={18} className="text-muted-foreground group-hover:text-primary/70 transition-colors" />
                        ) : (
                          <FileText size={18} className="text-muted-foreground/70 group-hover:text-primary/70 transition-colors" />
                        )}
                        <span className="truncate">{entry.name}</span>
                      </Link>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <code className="text-xs font-mono text-muted-foreground/60 bg-transparent px-0 py-0">
                      {entry.sha.slice(0, 7)}
                    </code>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

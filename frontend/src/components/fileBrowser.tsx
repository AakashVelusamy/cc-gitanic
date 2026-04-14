// repository file exploration component
// implements interactive directory traversal
// provides visual breadcrumbs for current path
// displays commit counts and repository language badges
// supports both client-side and route-based navigation
// highlights file types and entry hash metadata
import Link from 'next/link';
import { Folder, FileText, Clock, Ship } from 'lucide-react';
import { routes } from '@/lib/routes';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadCrumbs';

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

type FileBrowserProps = Readonly<{
  repoName: string;
  entries: TreeEntry[];
  currentPath?: string;
  loading?: boolean;
  onFolderDoubleClick?: (path: string) => void;
  commits?: CommitInfo[];
  language?: string | null;
}>;

const LANG_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  'Vite':     { dot: 'bg-amber-400',  label: 'vite',  text: 'text-amber-400'  },
  'React.js': { dot: 'bg-cyan-400',   label: 'react', text: 'text-cyan-400'   },
  'HTML':     { dot: 'bg-orange-400', label: 'html',  text: 'text-orange-400' },
  'JS':       { dot: 'bg-yellow-400', label: 'js',    text: 'text-yellow-400' },
  'CSS':      { dot: 'bg-blue-400',   label: 'css',   text: 'text-blue-400'   },
};

export function LanguageBadge({ language, size = 'md' }: Readonly<{ language: string; size?: 'sm' | 'md' }>) {
  const style = LANG_STYLES[language];
  if (!style) return null;
  return (
    <div className={`flex items-center gap-1.5 w-fit shrink-0 bg-background/50 rounded-full border border-white/5 ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
      <span className={`font-medium font-mono ${style.text}`}>{style.label}</span>
    </div>
  );
}

export function detectLanguage(entries: TreeEntry[]): string | null {
  const blobs = new Set(
    entries.filter(e => e.type === 'blob').map(e => e.name.toLowerCase())
  );
  if (blobs.has('vite.config.js') || blobs.has('vite.config.ts') || blobs.has('vite.config.mts')) return 'Vite';
  if (blobs.has('package.json')) return 'React.js';
  if (blobs.has('index.html')) return 'HTML';
  if ([...blobs].some(f => f.endsWith('.js'))) return 'JS';
  if ([...blobs].some(f => f.endsWith('.css'))) return 'CSS';
  return null;
}

export function FileBrowser({ repoName, entries, currentPath = '', loading, onFolderDoubleClick, commits = [], language }: FileBrowserProps) {
  // sort: directories first, then files, both alphabetical
  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // build breadcrumb parts
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
           <Ship className="animate-bounce text-primary opacity-50" size={32} />
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
      <div className="bg-white/[0.02] px-4 py-3 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3">
        {/* left: breadcrumb + last commit message */}
        <div className="flex items-center flex-wrap gap-2 text-[11px] sm:text-sm min-w-0 overflow-hidden">
          <Breadcrumb>
            <BreadcrumbList className="text-[11px] sm:text-sm flex-nowrap">
              <BreadcrumbItem>
                {(() => {
                  if (parts.length === 0) {
                    return (
                      <BreadcrumbPage className="flex items-center gap-1 sm:gap-1.5">
                        <Folder size={12} className="sm:hidden" />
                        <Folder size={14} className="hidden sm:block" />
                        <span className="max-w-[80px] sm:max-w-none truncate">{repoName}</span>
                      </BreadcrumbPage>
                    );
                  }
                  const rootContent = onFolderDoubleClick ? (
                    <BreadcrumbLink asChild>
                      <button onClick={() => onFolderDoubleClick('')} className="flex items-center gap-1 sm:gap-1.5 bg-transparent border-none p-0 cursor-pointer">
                        <Folder size={12} className="sm:hidden" />
                        <Folder size={14} className="hidden sm:block" />
                        <span className="max-w-[60px] sm:max-w-none truncate">{repoName}</span>
                      </button>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={getTreeRoute()} className="flex items-center gap-1 sm:gap-1.5">
                        <Folder size={12} className="sm:hidden" />
                        <Folder size={14} className="hidden sm:block" />
                        <span className="max-w-[60px] sm:max-w-none truncate">{repoName}</span>
                      </Link>
                    </BreadcrumbLink>
                  );
                  return rootContent;
                })()}
              </BreadcrumbItem>
              {parts.map((part, i) => {
                const partPath = parts.slice(0, i + 1).join('/');
                const isLast = i === parts.length - 1;
                const partLink = onFolderDoubleClick ? (
                  <BreadcrumbLink asChild>
                    <button onClick={() => onFolderDoubleClick(partPath)} className="bg-transparent border-none p-0 cursor-pointer max-w-[50px] sm:max-w-[100px] truncate block">{part}</button>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={getTreeRoute(partPath)} className="max-w-[50px] sm:max-w-[100px] truncate block">{part}</Link>
                  </BreadcrumbLink>
                );
                return (
                  <span key={partPath} className="contents">
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage className="max-w-[60px] sm:max-w-[120px] truncate block">{part}</BreadcrumbPage>
                      ) : partLink}
                    </BreadcrumbItem>
                  </span>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
          {commits && commits.length > 0 && (
            <div className="hidden sm:flex items-center min-w-0 flex-1 truncate">
              <span className="text-xs text-muted-foreground truncate" title={commits[0].message}>
                {commits[0].message}
              </span>
            </div>
          )}
        </div>

        {/* right: language badge + commits pill */}
        {commits && commits.length > 0 && (
          <div className="flex items-center justify-between gap-2 w-full md:w-auto shrink-0 mt-1 md:mt-0">
            <div>
              {language && <LanguageBadge language={language} />}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground w-fit px-3 py-1 bg-background/50 rounded-full border border-white/5 mx-0 md:ml-2">
               <Clock size={12} className="text-muted-foreground/70" />
               <span className="font-medium">{commits.length} commit{commits.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        )}
      </div>

      {/* table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <tbody>
            {/* parent directory link */}
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
              const entryIcon = entry.type === 'tree'
                ? <Folder size={18} className="text-muted-foreground group-hover:text-primary/70 transition-colors" />
                : <FileText size={18} className="text-muted-foreground/70 group-hover:text-primary/70 transition-colors" />;

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
                        {entryIcon}
                        <span className="truncate">{entry.name}</span>
                      </div>
                    ) : (
                      <Link href={href} className="flex items-center gap-3 text-foreground group-hover:text-primary transition-colors text-sm">
                        {entryIcon}
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

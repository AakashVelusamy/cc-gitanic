// repository file viewer and syntax highlighter
// manages blob content retrieval and encoding
// implements multi-language syntax highlighting
// providing image previews and binary file handling
// orchestrates markdown rendering and file downloads
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { fetchApi, getToken } from '@/lib/api';
import { routes } from '@/lib/routes';
import { useToast } from '@/contexts/toast-context';
import { MarkdownContent } from '@/components/markdown-content';
import { ChevronRight, Folder, Copy, Check, Download, ArrowLeft, Image as ImageIcon, FileCode, Binary, Ship } from 'lucide-react';
import Link from 'next/link';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { BGPattern } from '@/components/ui/bg-pattern';

interface BlobResult {
  content: string;
  size: number;
  encoding: 'utf8' | 'base64';
  isBinary: boolean;
}

/** map file extensions to react-syntax-highlighter language identifiers */
function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
    java: 'java', kt: 'kotlin', swift: 'swift', cs: 'csharp',
    cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
    html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
    css: 'css', scss: 'scss', sass: 'sass', less: 'less',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', mdx: 'markdown',
    sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
    sql: 'sql', graphql: 'graphql', gql: 'graphql',
    dockerfile: 'docker', docker: 'docker',
    makefile: 'makefile', cmake: 'cmake',
    ini: 'ini', conf: 'ini', env: 'bash',
    php: 'php', lua: 'lua', r: 'r', dart: 'dart',
    vue: 'html', svelte: 'html',
    gitignore: 'bash', editorconfig: 'ini',
  };
  // handle special filenames
  const name = filename.toLowerCase();
  if (name === 'dockerfile') return 'docker';
  if (name === 'makefile') return 'makefile';
  return map[ext] || 'text';
}

/** check if the file is an image based on extension */
function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif'].includes(ext);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function renderFileContent(
  blob: BlobResult,
  isImage: boolean,
  isMarkdown: boolean,
  language: string,
  fileName: string,
  handleDownload: () => void,
): React.ReactNode {
  if (blob.isBinary && isImage) {
    return (
      <div className="p-8 flex flex-col items-center justify-center bg-[#0b1528]/50">
        <div className="rounded-lg overflow-hidden border border-white/10 shadow-xl max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/${fileName.split('.').pop()};base64,${blob.content}`}
            alt={fileName}
            className="max-w-full max-h-[600px] object-contain"
          />
        </div>
        <p className="text-muted-foreground text-sm mt-4">{fileName} - {formatBytes(blob.size)}</p>
      </div>
    );
  }
  if (blob.isBinary) {
    return (
      <div className="p-16 text-center flex flex-col items-center">
        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
          <Binary className="text-muted-foreground" size={32} />
        </div>
        <h3 className="text-lg font-semibold mb-2">Binary file</h3>
        <p className="text-muted-foreground text-sm mb-4">
          This file is {formatBytes(blob.size)} and cannot be displayed as text.
        </p>
        <button onClick={handleDownload} className="btn-secondary inline-flex items-center gap-2">
          <Download size={16} />
          Download
        </button>
      </div>
    );
  }
  if (isMarkdown) {
    return (
      <div className="p-8 prose prose-invert max-w-none prose-a:text-primary hover:prose-a:text-accent prose-headings:border-white/10 prose-hr:border-white/10 prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded prose-pre:bg-[#0b1528] prose-pre:border prose-pre:border-white/5">
        <MarkdownContent content={blob.content} />
      </div>
    );
  }
  return (
    <SyntaxHighlighter
      language={language}
      style={vscDarkPlus}
      showLineNumbers
      wrapLongLines
      customStyle={{ margin: 0, borderRadius: 0, background: 'transparent', fontSize: '13px', lineHeight: '1.6' }}
      lineNumberStyle={{ minWidth: '3.5em', paddingRight: '1em', color: 'rgba(255,255,255,0.15)', userSelect: 'none' }}
    >
      {blob.content}
    </SyntaxHighlighter>
  );
}

export default function BlobPage() {
  const router = useRouter();
  const { name, path: pathSegments } = router.query;

  const repoName = name as string;
  const filePath = Array.isArray(pathSegments) ? pathSegments.join('/') : (pathSegments ?? '');
  const fileName = filePath.split('/').pop() ?? '';

  const [blob, setBlob] = useState<BlobResult | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const loadBlob = useCallback(async () => {
    if (!repoName || !filePath) return;
    try {
      const data = await fetchApi<BlobResult>(
        `/api/repos/${repoName}/blob?ref=HEAD&path=${encodeURIComponent(filePath)}`
      );
      setBlob(data);
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (e.status === 401) {
        router.push(routes.login);
      } else {
        toast(e.message || 'Failed to load file', 'error');
        router.push(routes.repo(repoName));
      }
    } finally {
      setLoading(false);
    }
  }, [repoName, filePath, router, toast]);

  useEffect(() => {
    if (!repoName || !filePath) return;
    if (!getToken()) {
      router.push(routes.login);
      return;
    }
    loadBlob().catch(() => undefined);
  }, [repoName, filePath, router, loadBlob]);

  function handleCopy() {
    if (!blob || blob.isBinary) return;
    navigator.clipboard.writeText(blob.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    if (!blob) return;
    const bytes = blob.encoding === 'base64'
      ? Uint8Array.from(atob(blob.content), c => c.codePointAt(0) ?? 0)
      : new TextEncoder().encode(blob.content);
    const blobObj = new Blob([bytes]);
    const url = URL.createObjectURL(blobObj);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  // breadcrumb parts
  const pathParts = filePath ? filePath.split('/') : [];

  // loading state
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4.5rem)] bg-background relative overflow-hidden flex flex-col">
        <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.05)" />
        <div className="flex-1 flex items-center justify-center">
          <Ship className="animate-bounce text-primary opacity-50" size={32} />
        </div>
      </div>
    );
  }

  // error state
  if (!blob) {
    return null; // handled by toast + redirect
  }

  const language = getLanguage(fileName);
  const isImage = isImageFile(fileName);
  const isMarkdown = fileName.toLowerCase().endsWith('.md') || fileName.toLowerCase().endsWith('.mdx');
  const isText = !blob.isBinary;
  const lineCount = isText ? blob.content.split('\n').length : 0;

  // pre-computed for the file info bar (avoids nested ternaries in jsx)
  let fileTypeIcon: React.ReactNode;
  let fileTypeLabel: string;
  if (!blob.isBinary) {
    fileTypeIcon = <FileCode size={14} />;
    fileTypeLabel = `${lineCount} lines`;
  } else if (isImage) {
    fileTypeIcon = <ImageIcon size={14} />;
    fileTypeLabel = 'Image';
  } else {
    fileTypeIcon = <Binary size={14} />;
    fileTypeLabel = 'Binary file';
  }

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-x-hidden pb-12 sm:pb-20">
      <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.05)" />

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 mt-6 pb-6">
        {/* back link */}
        <Link
          href={
            pathParts.length > 1
              ? routes.repoTree(repoName, pathParts.slice(0, -1).join('/'))
              : routes.repo(repoName)
          }
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
        >
          <ArrowLeft size={16} />

        </Link>

        {/* breadcrumb navigation */}
        <div className="glass rounded-xl overflow-hidden border border-white/5 shadow-lg">
          {/* header bar with breadcrumbs and actions */}
          <div className="bg-secondary/40 px-4 py-3 border-b border-white/5 flex items-center justify-between gap-4">
            <div className="flex items-center flex-wrap gap-1 text-sm min-w-0">
              <Link
                href={routes.repo(repoName)}
                className="font-semibold text-primary hover:text-accent transition-colors flex items-center gap-2 shrink-0"
              >
                <Folder size={16} />
                {repoName}
              </Link>
              {pathParts.map((part, i) => {
                const partPath = pathParts.slice(0, i + 1).join('/');
                const isLast = i === pathParts.length - 1;
                return (
                  <span key={partPath} className="flex items-center gap-1 text-muted-foreground min-w-0">
                    <ChevronRight size={14} className="mx-0.5 opacity-50 shrink-0" />
                    {isLast ? (
                      <span className="font-semibold text-foreground truncate">{part}</span>
                    ) : (
                      <Link
                        href={routes.repoTree(repoName, partPath)}
                        className="text-primary hover:text-accent transition-colors"
                      >
                        {part}
                      </Link>
                    )}
                  </span>
                );
              })}
            </div>

            {/* action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {!blob.isBinary && (
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-white/5 transition-all"
                  title="Copy file content"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
              )}
              <button
                onClick={handleDownload}
                className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-white/5 transition-all"
                title="Download file"
              >
                <Download size={16} />
              </button>
            </div>
          </div>

          {/* file info bar */}
          <div className="bg-secondary/20 px-4 py-2 border-b border-white/5 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                {fileTypeIcon}{fileTypeLabel}
              </span>
              <span>{formatBytes(blob.size)}</span>
              {!blob.isBinary && (
                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20 font-mono">
                  {language}
                </span>
              )}
            </div>
          </div>

          {/* file content */}
          <div className="overflow-x-auto">
            {renderFileContent(blob, isImage, isMarkdown, language, fileName, handleDownload)}
          </div>
        </div>
      </main>
    </div>
  );
}

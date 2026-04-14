// repository action header component
// displays repository identity and ownership path
// provides git clone url interaction and feedback
// orchestrates deployment status and control actions
// manages repository lifecycle triggers like deletion

import React from 'react';
import Link from 'next/link';
import { FolderCode, Terminal, Trash2, Copy, Check, ExternalLink, Ship, PowerOff, Edit2 } from 'lucide-react';
import { routes } from '@/lib/routes';
import { RepoData } from '@/hooks/useRepoPage';

interface RepoHeaderProps {
  readonly repo: RepoData;
  readonly username: string;
  readonly deploying: boolean;
  readonly undeploying: boolean;
  readonly copied: boolean;
  readonly onDeploy: () => void;
  readonly onUndeploy: () => void;
  readonly onDelete: () => void;
  readonly onEdit: () => void;
  readonly onCopy: () => void;
}

export function RepoHeader({
  repo, username, deploying, undeploying, copied,
  onDeploy, onUndeploy, onDelete, onEdit, onCopy,
}: Readonly<RepoHeaderProps>) {
  return (
    <div className="bg-background border-b border-white/5 py-8 mb-8 z-40 backdrop-blur-3xl">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-primary/20 shrink-0">
            <FolderCode size={24} />
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
              onClick={onCopy}
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
                  href={`/api/live/${username}/${repo.name}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary flex items-center justify-center gap-2 shadow-lg shadow-primary/20 h-[42px] px-4 w-full lg:w-auto shrink-0 overflow-hidden text-sm"
                >
                  <ExternalLink size={16} className="shrink-0" />
                  <span className="truncate">View Live</span>
                </a>
                <button
                  onClick={onDeploy}
                  disabled={deploying}
                  className="btn-primary flex items-center justify-center gap-2 shadow-lg shadow-primary/20 h-[42px] px-4 w-full lg:w-auto shrink-0 overflow-hidden text-sm"
                >
                  <Ship className={`shrink-0 ${deploying ? 'animate-bounce' : ''}`} size={16} />
                  <span className="truncate">{deploying ? 'Deploying' : 'Redeploy'}</span>
                </button>
                <button
                  onClick={onUndeploy}
                  disabled={undeploying}
                  className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors px-4 rounded-lg flex items-center justify-center gap-2 text-sm font-medium border border-destructive/20 hover:border-destructive shadow-lg h-[42px] w-full lg:w-auto shrink-0 overflow-hidden"
                >
                  {undeploying ? <Ship className="animate-bounce shrink-0" size={16} /> : <PowerOff size={16} className="shrink-0" />}
                  <span className="truncate">Undeploy</span>
                </button>
                <div className="flex items-center gap-2 h-[42px] w-full lg:w-auto shrink-0">
                  <button
                    onClick={onEdit}
                    className="bg-secondary/50 text-foreground hover:bg-white/10 transition-colors rounded-lg flex-1 lg:w-[46px] flex items-center justify-center border border-white/10 hover:border-white/20 shadow-lg h-full"
                    title="Edit Repository Name"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={onDelete}
                    className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors rounded-lg flex-1 lg:w-[46px] flex items-center justify-center border border-destructive/20 hover:border-destructive shadow-lg h-full"
                    title="Delete Repository"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={onDeploy}
                  disabled={deploying}
                  className="btn-primary flex items-center justify-center gap-2 shadow-lg shadow-primary/20 h-[42px] px-4 w-full lg:w-auto shrink-0"
                >
                  <Ship className={deploying ? 'animate-bounce' : ''} size={16} />
                  Deploy
                </button>
                <div className="flex items-center gap-2 h-[42px] w-full lg:w-auto shrink-0">
                  <button
                    onClick={onEdit}
                    className="bg-secondary/50 text-foreground hover:bg-white/10 transition-colors rounded-lg flex-1 lg:w-[46px] flex items-center justify-center border border-white/10 hover:border-white/20 shadow-lg h-full"
                    title="Edit Repository Name"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={onDelete}
                    className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors rounded-lg flex-1 lg:w-[46px] flex items-center justify-center border border-destructive/20 hover:border-destructive shadow-lg h-full"
                    title="Delete Repository"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

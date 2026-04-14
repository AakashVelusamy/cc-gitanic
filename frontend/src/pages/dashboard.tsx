// user central dashboard
// lists and filters user repositories
// implements real-time "time-ago" updates
// displays repository language and deployment status
// provides navigation to detailed repository views
// facilitates quick creation of new repositories
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { fetchApi, getToken } from '@/lib/api';
import { routes } from '@/lib/routes';
import { useToast } from '@/contexts/toastContext';
import { Code2, Search, PlusCircle, Ship, Clock } from 'lucide-react';
import { detectLanguage, LanguageBadge, TreeEntry } from '@/components/fileBrowser';
import Link from 'next/link';
import { BGPattern } from '@/components/ui/bgPattern';

interface Repo {
  id: string;
  name: string;
  auto_deploy_enabled: boolean;
  created_at: string;
  updated_at?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoLanguages, setRepoLanguages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      router.push(routes.login);
      return;
    }
    fetchDashboardData().catch(() => undefined);

    // refresh time display every minute
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, [router]);

  async function fetchDashboardData() {
    try {
      const data = await fetchApi<Repo[]>('/api/repos');
      const sorted = data.toSorted((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
      setRepos(sorted);
      if (sorted.length === 0) {
        toast('No Repositories Yet', 'info');
      } else {
        // fetch languages in parallel (fire-and-forget: each card updates independently)
        void Promise.all(sorted.map(async (repo) => {
          try {
            const tree = await fetchApi<TreeEntry[]>(`/api/repos/${repo.name}/tree?ref=HEAD&path=`);
            const lang = detectLanguage(tree);
            if (lang) {
              setRepoLanguages(prev => ({ ...prev, [repo.id]: lang }));
            }
          } catch {
            // ignore individual repo language fetch failures
          }
        }));
      }
    } catch {
      toast('Failed To Load Repositories', 'error');
    } finally {
      setLoading(false);
    }
  }

  const filteredRepos = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? repos.filter((r) => r.name.toLowerCase().includes(q)) : repos;
  }, [filter, repos]);

  // map repo ids to time-ago strings
  const repoTimes = useMemo(
    () => Object.fromEntries(
      repos.map(r => [r.id, timeAgo(r.updated_at || r.created_at)])
    ),
    [repos, tick]
  );

  if (loading) {
    return (
      <div className="flex-1 bg-background relative overflow-hidden flex flex-col">
        <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.05)" />
        <div className="flex-1 flex items-center justify-center">
          <Ship className="animate-bounce text-primary opacity-50" size={32} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-x-hidden">
      <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.05)" />
      <div className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div className="relative w-full md:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-3rem)/4)] shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              type="text"

              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full bg-secondary/30 border border-white/10 rounded-lg h-[42px] pl-10 pr-4 text-sm focus:outline-none focus:border-primary/50 focus:bg-secondary/50 transition-colors"
            />
          </div>
          <Link href={routes.newRepo} className="w-full sm:w-auto btn-primary h-[42px] px-4 shadow-md items-center justify-center text-sm font-medium gap-2 hidden sm:flex shrink-0">
            <PlusCircle size={16} /> New Repository
          </Link>
        </div>

        {repos.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredRepos.map((repo) => (
              <Link key={repo.id} href={routes.repo(repo.name)} className="glass glass-hover px-5 py-4 rounded-xl border border-white/5 flex flex-col justify-between group gap-3 min-w-0">
                <div className="flex items-center gap-2 font-semibold text-foreground group-hover:text-primary transition-colors pr-2 min-w-0 w-full justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Code2 size={16} className="text-muted-foreground group-hover:text-primary shrink-0" />
                    <span className="truncate">{repo.name}</span>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${repo.auto_deploy_enabled ? 'bg-emerald-400' : 'bg-muted-foreground/50'}`}></span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                    <Clock size={12} />
                    <span className="whitespace-nowrap">{repoTimes[repo.id]}</span>
                  </div>
                  {repoLanguages[repo.id] && (
                    <LanguageBadge language={repoLanguages[repo.id]} size="sm" />
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* mobile fab for new repo */}
      <div className="fixed bottom-24 right-4 z-40 sm:hidden">
        <Link
          href={routes.newRepo}
          className="btn-primary w-12 h-12 rounded-full flex items-center justify-center shadow-lg shadow-black/40"
          title="New Repository"
        >
          <PlusCircle size={22} />
        </Link>
      </div>
    </div>
  );
}

function numToWords(n: number): string {
  if (n === 0) return 'zero';
  const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  if (n < 20) return a[n];
  if (n < 100) return b[Math.floor(n / 10)] + (n % 10 === 0 ? '' : ' ' + a[n % 10]);

  // basic thousands/hundreds mapping just in case, though max needed is likely < 100
  if (n < 1000) return a[Math.floor(n / 100)] + ' hundred' + (n % 100 === 0 ? '' : ' ' + numToWords(n % 100));
  return n.toString();
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (mins < 1) return 'zero minutes ago';
  if (mins < 60) return `${numToWords(mins)} minute${mins === 1 ? '' : 's'} ago`;
  if (hours < 24) return `${numToWords(hours)} hour${hours === 1 ? '' : 's'} ago`;
  if (days < 30) return `${numToWords(days)} day${days === 1 ? '' : 's'} ago`;
  if (months < 12) return `${numToWords(months)} month${months === 1 ? '' : 's'} ago`;
  return `${numToWords(years)} year${years === 1 ? '' : 's'} ago`;
}




import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { fetchApi, getCanonicalUsername, getToken, getTokenPayload } from '@/lib/api';
import { routes } from '@/lib/routes';
import { useToast } from '@/contexts/toast-context';
import { PlusCircle, Ship } from 'lucide-react';
import { BGPattern } from '@/components/ui/bg-pattern';

interface Repo {
  id: string;
  name: string;
}

export default function NewRepositoryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
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
    })();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    try {
      const repo = await fetchApi<Repo>('/api/repos', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      router.push(routes.repo(repo.name));
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast(e.message || 'Failed to create repository', 'error');
      setCreating(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-x-hidden pb-12 sm:pb-20">
      <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.05)" />
      <div className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col">
        <div className="text-center mb-8 sm:mb-10">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
            <PlusCircle size={24} className="sm:size-32 text-primary" />
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground mb-2 sm:mb-4">Create a Repository</h1>
          <p className="text-muted-foreground text-sm sm:text-lg">
          </p>
        </div>

        <div className="flex justify-center pt-0">
          <div className="w-full max-w-2xl">

          <div className="glass rounded-2xl p-6 sm:p-8 shadow-2xl">
            

            <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2" htmlFor="repo-name">
                  Repository Name <span className="text-destructive">*</span>
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-2 mb-2">
                  <span className="w-full sm:w-auto text-muted-foreground px-3 sm:px-4 h-[42px] flex items-center bg-secondary/30 border border-white/5 rounded-xl text-sm sm:text-base">
                    {username} <span className="text-white/20 mx-1">/</span>
                  </span>
                  <input
                    id="repo-name"
                    type="text"
                    value={name}
                    onChange={(e) =>
                      setName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))
                    }
                    
                    required
                    autoFocus
                    className="w-full sm:flex-1 h-[42px] bg-secondary/50 border border-white/10 rounded-xl px-3 sm:px-4 text-sm sm:text-base text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                </p>
              </div>

              <div className="border-t border-white/10 pt-6 sm:pt-8 flex flex-col-reverse sm:flex-row justify-end items-stretch sm:items-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push(routes.dashboard)}
                  className="h-[42px] px-4 sm:px-6 text-sm font-medium rounded-xl bg-secondary/80 text-foreground hover:bg-secondary transition-colors order-2 sm:order-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary h-[42px] px-4 sm:px-6 text-sm font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2"
                  disabled={creating || !name.trim()}
                >
                  {creating ? (
                    <span className="flex items-center justify-center gap-2">
                      <Ship className="animate-bounce" size={16} /> 
                      <span className="hidden sm:inline">Creating...</span>
                    </span>
                  ) : (
                    <>
                      <span className="hidden sm:inline">Create Repository</span>
                      <span className="sm:hidden">Create</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

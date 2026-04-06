import { useRouter } from 'next/router';
import { clearToken, getCanonicalUsername, getToken, getTokenPayload } from '@/lib/api';
import { routes } from '@/lib/routes';
import { LogOut } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function Navbar() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!getToken()) {
          setUsername(null);
          return;
        }

        const canonicalUsername = await getCanonicalUsername();
        if (cancelled) return;

        if (canonicalUsername) {
          setUsername(canonicalUsername);
          return;
        }

        const payload = getTokenPayload();
        setUsername(payload?.username ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    clearToken();
    router.push(routes.login);
  };

  return (
    <nav className="glass sticky top-0 z-50 mb-8 border border-white/5 rounded-b-2xl backdrop-blur-xl">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <Link href={routes.dashboard} className="flex items-center gap-2 group">
              <div className="w-8 h-8 flex items-center justify-center group-hover:drop-shadow-[0_0_10px_rgba(0,240,255,0.8)] transition-all duration-300">
                <Image
                  src="/logo.png"
                  alt="Gitanic"
                  width={32}
                  height={32}
                  priority
                  className="w-8 h-8 object-contain"
                />
              </div>
            </Link>
          </div>

          {/* Nav Right */}
          <div className="flex items-center gap-4">
            {!loading && username ? (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium">
                  <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center border border-primary/20 text-xs">
                    {username.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:block">{username}</span>
                </div>
                <button
                  className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={handleLogout}
                  title="Logout"
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : !loading && !username ? (
              <div className="flex items-center gap-3">
                <Link href={routes.login} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Log in
                </Link>
                <Link href={routes.signup} className="btn-primary text-sm flex items-center gap-1">
                  Sign up
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}

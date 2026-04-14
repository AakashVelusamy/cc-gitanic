// primary navigation component
// implements responsive glassmorphic navigation bar
// manages session-aware rendering of log-in/out states
// resolves and displays authenticated user identity
// orchestrates logout and navigation workflows
import { useRouter } from 'next/router';
import { clearToken, getCanonicalUsername, getToken, getTokenPayload } from '@/lib/api';
import { routes } from '@/lib/routes';
import { LogOut } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useWebHaptics } from 'web-haptics/react';
import { useEffect, useState } from 'react';
import { triggerDefaultHaptic } from '@/lib/haptics';

export function Navbar() {
  const { trigger } = useWebHaptics();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = getToken();
        setIsLoggedIn(!!token);
        
        if (!token) {
          setUsername(null);
          setLoading(false);
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
  }, [router.asPath]);

  const handleLogout = () => {
    triggerDefaultHaptic(trigger);
    clearToken();
    setUsername(null);
    setIsLoggedIn(false);
    router.push(routes.login);
  };

  return (
    <nav className="glass w-full m-0 rounded-none rounded-b-2xl border-x-0 border-t-0 backdrop-blur-xl glow-border">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* logo & brand */}
          <div className="flex items-center gap-3">
            <Link 
              href={isLoggedIn ? routes.dashboard : routes.home} 
              className="flex items-center gap-2 group"
              onClick={() => triggerDefaultHaptic(trigger)}
            >
              <div className="w-8 h-8 flex items-center justify-center group-hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-all duration-300">
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

          {/* nav right */}
          <div className="flex items-center gap-4">
            {(() => {
              if (!loading && username) {
                return (
                  <>
                    <Link 
                      href={routes.dashboard}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer"
                      onClick={() => triggerDefaultHaptic(trigger)}
                    >
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-white to-white/40 text-black flex items-center justify-center text-xs font-bold">
                        {username.charAt(0).toUpperCase()}
                      </div>
                      <span className="hidden sm:block">{username}</span>
                    </Link>
                    <button
                      className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      onClick={handleLogout}
                      title="Logout"
                    >
                      <LogOut size={18} />
                    </button>
                  </>
                );
              }
              if (loading || username) return null;
              const logInClass = `text-sm font-medium transition-colors ${router.pathname === routes.login ? 'text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}`;
              const signUpClass = `text-sm flex items-center gap-1 ${router.pathname === routes.signup ? 'btn-primary' : 'btn-secondary'}`;
              return (
                <div className="flex items-center gap-3">
                  <Link 
                    href={routes.login} 
                    className={logInClass}
                    onClick={() => triggerDefaultHaptic(trigger)}
                  >
                    Log In
                  </Link>
                  <Link 
                    href={routes.signup} 
                    className={signUpClass}
                    onClick={() => triggerDefaultHaptic(trigger)}
                  >
                    Sign Up
                  </Link>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </nav>
  );
}

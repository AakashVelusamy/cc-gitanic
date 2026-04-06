import { routes } from '@/lib/routes';
import { Navbar } from '@/components/navbar';
import Link from 'next/link';
import { Code2, Rocket, Zap, ChevronDown } from 'lucide-react';
import { getToken } from '@/lib/api';
import { useState, useEffect } from 'react';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const auth = !!getToken();
    if (auth !== isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsAuthenticated(auth);
    }
  }, [isAuthenticated]);

  return (
    <div className="bg-background selection:bg-primary/30 h-screen overflow-y-auto snap-y snap-mandatory relative">
      <div className="sticky top-0 z-50">
        <Navbar />
      </div>

      <main className="pb-20">
        {/* Slide 1: Hero */}
        <section className="snap-start min-h-screen flex flex-col items-center justify-center relative px-4 -mt-[96px]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 blur-[120px] rounded-full pointer-events-none"></div>

          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <h1 className="text-6xl md:text-8xl font-black tracking-tight text-foreground mb-6">
              Push. Deploy.<br className="sm:hidden" /> Done.
            </h1>

            <p className="text-xl md:text-3xl text-muted-foreground mb-12 font-light leading-relaxed max-w-2xl mx-auto">
              A Simple Platform For Your Git Repositories And Static Sites.
            </p>

            <Link href={isAuthenticated ? routes.dashboard : routes.login} className="btn-primary text-xl px-10 py-5 inline-flex items-center justify-center gap-3 rounded-full hover:scale-105 transition-all shadow-[0_0_30px_rgba(0,240,255,0.2)] group w-full sm:w-auto">
              {isAuthenticated ? "Go To Dashboard" : "Get Started"}
            </Link>
          </div>

          <div className="absolute bottom-10 animate-bounce text-muted-foreground/50 hidden sm:block">
            <ChevronDown size={32} />
          </div>
        </section>

        {/* Slide 2: Host */}
        <section className="snap-start min-h-screen flex flex-col items-center justify-center relative px-4 bg-slate-900/20 border-t border-white/5">
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-primary/10 flex items-center justify-center text-primary mb-8 border border-primary/20 shadow-[0_0_40px_rgba(0,240,255,0.15)]">
              <Code2 size={40} />
            </div>
            <h2 className="text-4xl md:text-6xl font-bold mb-6 text-foreground">
              Host Your Code
            </h2>
            <p className="text-2xl md:text-3xl text-muted-foreground font-light leading-relaxed">
              Create Repositories. <br className="sm:hidden" />
              Clone Them Locally. <br />
              Push Code Using Standard Git.
            </p>
          </div>
        </section>

        {/* Slide 3: Deploy */}
        <section className="snap-start min-h-screen flex flex-col items-center justify-center relative px-4 border-t border-white/5">
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-accent/10 flex items-center justify-center text-accent mb-8 border border-accent/20 shadow-[0_0_40px_rgba(14,165,233,0.15)]">
              <Rocket size={40} />
            </div>
            <h2 className="text-4xl md:text-6xl font-bold mb-6 text-foreground">
              Deploy With One Click
            </h2>
            <p className="text-2xl md:text-3xl text-muted-foreground font-light leading-relaxed">
              Build Without The Hassle. <br />
              Every Push To Main Deploys Automatically.
            </p>
          </div>
        </section>

        {/* Slide 4: Live */}
        <section className="snap-start min-h-screen flex flex-col items-center justify-center relative px-4 bg-slate-900/20 border-t border-white/5">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-destructive/5 blur-[120px] rounded-full pointer-events-none"></div>

          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-destructive/10 flex items-center justify-center text-destructive mb-8 border border-destructive/20 shadow-[0_0_40px_rgba(244,63,94,0.15)]">
              <Zap size={40} />
            </div>
            <h2 className="text-4xl md:text-6xl font-bold mb-6 text-foreground">
              Live Instantly
            </h2>
            <p className="text-2xl md:text-3xl text-muted-foreground font-light leading-relaxed mb-12">
              Served On Your Subdomain. <br />
              Zero Configuration Required.
            </p>
            <Link href={isAuthenticated ? routes.dashboard : routes.login} className="btn-secondary text-xl px-10 py-5 inline-flex items-center justify-center gap-3 rounded-full hover:scale-105 transition-transform group w-full sm:w-auto">
              {isAuthenticated ? "Go To Dashboard" : "Start Building Now"}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

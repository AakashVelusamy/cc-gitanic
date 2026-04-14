// application root component
// configures global styles and layout structure
// initializes shared providers and context wrappers
// mounts persistent ui elements like navbar and footer
// manages global viewport and scroll configurations
import '@/globals.css';
import type { AppProps } from 'next/app';
import { Footer } from '@/components/footer';
import { Navbar } from '@/components/navbar';
import { ToastProvider } from '@/contexts/toastContext';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { BGPattern } from '@/components/ui/bgPattern';
import { useEffect, useRef, useState } from 'react';
import { getToken } from '@/lib/api';
import { routes } from '@/lib/routes';

export default function App({ Component, pageProps }: AppProps) {
  const [showMiniLogo, setShowMiniLogo] = useState(false);
  const navbarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const container = document.getElementById('main-scroll-container');
    if (!container) return;

    function onScroll() {
      // navbar is 64px tall; show mini logo once user has scrolled past it
      setShowMiniLogo((container?.scrollTop ?? 0) > 64);
    }

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  const isLoggedIn = typeof window !== 'undefined' ? !!getToken() : false;

  return (
    <ToastProvider>
      <Head>
        <link rel="icon" href="/logo.png" />
      </Head>
      <div className="flex flex-col h-[100dvh] bg-background">
        <BGPattern variant="grid" size={40} className="fixed inset-0 z-0 opacity-40 pointer-events-none" fill="rgba(255,255,255,0.06)" />

        {/* floating mini logo — appears after scrolling past navbar */}
        <div
          className="fixed top-3 left-4 z-50 transition-all duration-300"
          style={{ opacity: showMiniLogo ? 1 : 0, pointerEvents: showMiniLogo ? 'auto' : 'none', transform: showMiniLogo ? 'translateY(0)' : 'translateY(-8px)' }}
        >
          <Link href={isLoggedIn ? routes.dashboard : routes.home}>
            <Image
              src="/logo.png"
              alt="Gitanic"
              width={28}
              height={28}
              className="w-7 h-7 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] hover:drop-shadow-[0_0_14px_rgba(255,255,255,0.8)] transition-all duration-200"
            />
          </Link>
        </div>

        <main
          id="main-scroll-container"
          ref={navbarRef as React.Ref<HTMLElement>}
          className="flex-1 flex flex-col relative w-full overflow-y-auto scroll-smooth z-10"
        >
          <Navbar />
          <Component {...pageProps} />
          <Footer />
        </main>
      </div>
    </ToastProvider>
  );
}



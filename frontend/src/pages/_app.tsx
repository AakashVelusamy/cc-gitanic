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
import { useRouter } from 'next/router';
import { getToken } from '@/lib/api';
import { routes } from '@/lib/routes';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  // homepage is the only page with scroll-based hide/reveal behaviour
  const isHomePage = router.pathname === '/';

  const [showMiniLogo, setShowMiniLogo] = useState(false);
  // on homepage: driven by scroll direction. on other pages: always true
  const [navVisible, setNavVisible] = useState(true);
  // on homepage: driven by scroll direction. on other pages: always true
  const [footerVisible, setFooterVisible] = useState(true);
  const lastScrollRef = useRef(0);
  const navbarRef = useRef<HTMLElement>(null);

  // when the route changes away from / reset bars to their non-homepage defaults
  useEffect(() => {
    if (isHomePage) {
      // entering homepage: reset to initial state
      setNavVisible(true);
      setFooterVisible(true);
      setShowMiniLogo(false);
      lastScrollRef.current = 0;
    } else {
      setNavVisible(true);
      setFooterVisible(true);
      setShowMiniLogo(false);
    }
  }, [isHomePage]);

  useEffect(() => {
    const container = document.getElementById('main-scroll-container');
    if (!container) return;

    function onScroll() {
      const current = container?.scrollTop ?? 0;
      const prev = lastScrollRef.current;
      const delta = current - prev;

      // mini-logo: only relevant on homepage; show once past navbar height
      if (isHomePage) {
        setShowMiniLogo(current > 64);
      }

      // scroll-direction logic only applies on homepage
      if (isHomePage) {
        if (Math.abs(delta) < 4) {
          lastScrollRef.current = current;
          return;
        }
        if (delta > 0) {
          // scrolling down — hide navbar
          setNavVisible(false);
          setFooterVisible(true);
        } else {
          // scrolling up — reveal navbar
          setNavVisible(true);
          setFooterVisible(true);
        }
      }

      lastScrollRef.current = current;
    }

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [isHomePage]);

  const isLoggedIn = globalThis.window === undefined ? false : !!getToken();

  return (
    <ToastProvider>
      <Head>
        <link rel="icon" href="/logo.png" />
      </Head>
      <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
        <BGPattern variant="grid" size={40} className="fixed inset-0 z-0 opacity-40 pointer-events-none" fill="rgba(255,255,255,0.06)" />

        {/* floating mini logo — appears in exact navbar logo position once navbar slides away */}
        {isHomePage && (
          <div
            className="fixed top-4 left-4 sm:left-6 lg:left-8 z-[60] transition-all duration-300"
            style={{
              opacity: showMiniLogo ? 1 : 0,
              pointerEvents: showMiniLogo ? 'auto' : 'none',
              transform: showMiniLogo ? 'translateY(0)' : 'translateY(-6px)',
            }}
          >
            <Link href={isLoggedIn ? routes.dashboard : routes.home} className="flex items-center justify-center group">
              <Image
                src="/logo.png"
                alt="Gitanic"
                width={32}
                height={32}
                className="w-8 h-8 object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.7)] group-hover:drop-shadow-[0_0_16px_rgba(255,255,255,0.95)] transition-all duration-300"
              />
            </Link>
          </div>
        )}

        {/* fixed navbar — always visible on inner pages; hides on scroll-down on homepage */}
        <div
          className="fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out"
          style={{ transform: navVisible ? 'translateY(0)' : 'translateY(-100%)' }}
        >
          <Navbar />
        </div>

        {/* fixed footer — always visible on inner pages; reveals on scroll-down on homepage */}
        <div
          className="fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out"
          style={{ transform: footerVisible ? 'translateY(0)' : 'translateY(100%)' }}
        >
          <Footer />
        </div>

        <main
          id="main-scroll-container"
          ref={navbarRef as React.Ref<HTMLElement>}
          className="flex-1 flex flex-col relative w-full overflow-y-auto scroll-smooth z-10"
        >
          {/* top spacer: compensates for fixed navbar height (h-16 = 64px) */}
          <div className="h-16 shrink-0" />
          <Component {...pageProps} />
          {/* bottom spacer: compensates for fixed footer height */}
          <div className="h-20 shrink-0" />
        </main>
      </div>
    </ToastProvider>
  );
}



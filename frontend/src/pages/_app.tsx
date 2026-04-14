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
import { BGPattern } from '@/components/ui/bgPattern';
import { useRouter } from 'next/router';


export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isHomePage = router.pathname === '/';

  return (
    <ToastProvider>
      <Head>
        <link rel="icon" href="/logo.png" />
      </Head>
      <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
        <BGPattern variant="grid" size={40} className="fixed inset-0 z-0 opacity-40 pointer-events-none" fill="rgba(255,255,255,0.06)" />

        {/* fixed navbar — always visible */}
        <div className="fixed top-0 left-0 right-0 z-50">
          <Navbar />
        </div>

        {/* fixed footer — always visible */}
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <Footer />
        </div>

        <main
          id="main-scroll-container"
          className={`flex-1 flex flex-col relative w-full overflow-y-auto scroll-smooth z-10 ${isHomePage ? 'md:snap-y md:snap-mandatory' : ''}`}
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



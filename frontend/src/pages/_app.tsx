// application root component
// configures global styles and layout structure
// initializes shared providers and context wrappers
// mounts persistent ui elements like navbar and footer
// manages global viewport and scroll configurations
import '@/globals.css';
import type { AppProps } from 'next/app';
import { Footer } from '@/components/footer';
import { Navbar } from '@/components/navbar';
import { ToastProvider } from '@/contexts/toast-context';
import Head from 'next/head';
import { BGPattern } from '@/components/ui/bg-pattern';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ToastProvider>
      <Head>
        <link rel="icon" href="/logo.png" />
      </Head>
      <div className="flex flex-col h-[100dvh] overflow-hidden bg-background">
        <BGPattern variant="grid" size={40} className="fixed inset-0 z-0 opacity-40 pointer-events-none" fill="rgba(255,255,255,0.06)" />
        <Navbar />
        <main id="main-scroll-container" className="flex-1 flex flex-col relative w-full overflow-y-auto md:snap-y md:snap-mandatory scroll-smooth z-10">
          <Component {...pageProps} />
          <div className="pb-[env(safe-area-inset-bottom)]">
            <Footer />
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}



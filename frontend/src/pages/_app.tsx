import '@/globals.css';
import type { AppProps } from 'next/app';
import { Footer } from '@/components/footer';
import { ToastProvider } from '@/contexts/toast-context';
import Head from 'next/head';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ToastProvider>
      <Head>
        <link rel="icon" href="/logo.png" />
      </Head>
      <Component {...pageProps} />
      <Footer />
    </ToastProvider>
  );
}

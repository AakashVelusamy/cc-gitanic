import React from 'react';
import { routes } from '@/lib/routes';
import Link from 'next/link';
import { ArrowDown, Code2, Rocket, Ship, Zap, ArrowRight } from 'lucide-react';
import { getToken } from '@/lib/api';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BGPattern } from '@/components/ui/bg-pattern';
import { GradientCard } from '@/components/ui/gradient-card';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';

const cards = [
  {
    title: 'Commit.',
    desc: 'Create A Repository And Push Your Code Using Gitanic Desktop.',
    gradientFrom: '#ffffff',
    gradientTo: '#5b5bff',
    icon: <Code2 size={32} />,
  },
  {
    title: 'Ship.',
    desc: 'From Then On, Every Push Deploys Automatically.',
    gradientFrom: '#ff5fa2',
    gradientTo: '#7b2ff7',
    icon: <Rocket size={32} />,
  },
  {
    title: 'Repeat.',
    desc: 'Just Like That, Your Code Is Accessible To The World.',
    gradientFrom: '#00e0ff',
    gradientTo: '#00ff9d',
    icon: <Zap size={32} />,
  },
];



export default function Home() {
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const isAuthenticated = isMounted ? !!getToken() : false;

  return (
    <div className="flex-1 bg-background selection:bg-white/20 w-full overflow-x-hidden relative flex flex-col">
      <div className="relative flex-1 flex flex-col">
        {/* HERO */}
        <section className="relative flex flex-col items-center justify-center overflow-hidden h-[calc(100vh-64px)] min-h-[calc(100vh-64px)] md:h-[calc(100vh-114px)] md:min-h-[calc(100vh-114px)] py-12 md:py-0 w-full px-4 md:snap-start md:snap-always shrink-0">
          <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.06)" />

          {/* Aurora */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full pointer-events-none blur-[120px]"
            style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.10), rgba(120,80,255,0.06) 40%, transparent 70%)' }} />

          <div className="relative z-10 mx-auto max-w-5xl text-center md:-mt-32">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1, duration: 0.6 }}
                className="mb-8"
              >
                <img src="/logo.png" alt="Gitanic Logo" className="w-24 h-24 object-contain drop-shadow-[0_0_20px_rgba(56,189,248,0.8)]" />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="mb-6 text-6xl md:text-8xl font-black tracking-tight glow-text"
              >
                Commit. Ship. <br className="sm:hidden" /> Repeat.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="mx-auto mb-10 max-w-2xl text-xl md:text-2xl text-muted-foreground font-light"
              >
                
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="flex flex-wrap justify-center gap-4"
              >
                <Link
                  href={isAuthenticated ? routes.dashboard : routes.login}
                  className="btn-primary text-base inline-flex items-center gap-2"
                >
                  {isAuthenticated ? 'Go To Dashboard' : 'Get Started'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="#features"
                  className="btn-secondary text-base inline-flex items-center gap-2"
                >
                  Learn More
                  <ArrowDown className="h-4 w-4" />
                </Link>
              </motion.div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, y: [0, 10, 0] }}
            transition={{
              opacity: { delay: 1, duration: 0.6 },
              y: { delay: 1.5, duration: 1.5, repeat: Infinity },
            }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2"
          >
            <ArrowDown className="h-6 w-6 text-muted-foreground" />
          </motion.div>
        <hr className="absolute bottom-0 border-t border-white/10 w-full z-30 m-0" />
        </section>

        {/* GRADIENT CARDS */}
        <section id="features" className="relative flex flex-col items-center justify-center h-auto md:h-[calc(100vh-114px)] min-h-0 md:min-h-[calc(100vh-114px)] py-16 md:py-8 w-full px-4 overflow-hidden md:snap-start md:snap-always shrink-0">
          <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.07)" />
          <div className="relative max-w-6xl mx-auto text-center mb-12">
            <h2 className="text-4xl md:text-6xl font-bold glow-text mb-4">How It Works ?</h2>
            
          </div>
          {/* Mobile: stack */}
          <div className="md:hidden flex flex-col items-center w-full mt-4">
            {cards.map((c) => <GradientCard key={c.title} {...c} />)}
          </div>
          {/* Tablet: 2 top row, 1 centered bottom */}
          <div className="hidden md:flex lg:hidden flex-col items-center gap-0 w-full">
            <div className="flex justify-center">
              {cards.slice(0, 2).map((c) => <GradientCard key={c.title} {...c} />)}
            </div>
            <div className="flex justify-center -mt-12">
              <GradientCard {...cards[2]} />
            </div>
          </div>
          {/* Desktop: single row */}
          <div className="hidden lg:flex justify-center flex-wrap">
            {cards.map((c) => <GradientCard key={c.title} {...c} />)}
          </div>
        <hr className="absolute bottom-0 border-t border-white/10 w-full z-30 m-0" />
        </section>

        {/* SCROLL ANIMATION */}
        <section className="relative md:snap-start md:snap-always h-auto md:h-[calc(100vh-114px)] min-h-0 md:min-h-[calc(100vh-114px)] py-16 md:py-0 w-full flex flex-col md:flex-row items-center justify-center shrink-0 overflow-hidden">
          <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.05)" />
          <ContainerScroll
            titleComponent={
              <div className="relative z-20 mb-4 md:mb-6 w-full">
                <h2 className="text-3xl md:text-5xl font-semibold text-foreground">
                  Your Repositories. <br />
                  <span className="text-4xl md:text-6xl lg:text-[5rem] font-black mt-1 leading-none glow-text block">
                    Our Gitanic.
                  </span>
                </h2>
              </div>
            }
          >
            <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground">
              <Ship size={80} className="text-white/40" />
              <p className="text-sm font-mono uppercase tracking-widest"></p>
            </div>
          </ContainerScroll>
        <hr className="absolute bottom-0 border-t border-white/10 w-full z-30 m-0" />
        </section>

        {/* CTA */}
        <section className="relative flex flex-col items-center justify-center h-auto md:h-[calc(100vh-114px)] min-h-0 md:min-h-[calc(100vh-114px)] py-16 md:py-8 w-full px-4 overflow-hidden md:snap-start md:snap-always shrink-0">
          <BGPattern variant="grid" mask="fade-edges" size={32} fill="rgba(255,255,255,0.08)" />
          <div className="relative max-w-3xl mx-auto text-center">
            <h2 className="text-4xl md:text-6xl font-black mb-6 md:mb-8 glow-text">Ready To Ship ?</h2>
            <Link
              href={isAuthenticated ? routes.dashboard : routes.login}
              className="btn-primary text-lg inline-flex items-center gap-2"
            >
              {isAuthenticated ? 'Go To Dashboard' : 'Start Gitanic Now'}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}






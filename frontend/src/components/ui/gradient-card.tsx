import React, { useState, useEffect, useRef } from 'react';

export type GradientCardData = Readonly<{
  title: string;
  desc: string;
  gradientFrom: string;
  gradientTo: string;
  icon?: React.ReactNode;
}>;

function renderIcon(icon: React.ReactNode, className: string) {
  return icon ? <div className={className}>{icon}</div> : null;
}

export function GradientCard({ title, desc, gradientFrom, gradientTo, icon }: GradientCardData) {
  const gradient = `linear-gradient(315deg, ${gradientFrom}, ${gradientTo})`;
  const [touched, setTouched] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!touched) return;
    const dismiss = (e: TouchEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setTouched(false);
      }
    };
    document.addEventListener('touchstart', dismiss, { passive: true });
    return () => document.removeEventListener('touchstart', dismiss);
  }, [touched]);

  const t = touched;

  return (
    <>
      {/* ── Desktop (lg+): group-hover, full size ── */}
      <div className="hidden lg:block group relative w-[320px] h-[400px] m-[40px_30px] transition-all duration-500">
        <span className="absolute top-0 left-[50px] w-1/2 h-full rounded-2xl skew-x-[15deg] transition-all duration-500 group-hover:skew-x-0 group-hover:left-[20px] group-hover:w-[calc(100%-90px)]" style={{ background: gradient }} />
        <span className="absolute top-0 left-[50px] w-1/2 h-full rounded-2xl skew-x-[15deg] blur-[30px] transition-all duration-500 group-hover:skew-x-0 group-hover:left-[20px] group-hover:w-[calc(100%-90px)]" style={{ background: gradient }} />
        <span className="pointer-events-none absolute inset-0 z-10">
          <span className="absolute top-0 left-0 w-0 h-0 rounded-2xl opacity-0 bg-white/10 backdrop-blur-[10px] shadow-[0_5px_15px_rgba(0,0,0,0.08)] transition-all duration-300 animate-blob group-hover:top-[-50px] group-hover:left-[50px] group-hover:w-[100px] group-hover:h-[100px] group-hover:opacity-100" />
          <span className="absolute bottom-0 right-0 w-0 h-0 rounded-2xl opacity-0 bg-white/10 backdrop-blur-[10px] shadow-[0_5px_15px_rgba(0,0,0,0.08)] transition-all duration-500 animate-blob animation-delay-1000 group-hover:bottom-[-50px] group-hover:right-[50px] group-hover:w-[100px] group-hover:h-[100px] group-hover:opacity-100" />
        </span>
        <div className="relative z-20 left-0 p-[20px_40px] bg-white/5 backdrop-blur-[10px] shadow-lg rounded-2xl text-white transition-all duration-500 group-hover:left-[-25px] group-hover:p-[60px_40px]">
          {renderIcon(icon, 'mb-3 text-white/90')}
          <h3 className="text-2xl font-bold mb-2">{title}</h3>
          <p className="text-base leading-relaxed text-white/80">{desc}</p>
        </div>
      </div>

      {/* ── Tablet (md–lg): same skew design, narrower ── */}
      <div className="hidden md:block lg:hidden group relative w-[260px] h-[340px] m-[16px_10px] transition-all duration-500">
        <span className="absolute top-0 left-[38px] w-1/2 h-full rounded-2xl skew-x-[15deg] transition-all duration-500 group-hover:skew-x-0 group-hover:left-[14px] group-hover:w-[calc(100%-70px)]" style={{ background: gradient }} />
        <span className="absolute top-0 left-[38px] w-1/2 h-full rounded-2xl skew-x-[15deg] blur-[24px] transition-all duration-500 group-hover:skew-x-0 group-hover:left-[14px] group-hover:w-[calc(100%-70px)]" style={{ background: gradient }} />
        <span className="pointer-events-none absolute inset-0 z-10">
          <span className="absolute top-0 left-0 w-0 h-0 rounded-2xl opacity-0 bg-white/10 backdrop-blur-[10px] transition-all duration-300 animate-blob group-hover:top-[-40px] group-hover:left-[38px] group-hover:w-[80px] group-hover:h-[80px] group-hover:opacity-100" />
          <span className="absolute bottom-0 right-0 w-0 h-0 rounded-2xl opacity-0 bg-white/10 backdrop-blur-[10px] transition-all duration-500 animate-blob animation-delay-1000 group-hover:bottom-[-40px] group-hover:right-[38px] group-hover:w-[80px] group-hover:h-[80px] group-hover:opacity-100" />
        </span>
        <div className="relative z-20 left-0 p-[16px_28px] bg-white/5 backdrop-blur-[10px] shadow-lg rounded-2xl text-white transition-all duration-500 group-hover:left-[-20px] group-hover:p-[44px_28px]">
          {renderIcon(icon, 'mb-3 text-white/90')}
          <h3 className="text-xl font-bold mb-2">{title}</h3>
          <p className="text-sm leading-relaxed text-white/80">{desc}</p>
        </div>
      </div>

      {/* ── Mobile (<md): touch-state driven horizontal pill ── */}
      <div
        ref={cardRef}
        className="md:hidden relative w-full max-w-[90vw] sm:max-w-[480px] h-[130px] sm:h-[150px] m-2 sm:m-3 transition-all duration-500"
        onTouchStart={() => setTouched(true)}
      >
        <span className="absolute top-0 h-full rounded-2xl transition-all duration-500" style={{ background: gradient, left: t ? '10px' : '20px', width: t ? 'calc(100% - 40px)' : '50%', transform: t ? 'skewX(0deg)' : 'skewX(15deg)' }} />
        <span className="absolute top-0 h-full rounded-2xl blur-[20px] opacity-70 transition-all duration-500" style={{ background: gradient, left: t ? '10px' : '20px', width: t ? 'calc(100% - 40px)' : '50%', transform: t ? 'skewX(0deg)' : 'skewX(15deg)' }} />
        <span className="pointer-events-none absolute rounded-2xl bg-white/10 backdrop-blur-[10px] animate-blob transition-all duration-300" style={{ top: t ? '-30px' : '0px', left: t ? '30px' : '0px', width: t ? '60px' : '0px', height: t ? '60px' : '0px', opacity: t ? 1 : 0, zIndex: 10 }} />
        <span className="pointer-events-none absolute rounded-2xl bg-white/10 backdrop-blur-[10px] animate-blob animation-delay-1000 transition-all duration-500" style={{ bottom: t ? '-30px' : '0px', right: t ? '30px' : '0px', width: t ? '60px' : '0px', height: t ? '60px' : '0px', opacity: t ? 1 : 0, zIndex: 10 }} />
        <div className="relative z-20 h-full flex flex-row items-center gap-4 px-5 py-4 bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl text-white">
          {renderIcon(icon, 'shrink-0 text-white/90')}
          <div className="flex flex-col text-left min-w-0">
            <h3 className="text-base sm:text-lg font-bold mb-1 truncate">{title}</h3>
            <p className="text-xs sm:text-sm leading-snug text-white/80 line-clamp-2">{desc}</p>
          </div>
        </div>
      </div>
    </>
  );
}

// dynamic animated gradient card component
// implements multi-device responsive layouts
// provides glassmorphic hover and tilt effects
// supports custom icon and gradient configurations
// handles touch-based interaction for mobile devices
import React from 'react';

export type GradientCardData = Readonly<{
  title: string;
  desc: string;
  gradientFrom: string;
  gradientTo: string;
  icon?: React.ReactNode;
}>;

function renderIcon(icon: React.ReactNode, className: string) {
  const iconFallback = icon ?? null;
  const elements = {
    true: <div className={className}>{iconFallback}</div>,
    false: null
  };
  return elements[String(!!iconFallback) as 'true' | 'false'];
}

function MobileCard({ title, desc, gradient, icon }: Readonly<{ title: string, desc: string, gradient: string, icon?: React.ReactNode }>) {
  return (
    <div className="md:hidden relative w-full max-w-[90vw] sm:max-w-[480px] h-[130px] sm:h-[150px] m-2 sm:m-3">
      <span 
        className="absolute top-0 h-full rounded-2xl left-[10px] width-[calc(100%-40px)]" 
        style={{ background: gradient, left: '10px', width: 'calc(100% - 20px)' }} 
      />
      <span 
        className="absolute top-0 h-full rounded-2xl blur-[20px] opacity-70" 
        style={{ background: gradient, left: '10px', width: 'calc(100% - 20px)' }} 
      />
      <div className="relative z-20 h-full flex flex-row items-center gap-4 px-5 py-4 bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl text-white">
        {renderIcon(icon, 'shrink-0 text-white/90')}
        <div className="flex flex-col text-left min-w-0">
          <h3 className="text-base sm:text-lg font-bold mb-1 truncate">{title}</h3>
          <p className="text-xs sm:text-sm leading-snug text-white/80 line-clamp-2">{desc}</p>
        </div>
      </div>
    </div>
  );
}

export function GradientCard({ title, desc, gradientFrom, gradientTo, icon }: GradientCardData) {
  const gradient = `linear-gradient(315deg, ${gradientFrom}, ${gradientTo})`;

  return (
    <>
      {/* desktop layout (lg+) */}
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

      {/* tablet layout (md-lg) */}
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

      {/* mobile layout (<md) */}
      <MobileCard title={title} desc={desc} gradient={gradient} icon={icon} />
    </>
  );
}

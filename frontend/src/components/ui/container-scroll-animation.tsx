import React, { useRef, useState, useEffect } from "react";
import { useScroll, useTransform, motion, MotionValue } from "framer-motion";   

export const ContainerScroll = ({
  titleComponent,
  children,
}: {
  titleComponent: string | React.ReactNode;
  children: React.ReactNode;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      const el = document.getElementById("main-scroll-container");
      if (active && el && window.innerWidth >= 768) {
        setScrollEl(el);
      }
    }, 0);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, []);

  const refFallback = useRef<HTMLElement | null>(null);
  
  useEffect(() => {
    refFallback.current = scrollEl;
  }, [scrollEl]);

  const { scrollYProgress } = useScroll(
    scrollEl 
      ? { target: containerRef, container: refFallback, offset: ["start end", "end end"] }
      : { target: containerRef, offset: ["start end", "end end"] }
  );

  const scaleDimensions = (): [number, number] => (isMobile ? [0.7, 0.9] : [1.05, 1]);

  const rotate = useTransform(scrollYProgress, [0, 1], [20, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], scaleDimensions());       
  const translate = useTransform(scrollYProgress, [0, 1], [0, -40]);

  return (
    <div
      className="h-full flex items-center justify-center relative p-2 md:p-8 w-full"
      ref={containerRef}
    >
      <div className="py-4 md:py-8 w-full relative h-full flex flex-col items-center justify-center" style={{ perspective: "1000px" }}>
        <Header translate={translate} titleComponent={titleComponent} />        
        <Card rotate={rotate} scale={scale}>{children}</Card>
      </div>
    </div>
  );
};

const Header = ({ translate, titleComponent }: { translate: MotionValue<number>; titleComponent: React.ReactNode }) => (
  <motion.div style={{ translateY: translate }} className="max-w-5xl mx-auto text-center relative z-20">
    {titleComponent}
  </motion.div>
);

const Card = ({
  rotate, scale, children,
}: { rotate: MotionValue<number>; scale: MotionValue<number>; children: React.ReactNode }) => (
  <motion.div
    style={{
      rotateX: rotate,
      scale,
      boxShadow:
        "0 0 #0000004d, 0 9px 20px #0000004a, 0 37px 37px #00000042, 0 84px 50px #00000026, 0 149px 60px #0000000a, 0 233px 65px #00000003",
    }}
    className="max-w-4xl -mt-4 md:-mt-8 mx-auto h-[24rem] md:h-[28rem] lg:h-[32rem] w-full border border-white/15 p-2 bg-[#0a0a0a] rounded-[30px] shadow-2xl relative z-10"
  >
    <div className="h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5 md:rounded-2xl flex items-center justify-center">
      {children}
    </div>
  </motion.div>
);

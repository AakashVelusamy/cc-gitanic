// scroll-reactive container animation component
// implements 3d perspective tilt and zoom on scroll
// manages responsive viewports for mobile/desktop
// provides smooth motion transitions via framer-motion
// integrates with global scroll containers for orchestration
import React, { useRef, useState, useEffect } from "react";
import { useTransform, motion, useMotionValue, MotionValue } from "framer-motion";

export const ContainerScroll = ({
  titleComponent,
  children,
}: {
  titleComponent: string | React.ReactNode;
  children: React.ReactNode;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  // manual scroll progress: 0 = element entering bottom, 1 = fully scrolled in
  const scrollYProgress = useMotionValue(0);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const scrollEl = document.getElementById("main-scroll-container");
    if (!scrollEl) return;

    function updateProgress() {
      if (!containerRef.current || !scrollEl) return;
      // getBoundingClientRect gives position relative to the viewport.
      // Since #main-scroll-container IS the scroll viewport, its top = 64px (spacer)
      // and bottom = window innerHeight. We use the element's rect directly.
      const rect = containerRef.current.getBoundingClientRect();
      const viewportH = scrollEl.clientHeight;
      // progress 0: rect.top === viewportH  (element just entered from bottom)
      // progress 1: rect.bottom === viewportH  (element fully scrolled up into view)
      const progress = (viewportH - rect.top) / rect.height;
      scrollYProgress.set(Math.min(1, Math.max(0, progress)));
    }

    scrollEl.addEventListener("scroll", updateProgress, { passive: true });
    // seed value on mount
    updateProgress();
    return () => scrollEl.removeEventListener("scroll", updateProgress);
  }, [scrollYProgress]);

  const scaleDimensions: [number, number] = isMobile ? [0.7, 0.9] : [1.05, 1];
  const rotate = useTransform(scrollYProgress, [0, 1], [20, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], scaleDimensions);
  const translate = useTransform(scrollYProgress, [0, 1], [0, -40]);

  return (
    <div
      className="h-full flex items-center justify-center relative p-2 md:p-8 w-full"
      ref={containerRef}
    >
      <div
        className="py-4 md:py-8 w-full relative h-full flex flex-col items-center justify-center"
        style={{ perspective: "1000px" }}
      >
        <motion.div style={{ translateY: translate }} className="max-w-5xl mx-auto text-center relative z-20">
          {titleComponent}
        </motion.div>
        <Card rotate={rotate} scale={scale}>
          {children}
        </Card>
      </div>
    </div>
  );
};

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

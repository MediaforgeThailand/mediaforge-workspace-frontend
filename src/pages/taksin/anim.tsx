// Shared animation primitives for the /taksin portfolio.
// Built on framer-motion (already a project dependency) so scroll reveals are
// robust across the app's React 18 + Vite setup. Everything respects
// prefers-reduced-motion via framer-motion's MotionConfig in index.tsx.
import { useEffect, useRef, useState } from "react";
import { motion, useInView, type Variants } from "framer-motion";

export const easeOutExpo = [0.16, 1, 0.3, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: easeOutExpo } },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

/** Reveal a block on scroll-into-view, with optional stagger of children. */
export function Reveal({
  children,
  className,
  as = "div",
  delay = 0,
  staggerChildren = false,
  amount = 0.25,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "li" | "ul" | "span" | "h2" | "p";
  delay?: number;
  staggerChildren?: boolean;
  amount?: number;
}) {
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      variants={staggerChildren ? stagger : fadeUp}
      transition={{ delay }}
    >
      {children}
    </MotionTag>
  );
}

/** A child of a staggered Reveal. */
export function RevealItem({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li" | "span" | "p";
}) {
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag className={className} variants={fadeUp}>
      {children}
    </MotionTag>
  );
}

/** Mono section label, e.g. "// 01 — PROFILE". */
export function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <Reveal>
      <div className="flex items-center gap-3 font-mono text-xs tracking-[0.25em] text-primary/90 uppercase">
        <span className="text-primary">{index}</span>
        <span className="h-px w-8 bg-primary/50" />
        <span>{children}</span>
      </div>
    </Reveal>
  );
}

/** Count-up number that animates once when scrolled into view. */
export function CountUp({
  value,
  duration = 1.6,
  prefix = "",
  suffix = "",
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / (duration * 1000), 1);
      // easeOutExpo for a snappy finish
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  const formatted = display >= 1000 ? display.toLocaleString("en-US") : String(display);
  return (
    <span ref={ref}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

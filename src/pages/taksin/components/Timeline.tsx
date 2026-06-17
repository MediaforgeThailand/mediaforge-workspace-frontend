import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { timeline } from "../data";
import { Reveal, SectionLabel } from "../anim";

export default function Timeline() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 70%", "end 70%"],
  });
  const lineScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="timeline" className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <SectionLabel index="04">Career Path</SectionLabel>
      <Reveal className="mt-6 max-w-2xl">
        <h2 className="text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
          เส้นทาง 2020 → ปัจจุบัน
        </h2>
        <p className="mt-3 text-muted-foreground">
          จาก Digital Marketing สู่ Data, Performance, Operations และ AI Product
        </p>
      </Reveal>

      <div ref={ref} className="relative mt-14 pl-8 sm:pl-10">
        {/* track */}
        <div className="absolute left-[7px] top-2 h-full w-px bg-border sm:left-[11px]" />
        <motion.div
          className="absolute left-[7px] top-2 w-px origin-top bg-primary sm:left-[11px]"
          style={{ height: "100%", scaleY: lineScale }}
        />

        <div className="space-y-10">
          {timeline.map((t, i) => (
            <Reveal key={t.period + t.org} amount={0.4}>
              <div className="relative">
                <span
                  className="absolute -left-8 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-primary bg-background sm:-left-10"
                  style={{ boxShadow: "0 0 12px rgba(244,255,0,0.5)" }}
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-sm font-bold text-primary">{t.period}</span>
                  {i === timeline.length - 1 && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                      Now
                    </span>
                  )}
                </div>
                <h3 className="mt-1 text-lg font-bold text-foreground">{t.role}</h3>
                <p className="font-mono text-xs text-muted-foreground">{t.org}</p>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

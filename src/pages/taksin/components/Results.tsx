import { Sparkles } from "lucide-react";
import { stats, resultHighlights } from "../data";
import { Reveal, RevealItem, SectionLabel, CountUp } from "../anim";

export default function Results() {
  return (
    <section id="results" className="relative overflow-hidden py-24 sm:py-32">
      <div className="tk-grid absolute inset-0 opacity-30" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <SectionLabel index="05">Results</SectionLabel>
        <Reveal className="mt-6 max-w-2xl">
          <h2 className="text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
            ตัวเลขและผลลัพธ์ที่จับต้องได้
          </h2>
        </Reveal>

        <Reveal staggerChildren amount={0.3} className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <RevealItem key={s.label}>
              <div className="rounded-2xl bg-card p-6 text-center ring-1 ring-primary/10">
                <div className="font-prompt text-4xl font-extrabold text-primary sm:text-5xl">
                  <CountUp value={s.value} prefix={s.prefix} suffix={s.suffix} />
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{s.label}</div>
              </div>
            </RevealItem>
          ))}
        </Reveal>

        <Reveal staggerChildren amount={0.2} className="mt-6 grid gap-4 sm:grid-cols-2">
          {resultHighlights.map((h) => (
            <RevealItem key={h}>
              <div className="flex items-start gap-3 rounded-xl bg-card/60 p-4">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm leading-relaxed text-foreground/90">{h}</span>
              </div>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

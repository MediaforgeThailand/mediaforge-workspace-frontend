import { skillGroups } from "../data";
import { Reveal, RevealItem, SectionLabel } from "../anim";

export default function Skills() {
  return (
    <section id="skills" className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <SectionLabel index="06">Stack</SectionLabel>
      <Reveal className="mt-6 max-w-2xl">
        <h2 className="text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
          เครื่องมือและทักษะ
        </h2>
      </Reveal>

      <Reveal staggerChildren amount={0.15} className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {skillGroups.map((g) => (
          <RevealItem key={g.title}>
            <div className="h-full rounded-2xl bg-card p-6">
              <h3 className="font-mono text-xs uppercase tracking-widest text-primary">{g.title}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {g.items.map((it) => (
                  <span
                    key={it}
                    className="rounded-lg bg-background/60 px-2.5 py-1 text-xs text-foreground/85 ring-1 ring-border/60"
                  >
                    {it}
                  </span>
                ))}
              </div>
            </div>
          </RevealItem>
        ))}
      </Reveal>
    </section>
  );
}

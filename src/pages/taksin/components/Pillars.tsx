import { Check } from "lucide-react";
import { pillars } from "../data";
import { Reveal, SectionLabel } from "../anim";
import PillarVideo from "./PillarVideo";

export default function Pillars() {
  return (
    <section id="pillars" className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <SectionLabel index="03">Core Expertise</SectionLabel>
      <Reveal className="mt-6 max-w-2xl">
        <h2 className="text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
          4 เสาหลักของการทำงาน
        </h2>
        <p className="mt-3 text-muted-foreground">
          เน้นการวางโครงสร้าง นำเทคโนโลยีมาใช้ และวัดผลได้จริง — สื่อสารด้วย motion graphic
        </p>
      </Reveal>

      <div className="mt-16 space-y-24 sm:space-y-32">
        {pillars.map((p, i) => {
          const reversed = i % 2 === 1;
          return (
            <div
              key={p.id}
              className={`grid items-center gap-10 lg:grid-cols-2 ${reversed ? "lg:[&>*:first-child]:order-2" : ""}`}
            >
              {/* text side */}
              <Reveal>
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-5xl font-extrabold text-primary/25">{p.index}</span>
                  <div>
                    <h3 className="text-2xl font-bold text-foreground sm:text-3xl">{p.title}</h3>
                    <span className="font-mono text-xs uppercase tracking-widest text-primary">{p.titleEn}</span>
                  </div>
                </div>
                <p className="mt-4 text-lg font-medium text-foreground/90">{p.tagline}</p>

                <ul className="mt-6 space-y-3">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-7 flex flex-wrap gap-3">
                  {p.metrics.map((m) => (
                    <div key={m.label} className="rounded-xl bg-card px-4 py-3">
                      <div className="font-mono text-lg font-bold text-primary">{m.value}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{m.label}</div>
                    </div>
                  ))}
                </div>
              </Reveal>

              {/* visual side */}
              <Reveal delay={0.1}>
                <PillarVideo id={p.id} video={p.video} poster={p.poster} />
              </Reveal>
            </div>
          );
        })}
      </div>
    </section>
  );
}

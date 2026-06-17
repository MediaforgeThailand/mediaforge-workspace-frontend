import { ArrowUpRight } from "lucide-react";
import { ventures } from "../data";
import { Reveal, RevealItem, SectionLabel } from "../anim";

export default function Ventures() {
  return (
    <section id="ventures" className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <SectionLabel index="02">Ventures</SectionLabel>
      <Reveal className="mt-6 max-w-2xl">
        <h2 className="text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
          ธุรกิจและผลิตภัณฑ์ที่กำลังสร้าง
        </h2>
        <p className="mt-3 text-muted-foreground">
          สามแบรนด์ภายใต้ระบบนิเวศ Mediaforge — แพลตฟอร์ม AI, ผลิตภัณฑ์ในเครือ และโปรดักชันเฮาส์
        </p>
      </Reveal>

      <Reveal staggerChildren amount={0.15} className="mt-12 grid gap-5 md:grid-cols-3">
        {ventures.map((v) => (
          <RevealItem key={v.name}>
            <a
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-full flex-col rounded-2xl bg-card p-6 ring-1 ring-transparent transition-all hover:-translate-y-1 hover:bg-[#1c1f22] hover:ring-primary/30"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-foreground">{v.name}</h3>
                  <span className="font-mono text-xs text-primary">{v.domain}</span>
                </div>
                <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 font-mono text-primary">{v.role}</span>
                <span>{v.period}</span>
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">{v.blurb}</p>
              {v.needsInput && (
                <span className="mt-4 inline-block font-mono text-[10px] uppercase tracking-widest text-amber-400/70">
                  ↳ รอข้อมูลเพิ่มเติม
                </span>
              )}
            </a>
          </RevealItem>
        ))}
      </Reveal>
    </section>
  );
}

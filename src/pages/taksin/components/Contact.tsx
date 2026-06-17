import { Mail, Phone, Globe, ArrowUpRight } from "lucide-react";
import { contact, profile } from "../data";
import { Reveal } from "../anim";

export default function Contact() {
  const items = [
    { icon: Mail, label: contact.email, href: `mailto:${contact.email}` },
    { icon: Phone, label: contact.phone, href: `tel:${contact.phone.replace(/-/g, "")}` },
    { icon: Globe, label: contact.site, href: contact.siteUrl },
  ];

  return (
    <section id="contact" className="relative overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[140px]" />
      <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-8">
        <Reveal>
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Let's build systems</div>
          <h2 className="mt-5 text-4xl font-extrabold leading-tight text-foreground sm:text-5xl">
            สนใจร่วมงาน หรือสร้างระบบให้ธุรกิจ?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            พร้อมคุยเรื่องการวางระบบ ดาต้า ออโตเมชัน Performance Ads และการสร้างผลิตภัณฑ์ AI
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
          {items.map((it) => (
            <a
              key={it.label}
              href={it.href}
              target={it.href.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full bg-card px-5 py-3 text-sm text-foreground ring-1 ring-border transition-all hover:-translate-y-0.5 hover:ring-primary/40"
            >
              <it.icon className="h-4 w-4 text-primary" />
              {it.label}
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
            </a>
          ))}
        </Reveal>

        <Reveal delay={0.2}>
          <a
            href={`mailto:${contact.email}`}
            className="mt-10 inline-block rounded-full bg-primary px-8 py-4 text-base font-bold text-primary-foreground transition-transform hover:scale-105"
          >
            ส่งอีเมลหาผม →
          </a>
        </Reveal>
      </div>

      <footer className="relative mx-auto mt-24 max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border/40 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/mediaforge-logo.svg" alt="MediaForge" className="h-5 w-auto" />
            <span className="font-mono">/ taksin</span>
          </div>
          <div>© {new Date().getFullYear()} {profile.nameLatin} · Built with MediaForge</div>
        </div>
      </footer>
    </section>
  );
}

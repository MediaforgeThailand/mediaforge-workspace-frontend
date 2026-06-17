import { profile } from "../data";
import { Reveal, RevealItem, SectionLabel } from "../anim";

export default function Profile() {
  return (
    <section id="profile" className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <SectionLabel index="01">Profile</SectionLabel>

      <div className="mt-10 grid items-start gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal className="relative mx-auto w-full max-w-xs">
          <div className="relative overflow-hidden rounded-2xl ring-1 ring-primary/20">
            <img src={profile.portrait} alt={profile.nameLatin} className="w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />
          </div>
          <div className="absolute -bottom-3 -right-3 rounded-xl bg-primary px-4 py-2 font-mono text-xs font-bold text-primary-foreground shadow-lg">
            {profile.location}
          </div>
        </Reveal>

        <div>
          <Reveal>
            <h2 className="text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
              {profile.nameTh}
            </h2>
            <p className="mt-2 font-mono text-sm text-primary">{profile.roleLine.join("  ·  ")}</p>
          </Reveal>

          <Reveal delay={0.1} className="mt-6 space-y-4 text-base leading-relaxed text-muted-foreground">
            <p>{profile.summary}</p>
            <p>{profile.summary2}</p>
          </Reveal>

          <Reveal staggerChildren amount={0.4} className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[
              ["Marketing → Engineering", "เส้นทางสายผสม"],
              ["Ownership Mindset", "เจ้าของปัญหา"],
              ["Result-Driven", "ขับด้วยผลลัพธ์"],
            ].map(([k, v]) => (
              <RevealItem key={k} className="rounded-xl bg-card p-4">
                <div className="font-mono text-xs text-primary">{k}</div>
                <div className="mt-1 text-sm text-foreground">{v}</div>
              </RevealItem>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

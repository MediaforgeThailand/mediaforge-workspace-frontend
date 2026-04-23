import { Sparkles, Users, BarChart3 } from "lucide-react";

const stats = [
  { value: "1K+", label: "Outputs Generated", icon: <Sparkles size={22} /> },
  { value: "15K+", label: "Active Users", icon: <Users size={22} /> },
  { value: "100+", label: "AI Flows Available", icon: <BarChart3 size={22} /> },
];

export default function StatsSection() {
  return (
    <section className="border-y border-border/50 bg-card/30 py-24">
      <div className="mx-auto grid max-w-[1536px] grid-cols-2 gap-8 px-8 lg:grid-cols-3">
        {stats.map((s, i) => (
          <div key={i} className="text-center">
            <div className="glass-border mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.06] text-foreground">
              {s.icon}
            </div>
            <div className="text-[40px] font-bold leading-tight text-foreground">{s.value}</div>
            <div className="mt-2 text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

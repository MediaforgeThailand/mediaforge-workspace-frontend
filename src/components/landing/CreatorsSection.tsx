import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";

const benefits = [
  "Design your AI Flow with our visual builder",
  "Publish to 1000+ businesses worldwide",
  "Earn up to 30% revenue share on every execution",
  "Get paid monthly — no minimum threshold drama",
];

const stats = [
  { label: "Total Earnings", value: "฿128,400" },
  { label: "Active Flows", value: "12" },
  { label: "Executions", value: "8,540" },
  { label: "Avg Rating", value: "4.9 ★" },
];

export default function CreatorsSection() {
  return (
    <section id="creators" className="mx-auto max-w-[1600px] px-8 py-24">
      <div className="mx-auto max-w-[1536px]">
        <div className="glass-border overflow-hidden rounded-3xl border-0 bg-gradient-to-br from-white/[0.04] via-card to-white/[0.02]">
          <div className="grid grid-cols-1 gap-12 p-10 lg:grid-cols-2 lg:gap-16 lg:p-16">
            <div className="flex flex-col justify-center">
              <h2 className="mb-4 text-[40px] font-bold leading-tight text-foreground">
                Build once.{" "}
                <span className="text-foreground">
                  Earn forever.
                </span>
              </h2>
              <p className="mb-8 text-base leading-[28px] text-muted-foreground">
                Turn your AI expertise into passive income. Design an automation Flow
                once, publish it on our Marketplace, and earn every time a business runs it.
                No freelancing. No time limits. Just scalable income.
              </p>
              <div className="mb-10 flex flex-col gap-3.5">
                {benefits.map((text, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/20">
                      <Check size={12} className="text-green-500" />
                    </div>
                    <span className="text-sm text-muted-foreground">{text}</span>
                  </div>
                ))}
              </div>
              <Link to="/auth">
                <Button className="w-fit gap-2 bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90">
                  Become a Creator
                  <ArrowRight size={16} />
                </Button>
              </Link>
            </div>

            <div className="flex items-center">
              <div className="glass-border w-full rounded-2xl border-0 bg-card/60 p-6 backdrop-blur-sm">
                <div className="mb-6 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white/10" />
                  <div>
                    <div className="font-semibold text-foreground">Top Creator Dashboard</div>
                    <div className="text-xs text-muted-foreground">Monthly earnings overview</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {stats.map((s, i) => (
                    <div key={i} className="glass-border rounded-xl bg-background/60 p-4">
                      <div className="text-xs text-muted-foreground">{s.label}</div>
                      <div className="mt-1 text-xl font-bold text-foreground">{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";

const testimonials = [
  { quote: "We cut our product photography budget by 80%. MediaForge delivers studio-quality images from phone photos in seconds.", name: "Sarah Chen", role: "CMO, StyleBrand Co.", color: "bg-blue-500/30" },
  { quote: "As a creator, I built 5 Flows and now earn passive income every month. It's like building digital products that sell while I sleep.", name: "Marcus Lee", role: "AI Flow Creator", color: "bg-green-500/30" },
  { quote: "I earn more from my Flows serving other businesses than I do from my day job. The creator economy here is real.", name: "David Wu", role: "Top-Tier Flow Creator", color: "bg-pink-500/30" },
];

export default function TestimonialsSection() {
  return (
    <section className="mx-auto max-w-[1600px] px-8 py-24">
      <div className="mx-auto max-w-[1536px]">
        <div className="mb-14 text-center">
          <h2 className="mb-4 text-[40px] font-bold leading-tight text-foreground">Loved by Businesses & Creators</h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <Card key={i} className="glass-border border-0 bg-card">
              <CardContent className="flex flex-col gap-5 p-6">
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} size={14} className="fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="flex-1 text-sm leading-relaxed text-muted-foreground">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 shrink-0 rounded-full ${t.color}`} />
                  <div>
                    <div className="text-sm font-semibold text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

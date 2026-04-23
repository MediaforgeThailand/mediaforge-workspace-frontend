import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ChevronRight, Image, Video, Palette, Box } from "lucide-react";

const flows = [
  { name: "Product Packshot Pro", cat: "Packshot", icon: <Box size={20} />, price: "฿15/run" },
  { name: "Lifestyle Scene AI", cat: "Art Direction", icon: <Image size={20} />, price: "฿20/run" },
  { name: "Social Reels Maker", cat: "Video", icon: <Video size={20} />, price: "฿25/run" },
  { name: "E-com White BG", cat: "Packshot", icon: <Box size={20} />, price: "฿10/run" },
  { name: "Brand Mood Board", cat: "Art Direction", icon: <Palette size={20} />, price: "฿18/run" },
  { name: "TikTok Ad Creator", cat: "Video", icon: <Video size={20} />, price: "฿30/run" },
];

export default function PopularFlowsSection() {
  return (
    <section className="mx-auto max-w-[1600px] px-8 py-24">
      <div className="mx-auto max-w-[1536px]">
        <div className="mb-3">
          <Badge variant="secondary" className="gap-1.5 rounded-full border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-foreground">
            <Sparkles size={12} />
            Marketplace
          </Badge>
        </div>

        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[40px] font-bold leading-tight text-foreground">Popular Flows</h2>
            <p className="mt-2 text-base text-muted-foreground">
              Pick the perfect AI production workflow for your business needs.
            </p>
          </div>
          <Link to="/app/home">
            <Button variant="outline" className="gap-2 border-border text-foreground">
              Browse All Flows
              <ChevronRight size={16} />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((flow, i) => (
            <Card key={i} className="group cursor-pointer border-border/50 bg-card transition-all hover:border-white/20 hover:shadow-lg hover:shadow-white/5">
              <CardContent className="p-5">
                <div className="mb-4 aspect-[16/10] overflow-hidden rounded-lg bg-gradient-to-br from-white/[0.03] to-white/[0.01]">
                  <div className="flex h-full w-full items-center justify-center">
                    <div className="rounded-xl bg-white/[0.06] p-4 text-foreground transition-transform group-hover:scale-110">
                      {flow.icon}
                    </div>
                  </div>
                </div>
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-foreground">{flow.name}</h4>
                    <p className="text-xs text-muted-foreground">{flow.cat}</p>
                  </div>
                  <Badge variant="secondary" className="bg-white/[0.06] text-xs text-foreground">
                    {flow.price}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

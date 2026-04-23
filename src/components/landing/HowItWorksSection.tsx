import { Card, CardContent } from "@/components/ui/card";
import { Palette, Zap } from "lucide-react";
import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

const steps: { icon: ReactNode; title: string; desc: string; video?: string; videoWebm?: string; mobileVideo?: string }[] = [
  { icon: null, title: "Choose a Flow", desc: "", video: "/videos/how-it-works-choose.mp4", videoWebm: "/videos/how-it-works-choose.webm", mobileVideo: "/videos/mobile/how-it-works-choose.mp4" },
  {
    icon: null,
    title: "Upload Your Input",
    desc: "",
    video: "/videos/how-it-works-upload.mp4",
    videoWebm: "/videos/how-it-works-upload.webm",
    mobileVideo: "/videos/mobile/how-it-works-upload.mp4",
  },
  {
    icon: null,
    title: "Get Pro Results",
    desc: "",
    video: "/videos/how-it-works-results.mp4",
    videoWebm: "/videos/how-it-works-results.webm",
    mobileVideo: "/videos/mobile/how-it-works-results.mp4",
  },
];

export default function HowItWorksSection() {
  const isMobile = useIsMobile();
  return (
    <section id="how-it-works" className="mx-auto max-w-[1600px] px-8 py-24">
      <div className="mx-auto max-w-[1536px]">
        <div className="mb-14 text-center">
          <h2 className="mb-4 text-[40px] font-bold leading-tight text-foreground">How It Works</h2>
          <p className="mx-auto max-w-[500px] text-base text-muted-foreground">
            Start your creative AI production flow in 3 simple steps.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {steps.map((step, i) => {
            const isVideo = !!step.video;
            return (
              <Card key={i} className="glass-border border-0 bg-card text-center overflow-hidden">
                {isVideo ? (
                  <div className="flex flex-col">
                    <div className="w-full aspect-[4/3] overflow-hidden">
                      <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="h-full w-full rounded-2xl object-cover"
                      >
                        {!isMobile && step.videoWebm && <source src={step.videoWebm} type="video/webm" />}
                        <source src={isMobile && step.mobileVideo ? step.mobileVideo : step.video!} type="video/mp4" />
                      </video>
                    </div>
                    <div className="p-4">
                      <h3 className="text-xl font-semibold text-foreground">{step.title}</h3>
                    </div>
                  </div>
                ) : (
                  <CardContent className="flex flex-col items-center gap-5 p-10">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.06] text-foreground">
                      {step.icon}
                    </div>
                    <h3 className="text-xl font-semibold text-foreground">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

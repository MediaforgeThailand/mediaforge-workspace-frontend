import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { phLandingCtaClicked } from "@/lib/posthogEvents";

export default function CTASection() {
  return (
    <section className="mx-auto max-w-[1600px] px-8 py-24">
      <div className="mx-auto max-w-[1536px]">
        <div className="glass-border relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-violet-600 to-purple-800 px-8 py-20 text-center sm:px-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_70%)]" />
          <div className="relative">
            <h2 className="mb-5 text-[32px] font-bold leading-tight text-white sm:text-[44px]">
              Ready to Transform Your<br />Product Content?
            </h2>
            <p className="mx-auto mb-10 max-w-[480px] text-lg text-white/80">
              Join 15,000+ businesses creating studio-quality content with AI. Start free today.
            </p>
            <Link to="/app/home" onClick={() => phLandingCtaClicked("cta_bottom")}>
              <Button className="h-[56px] rounded-xl bg-white px-10 text-base font-semibold text-primary hover:bg-white/90">
                Start Creating Free
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

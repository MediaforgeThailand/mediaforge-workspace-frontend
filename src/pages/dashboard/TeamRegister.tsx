import { ArrowLeft, Building2, CheckCircle2, ShieldCheck, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import useDocumentTitle from "@/hooks/useDocumentTitle";

const TEAM_SEAT_PRICE_THB = 1600;
const TEAM_BASE_CREDITS = 65_000;
const TEAM_PROMO_CREDITS = 25_000;

export default function TeamRegister() {
  useDocumentTitle("Team registration - MediaForge");
  const navigate = useNavigate();

  return (
    <div className="min-h-full bg-[hsl(0_0%_5%)] text-zinc-100">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <Button variant="ghost" className="mb-6 text-zinc-400" onClick={() => navigate("/app/settings?tab=team")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to settings
        </Button>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-2xl bg-white/[0.05] p-6">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200">
              <Building2 className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold">Create a Team workspace</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              {`Team is now self-serve inside Workspace. Start at 2 seats, ฿${TEAM_SEAT_PRICE_THB.toLocaleString()} / seat / month, with ${(TEAM_BASE_CREDITS + TEAM_PROMO_CREDITS).toLocaleString()} shared credits per seat.`}
            </p>

            <div className="mt-6 rounded-xl bg-black/30 p-4">
              <div className="text-xs uppercase tracking-[0.12em] text-zinc-500">Next step</div>
              <p className="mt-1 text-sm text-zinc-300">
                Buy seats from Pricing. After payment, your account becomes the team admin and can invite members from Settings.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => navigate("/app/pricing")}>
                Buy team seats
              </Button>
              <Button variant="outline" onClick={() => navigate("/app/settings?tab=team")}>
                Review team status
              </Button>
            </div>
          </section>

          <aside className="space-y-3">
            <Feature icon={<ShieldCheck className="h-4 w-4" />} title="Workspace admin" body="The buyer becomes the team admin immediately after payment." />
            <Feature icon={<Users className="h-4 w-4" />} title={`฿${TEAM_SEAT_PRICE_THB.toLocaleString()} / seat`} body="Minimum 2 seats. Add more seats any time." />
            <Feature icon={<CheckCircle2 className="h-4 w-4" />} title="Shared credit pool" body={`${TEAM_BASE_CREDITS.toLocaleString()} base credits + ${TEAM_PROMO_CREDITS.toLocaleString()} promo credits per seat each month.`} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl bg-white/[0.05] p-4">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-zinc-200">{icon}</div>
      <div className="text-sm font-medium text-zinc-100">{title}</div>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{body}</p>
    </div>
  );
}

import { ArrowLeft, Building2, CheckCircle2, ShieldCheck, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import useDocumentTitle from "@/hooks/useDocumentTitle";

const TEAM_SEAT_PRICE_THB = 1600;
const TEAM_BASE_CREDITS = 65_000;
const TEAM_PROMO_CREDITS = 25_000;

export default function TeamRegister() {
  const { t: i18n } = useLanguage();
  useDocumentTitle(i18n("teamRegistration.teamRegistrationMediaforge"));
  const navigate = useNavigate();

  return (
    <div className="min-h-full bg-[hsl(0_0%_5%)] text-zinc-100">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <Button variant="ghost" className="mb-6 text-zinc-400" onClick={() => navigate("/app/settings?tab=team")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {i18n("teamRegistration.backToSettings")}
        </Button>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-2xl bg-white/[0.05] p-6">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200">
              <Building2 className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold">{i18n("teamRegistration.createTeamWorkspace")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              {i18n("teamRegistration.teamIsNowSelfServeInsideWorkspace", {
                  price: TEAM_SEAT_PRICE_THB.toLocaleString(),
                  credits: (TEAM_BASE_CREDITS + TEAM_PROMO_CREDITS).toLocaleString(),
                })}
            </p>

            <div className="mt-6 rounded-xl bg-black/30 p-4">
              <div className="text-xs uppercase tracking-[0.12em] text-zinc-500">{i18n("teamRegistration.nextStep")}</div>
              <p className="mt-1 text-sm text-zinc-300">
                {i18n("teamRegistration.nextStepDescription")}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => navigate("/app/pricing")}>
                {i18n("common.buyTeamSeats")}
              </Button>
              <Button variant="outline" onClick={() => navigate("/app/settings?tab=team")}>
                {i18n("teamRegistration.reviewTeamStatus")}
              </Button>
            </div>
          </section>

          <aside className="space-y-3">
            <Feature icon={<ShieldCheck className="h-4 w-4" />} title={i18n("teamRegistration.workspaceAdmin")} body={i18n("teamRegistration.adminRoleDescription")} />
            <Feature icon={<Users className="h-4 w-4" />} title={i18n("teamRegistration.thbSeat", { price: TEAM_SEAT_PRICE_THB.toLocaleString() })} body={i18n("teamRegistration.minimum2SeatsAddMoreSeatsAny")} />
            <Feature icon={<CheckCircle2 className="h-4 w-4" />} title={i18n("teamRegistration.sharedCreditPool")} body={i18n("teamRegistration.baseCreditsPromoCreditsPer", { base: TEAM_BASE_CREDITS.toLocaleString(), promo: TEAM_PROMO_CREDITS.toLocaleString() })} />
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

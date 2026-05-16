import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Captions,
  Film,
  Image as ImageIcon,
  Languages,
  LockKeyhole,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import BuyCreditsDialog from "@/components/settings/BuyCreditsDialog";

type DialogReason = "credits" | "feature_locked";

interface InsufficientCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredCredits?: number;
  workspaceId?: string | null;
  reason?: DialogReason;
  featureName?: string | null;
}

interface SubscriptionPlanRow {
  id: string;
  name: string;
  target: string;
  billing_cycle: string;
  price_thb: number;
  upfront_credits: number;
  sort_order: number;
  is_active: boolean;
  is_featured?: boolean | null;
  credit_discount_percent?: number | null;
}

interface CreditCostSummaryRow {
  feature: string;
  model: string | null;
  cost: number;
  pricing_type: string | null;
  duration_seconds: number | null;
  has_audio: boolean | null;
}

const DEFAULT_WORKSPACE_MULTIPLIER = 1.4;
const FREE_PLAN_CREDITS = 1_000;
const PLAN_ORDER = ["Free", "Starter", "Creator", "Pro"] as const;

const SYNTHETIC_FREE_PLAN: SubscriptionPlanRow = {
  id: "free-plan",
  name: "Free",
  target: "user",
  billing_cycle: "monthly",
  price_thb: 0,
  upfront_credits: FREE_PLAN_CREDITS,
  sort_order: 0,
  is_active: true,
  is_featured: false,
  credit_discount_percent: 0,
};

function formatNumber(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString("en-US");
}

function displayPlanPrice(plan: SubscriptionPlanRow): string {
  if (plan.price_thb <= 0) return "Free";
  return `THB ${formatNumber(plan.price_thb)} / mo`;
}

function customerCostForRow(
  row: CreditCostSummaryRow | null,
  multiplier: number,
  seconds = 60,
): number | null {
  if (!row) return null;
  const base = Math.max(1, Number(row.cost) || 0);
  let raw = base;
  if (row.pricing_type === "per_second") raw = base * seconds;
  if (row.pricing_type === "per_minute") raw = (base * seconds) / 60;
  return Math.max(1, Math.ceil(raw * multiplier));
}

function findCost(
  rows: CreditCostSummaryRow[],
  feature: string,
  models: string[],
  opts: { hasAudio?: boolean } = {},
): CreditCostSummaryRow | null {
  for (const model of models) {
    const match = rows.find((row) => {
      if (row.feature !== feature || row.model !== model) return false;
      if (opts.hasAudio !== undefined && Boolean(row.has_audio) !== opts.hasAudio) return false;
      return true;
    });
    if (match) return match;
  }
  return rows.find((row) => row.feature === feature && row.model == null) ?? null;
}

function planCardsFromRows(rows: SubscriptionPlanRow[]): SubscriptionPlanRow[] {
  const activeMonthly = rows.filter(
    (row) => row.is_active && row.target === "user" && row.billing_cycle === "monthly",
  );
  const byName = new Map<string, SubscriptionPlanRow>();
  for (const row of activeMonthly) {
    if (!PLAN_ORDER.includes(row.name as (typeof PLAN_ORDER)[number])) continue;
    const prev = byName.get(row.name);
    if (!prev || row.sort_order < prev.sort_order) byName.set(row.name, row);
  }
  if (!byName.has("Free")) byName.set("Free", SYNTHETIC_FREE_PLAN);
  return PLAN_ORDER.map((name) => byName.get(name)).filter(Boolean) as SubscriptionPlanRow[];
}

const InsufficientCreditsDialog = ({
  open,
  onOpenChange,
  requiredCredits,
  workspaceId,
  reason = "credits",
  featureName,
}: InsufficientCreditsDialogProps) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { credits, refetch } = useCredits(workspaceId);
  const { t } = useLanguage();
  const [topupOpen, setTopupOpen] = useState(false);

  const { data: planRows = [] } = useQuery({
    queryKey: ["upgrade-dialog-plans"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id,name,target,billing_cycle,price_thb,upfront_credits,sort_order,is_active,is_featured,credit_discount_percent")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []) as SubscriptionPlanRow[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: creditCostRows = [] } = useQuery({
    queryKey: ["upgrade-dialog-credit-costs"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_costs")
        .select("feature,model,cost,pricing_type,duration_seconds,has_audio");
      if (error) throw new Error(error.message);
      return (data ?? []) as CreditCostSummaryRow[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: workspaceMultiplier = DEFAULT_WORKSPACE_MULTIPLIER } = useQuery({
    queryKey: ["upgrade-dialog-workspace-multiplier"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_settings")
        .select("value")
        .eq("key", "workspace_infrastructure_buffer_percent")
        .maybeSingle();
      const parsed = Number(data?.value);
      return Number.isFinite(parsed) && parsed >= 0
        ? 1 + parsed / 100
        : DEFAULT_WORKSPACE_MULTIPLIER;
    },
    staleTime: 1000 * 60 * 5,
  });

  const balance = credits?.balance ?? 0;
  const shortage = requiredCredits ? Math.max(0, requiredCredits - balance) : 0;
  const balanceText = balance.toLocaleString();
  const requiredText = requiredCredits?.toLocaleString() ?? "";
  const shortageText = shortage.toLocaleString();
  const isEducationSpace =
    credits?.credit_scope === "education_space" ||
    credits?.organization_type === "school" ||
    credits?.organization_type === "university";

  const planCards = useMemo(() => planCardsFromRows(planRows), [planRows]);
  const currentPlanName =
    String((profile as { plan_name?: string | null } | null)?.plan_name || "Free").trim() || "Free";

  const exampleCosts = useMemo(() => {
    const image = customerCostForRow(
      findCost(creditCostRows, "generate_openai_image", [
        "gpt-image-2:1k:medium",
        "gpt-image-2:1024x1024:medium",
        "gpt-image-2",
      ]),
      workspaceMultiplier,
      1,
    );
    const video = customerCostForRow(
      findCost(
        creditCostRows,
        "generate_freepik_video",
        ["veo-3.1-generate-001:720p", "veo-3.1-generate-001", "veo-3.1-generate-preview"],
        { hasAudio: false },
      ),
      workspaceMultiplier,
      8,
    );
    const translate = customerCostForRow(
      findCost(creditCostRows, "voice_translate", ["elevenlabs-dubbing-voice-clone"]),
      workspaceMultiplier,
      60,
    );
    const subtitle = customerCostForRow(
      findCost(creditCostRows, "auto_subtitle", ["auto-suptitle-whisper"]),
      workspaceMultiplier,
      60,
    );
    return { image, video, translate, subtitle };
  }, [creditCostRows, workspaceMultiplier]);

  const title =
    reason === "feature_locked"
      ? "Upgrade to unlock this feature"
      : isEducationSpace
        ? t("insufficientCredits.classSpaceLow")
        : t("insufficientCredits.notEnough");
  const description =
    reason === "feature_locked"
      ? `${featureName || "This feature"} is not included in your current plan. Choose Starter or higher to unlock it.`
      : isEducationSpace
        ? t("insufficientCredits.classSpaceDescription", { balance: balanceText })
        : requiredCredits
          ? t("insufficientCredits.requiredDescription", { required: requiredText, balance: balanceText })
          : t("insufficientCredits.balanceDescription", { balance: balanceText });

  const handleGoToPricing = () => {
    onOpenChange(false);
    navigate("/app/pricing");
  };

  return (
    <>
      <Dialog open={open && !topupOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[94vh] max-w-[1180px] overflow-visible border-0 bg-transparent p-0 text-white shadow-none [&>button]:right-4 [&>button]:top-0 [&>button]:h-11 [&>button]:w-11 [&>button]:rounded-full [&>button]:bg-black/45 [&>button]:text-white [&>button]:opacity-100 [&>button]:ring-1 [&>button]:ring-white/15 [&>button]:backdrop-blur-xl [&>button]:hover:bg-white/15">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>

          <div className="grid max-h-[94vh] grid-cols-1 gap-4 overflow-y-auto px-4 pb-4 pt-16 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5 xl:px-0 xl:pb-0">
            {planCards.map((plan) => {
              const creditsPerMonth = plan.upfront_credits || (plan.name === "Free" ? FREE_PLAN_CREDITS : 0);
              const isFree = plan.name === "Free";
              const isPro = plan.name === "Pro";
              const isCurrent = plan.name.toLowerCase() === currentPlanName.toLowerCase();
              const imageCount = exampleCosts.image ? Math.floor(creditsPerMonth / exampleCosts.image) : null;
              const videoCount = exampleCosts.video ? Math.floor(creditsPerMonth / exampleCosts.video) : null;
              const translateCount = exampleCosts.translate ? Math.floor(creditsPerMonth / exampleCosts.translate) : null;
              const subtitleCount = exampleCosts.subtitle ? Math.floor(creditsPerMonth / exampleCosts.subtitle) : null;
              const ctaLabel =
                reason === "credits" && isCurrent
                  ? "Top up credits"
                  : isCurrent && reason === "feature_locked"
                    ? "Upgrade plan"
                    : isFree
                      ? "View plans"
                      : "Choose plan";
              const onCtaClick = reason === "credits" && isCurrent ? () => setTopupOpen(true) : handleGoToPricing;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative flex min-h-[620px] flex-col rounded-[30px] border p-6 shadow-[0_26px_80px_rgba(0,0,0,0.52)] backdrop-blur-2xl transition-transform hover:-translate-y-1",
                    isPro
                      ? "border-[#f4ff3f] bg-[#f6f7ee] text-[#090b07]"
                      : "border-white/12 bg-[#101611]/95 text-white",
                    isCurrent &&
                      "border-[#e5ff36] shadow-[0_0_0_1px_rgba(229,255,54,0.65),0_28px_90px_rgba(229,255,54,0.18)]",
                  )}
                >
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em]",
                        isCurrent
                          ? "bg-[#e5ff36] text-black"
                          : isPro
                            ? "bg-black text-white"
                            : "bg-white/10 text-zinc-200",
                      )}
                    >
                      {isCurrent ? "Current plan" : isPro ? "Best value" : "Plan"}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[30px] font-black leading-none tracking-tight">{plan.name}</h3>
                    <div className="mt-4 text-[32px] font-black leading-none tracking-tight">
                      {displayPlanPrice(plan)}
                    </div>
                    <div className={cn("mt-3 text-[15px] font-bold", isPro ? "text-zinc-600" : "text-zinc-300")}>
                      {formatNumber(creditsPerMonth)} credits / month
                    </div>
                  </div>

                  {(isCurrent || (isFree && reason === "feature_locked")) && (
                    <div
                      className={cn(
                        "mt-5 rounded-2xl border px-4 py-3",
                        isPro
                          ? "border-black/10 bg-black/[0.04]"
                          : reason === "feature_locked"
                            ? "border-[#e5ff36]/40 bg-[#e5ff36]/10"
                            : "border-sky-300/25 bg-sky-300/10",
                      )}
                    >
                      <div className={cn("text-[12px] font-black uppercase tracking-[0.12em]", isPro ? "text-zinc-500" : "text-zinc-300")}>
                        {reason === "feature_locked" ? "Feature locked" : "Not enough credits"}
                      </div>
                      <div className="mt-2 text-[16px] font-black leading-6">
                        {reason === "feature_locked"
                          ? `${featureName || "This feature"} needs Starter or higher.`
                          : isEducationSpace
                            ? "Class credit balance is too low."
                            : `Need ${requiredText || "more"} credits. Balance ${balanceText}.`}
                      </div>
                      {reason === "credits" && shortage > 0 && !isEducationSpace && (
                        <div className={cn("mt-1 text-[14px] font-bold", isPro ? "text-zinc-600" : "text-zinc-300")}>
                          Short by {shortageText} credits.
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-5 grid gap-2.5">
                    <PlanExampleRow
                      icon={ImageIcon}
                      label="Images"
                      value={isFree ? "Locked" : imageCount == null ? "-" : `~${formatNumber(imageCount)} images/mo`}
                      muted={isFree}
                      dark={isPro}
                    />
                    <PlanExampleRow
                      icon={Film}
                      label="VDO 8s"
                      value={isFree ? "Locked" : videoCount == null ? "-" : `~${formatNumber(videoCount)} videos/mo`}
                      muted={isFree}
                      dark={isPro}
                    />
                    <PlanExampleRow
                      icon={Languages}
                      label="Translate 1m"
                      value={translateCount == null ? "-" : `~${formatNumber(translateCount)} min/mo`}
                      dark={isPro}
                    />
                    <PlanExampleRow
                      icon={Captions}
                      label="Subtitle 1m"
                      value={subtitleCount == null ? "-" : `~${formatNumber(subtitleCount)} min/mo`}
                      dark={isPro}
                    />
                  </div>

                  <Button
                    className={cn(
                      "mt-auto h-14 rounded-2xl text-[15px] font-black",
                      isPro
                        ? "bg-black text-white hover:bg-zinc-800"
                        : "bg-[#e5ff36] text-black hover:bg-[#f0ff70]",
                    )}
                    onClick={onCtaClick}
                  >
                    {ctaLabel}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <BuyCreditsDialog
        open={topupOpen}
        onOpenChange={(nextOpen) => {
          setTopupOpen(nextOpen);
          if (!nextOpen) onOpenChange(false);
        }}
        onSuccess={() => {
          void refetch();
        }}
      />
    </>
  );
};

const PlanExampleRow = ({
  icon: Icon,
  label,
  value,
  muted = false,
  dark = false,
}: {
  icon: typeof ImageIcon;
  label: string;
  value: string;
  muted?: boolean;
  dark?: boolean;
}) => (
  <div
    className={cn(
      "flex min-h-[52px] items-center justify-between gap-4 rounded-2xl border px-4 py-2.5",
      dark ? "border-black/10 bg-black/[0.035]" : "border-white/10 bg-white/[0.055]",
      muted && "opacity-60",
    )}
  >
    <span className="inline-flex min-w-0 items-center gap-3">
      {muted ? <LockKeyhole className="h-4 w-4 shrink-0" /> : <Icon className="h-4 w-4 shrink-0" />}
      <span className={cn("text-[14px] font-black leading-5", dark ? "text-zinc-900" : "text-white")}>{label}</span>
    </span>
    <span
      className={cn(
        "shrink-0 text-right text-[14px] font-black leading-5",
        muted ? (dark ? "text-zinc-500" : "text-zinc-400") : dark ? "text-zinc-950" : "text-[#e5ff36]",
      )}
    >
      {value}
    </span>
  </div>
);

export default InsufficientCreditsDialog;

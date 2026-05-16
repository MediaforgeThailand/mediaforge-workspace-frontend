import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Captions,
  CheckCircle2,
  Coins,
  Film,
  Image as ImageIcon,
  Languages,
  LockKeyhole,
  Sparkles,
  type LucideIcon,
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
const PLAN_COPY: Record<(typeof PLAN_ORDER)[number], string> = {
  Free: "Utility tools for getting started. Creative generation unlocks on paid plans.",
  Starter: "A practical entry plan for daily prompts, audio and light generation.",
  Creator: "More monthly room for image, video, translate and subtitle workflows.",
  Pro: "The best value pool for heavier production and faster iteration.",
};

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
        <DialogContent className="max-h-[94vh] max-w-[1200px] overflow-visible border-0 bg-transparent p-0 text-white shadow-none outline-none focus:outline-none focus-visible:outline-none [&>button]:right-3 [&>button]:top-1 [&>button]:h-12 [&>button]:w-12 [&>button]:rounded-full [&>button]:bg-black/60 [&>button]:text-white [&>button]:opacity-100 [&>button]:ring-1 [&>button]:ring-white/[0.15] [&>button]:backdrop-blur-xl [&>button]:hover:bg-white/[0.15]">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>

          <div className="relative max-h-[94vh] overflow-y-auto px-4 pb-5 pt-16 xl:px-0 xl:pb-2">
            <div className="pointer-events-none absolute -left-24 top-0 h-[420px] w-[520px] rounded-full bg-[#e5ff36]/20 blur-[90px]" />
            <div className="pointer-events-none absolute -right-20 top-28 h-[340px] w-[420px] rounded-full bg-[#78ff9d]/10 blur-[100px]" />
            <div className="relative grid grid-cols-1 items-start gap-5 sm:grid-cols-2 xl:grid-cols-4">
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
              const cardTone = isCurrent ? "current" : "dark";
              const featureRows = [
                {
                  icon: Coins,
                  label: "Monthly credits",
                  value: formatNumber(creditsPerMonth),
                },
                {
                  icon: ImageIcon,
                  label: "Image generation",
                  value: isFree ? "Locked" : imageCount == null ? "-" : `~${formatNumber(imageCount)} / mo`,
                  muted: isFree,
                },
                {
                  icon: Film,
                  label: "VDO generation",
                  value: isFree ? "Locked" : videoCount == null ? "-" : `~${formatNumber(videoCount)} / mo`,
                  muted: isFree,
                },
                {
                  icon: Languages,
                  label: "Translate VDO",
                  value: translateCount == null ? "-" : `~${formatNumber(translateCount)} min`,
                },
                {
                  icon: Captions,
                  label: "Auto Subtitle",
                  value: subtitleCount == null ? "-" : `~${formatNumber(subtitleCount)} min`,
                },
              ];
              const urgencyCopy =
                reason === "feature_locked"
                  ? `${featureName || "This feature"} needs Starter or higher.`
                  : isEducationSpace
                    ? "Class credit balance is too low."
                    : shortage > 0
                      ? `Short by ${shortageText} credits.`
                      : null;
              const headlineCopy =
                urgencyCopy && isCurrent
                  ? urgencyCopy
                  : PLAN_COPY[plan.name as (typeof PLAN_ORDER)[number]];
              const badgeLabel = isCurrent ? "Current plan" : isPro ? "Most popular" : "Plan";
              const priceLabel = plan.price_thb <= 0 ? "Free" : `THB ${formatNumber(plan.price_thb)}`;
              const creditLabel = `${formatNumber(creditsPerMonth)} credits / month`;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "group relative isolate flex min-h-[610px] overflow-hidden rounded-[34px] border bg-[#070907]/92 p-7 text-white shadow-[0_34px_120px_rgba(0,0,0,0.68)] backdrop-blur-2xl transition-transform hover:-translate-y-1",
                    isPro ? "border-[#e5ff36]/80" : "border-white/[0.12]",
                    isCurrent &&
                      "border-[#e5ff36] shadow-[0_0_0_1px_rgba(229,255,54,0.65),0_28px_90px_rgba(229,255,54,0.18)]",
                  )}
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-[270px] bg-[radial-gradient(circle_at_17%_14%,rgba(229,255,54,0.72),transparent_27%),linear-gradient(135deg,rgba(173,214,24,0.82)_0%,rgba(40,56,18,0.72)_34%,rgba(7,9,7,0.1)_76%)]" />
                  <div className="pointer-events-none absolute right-[-78px] top-[-28px] h-[272px] w-[272px] rotate-[-24deg] rounded-[76px] border border-white/10 bg-black/[0.18]" />
                  <div className="pointer-events-none absolute right-[-34px] top-[84px] h-[235px] w-[132px] rounded-full border border-white/10 bg-black/[0.22]" />
                  <div className="pointer-events-none absolute left-8 top-8 h-1.5 w-1.5 rounded-full bg-white/[0.35]" />
                  <div className="pointer-events-none absolute left-20 top-16 h-2 w-2 rounded-full bg-white/[0.15]" />
                  <div className="pointer-events-none absolute right-24 top-9 h-1.5 w-1.5 rounded-full bg-white/30" />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(7,9,7,0.16)_32%,rgba(7,9,7,0.95)_100%)]" />

                  <div className="relative z-10 flex min-h-[554px] w-full flex-col">
                    <div className="flex min-h-[72px] items-start justify-between gap-4">
                      <div className="grid h-[68px] w-[68px] place-items-center rounded-full bg-[#e5ff36] text-[20px] font-black text-black shadow-[0_18px_34px_rgba(0,0,0,0.42)] ring-1 ring-white/30">
                        m.
                      </div>
                      <div
                        className={cn(
                          "rounded-full border px-3.5 py-1.5 text-[14px] font-semibold leading-none backdrop-blur-xl",
                          isCurrent
                            ? "border-[#e5ff36]/70 bg-[#e5ff36] text-black"
                            : "border-white/[0.15] bg-black/30 text-zinc-100",
                        )}
                      >
                        {badgeLabel}
                      </div>
                    </div>

                    <div className="mt-10">
                      <h3 className="text-[34px] font-medium leading-none tracking-normal">{plan.name}</h3>
                      <p className="mt-5 min-h-[84px] max-w-[240px] text-[18px] font-medium leading-7 text-zinc-300">
                        {headlineCopy}
                      </p>
                      <div className="mt-8 flex items-end gap-2">
                        <span className="text-[42px] font-light leading-none tracking-normal">{priceLabel}</span>
                        {plan.price_thb > 0 && (
                          <span className="pb-1 text-[18px] font-semibold text-zinc-400">
                            /month
                          </span>
                        )}
                      </div>
                      <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-[13px] font-semibold text-zinc-300">
                        {creditLabel}
                      </div>
                    </div>

                    <Button
                      className="mt-8 h-[58px] rounded-xl bg-[#e5ff36] text-[17px] font-black text-black shadow-[0_18px_34px_rgba(0,0,0,0.34)] hover:bg-[#efff72]"
                      onClick={onCtaClick}
                    >
                      {ctaLabel === "Choose plan" ? "Choose this plan" : ctaLabel}
                    </Button>

                    <div className="mt-8 flex items-center gap-3 text-zinc-500">
                      <div className="h-px flex-1 bg-white/[0.12]" />
                      <span className="text-[12px] font-black uppercase">MediaForge</span>
                      <div className="h-px flex-1 bg-white/[0.12]" />
                    </div>

                    <div className="mt-6 grid gap-3.5">
                      {featureRows.map((row) => (
                        <PlanExampleRow
                          key={row.label}
                          icon={row.icon}
                          label={row.label}
                          value={row.value}
                          muted={row.muted}
                          tone={cardTone}
                        />
                      ))}
                      {reason === "credits" && isCurrent && shortage > 0 && !isEducationSpace && (
                        <PlanExampleRow
                          icon={Sparkles}
                          label="Credit shortage"
                          value={shortageText}
                          tone={cardTone}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
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
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  muted?: boolean;
  tone: "dark" | "current";
}) => (
  <div className={cn("flex items-center gap-3 text-zinc-300", muted && "opacity-55")}>
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-zinc-200",
        tone === "current" && "bg-[#e5ff36]/[0.18] text-[#e5ff36]",
      )}
    >
      {muted ? (
        <LockKeyhole className="h-4 w-4" />
      ) : (
        <CheckCircle2 className="h-4 w-4" />
      )}
    </span>
    <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
    <span className="min-w-0 flex-1 text-[16px] font-medium leading-6">
      {label}
    </span>
    <span className="shrink-0 text-right text-[13px] font-black text-[#e5ff36]">
      {value}
    </span>
  </div>
);

export default InsufficientCreditsDialog;

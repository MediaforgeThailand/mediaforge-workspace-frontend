import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpCircle,
  BookOpen,
  Captions,
  Check,
  Coins,
  Film,
  Image as ImageIcon,
  Languages,
  LockKeyhole,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
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
const PLAN_DESCRIPTIONS: Record<(typeof PLAN_ORDER)[number], string> = {
  Free: "Try voice, translate, subtitle and utility tools with 1,000 credits/month.",
  Starter: "A practical entry plan for daily prompt, audio and light generation work.",
  Creator: "More monthly credits for consistent image, video and translate workflows.",
  Pro: "Higher credit pool plus better runtime discount for heavier production use.",
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
        <DialogContent className="max-h-[92vh] max-w-[980px] overflow-y-auto border-white/10 bg-[#111827] p-0 text-white shadow-2xl shadow-black/50">
          <div className="grid gap-5 p-5 sm:p-6">
            <DialogHeader className="space-y-2">
              <DialogTitle className="flex items-center gap-2 text-[22px] font-black tracking-tight text-white">
                {reason === "feature_locked" ? (
                  <LockKeyhole className="h-5 w-5 text-amber-300" />
                ) : (
                  <Coins className="h-5 w-5 text-sky-400" />
                )}
                {title}
              </DialogTitle>
              <DialogDescription className="max-w-[720px] text-sm leading-6 text-zinc-300">
                {description}
              </DialogDescription>
            </DialogHeader>

            <div
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm font-semibold",
                reason === "feature_locked"
                  ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                  : "border-sky-400/20 bg-sky-500/10 text-sky-100",
              )}
            >
              {reason === "feature_locked" ? (
                <span>
                  Current plan: {(profile as { plan_name?: string | null } | null)?.plan_name || "Free"}.{" "}
                  Image, video and upscale tools require a paid plan.
                </span>
              ) : isEducationSpace ? (
                t("insufficientCredits.classSpaceLocked")
              ) : shortage > 0 ? (
                t("insufficientCredits.shortBy", { shortage: shortageText })
              ) : (
                t("insufficientCredits.topUpOrChoosePlan")
              )}
            </div>

            {isEducationSpace ? (
              <Button
                className="h-11 w-full bg-emerald-500 font-semibold text-white hover:bg-emerald-400"
                onClick={() => onOpenChange(false)}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                {t("insufficientCredits.backToClassSpace")}
              </Button>
            ) : (
              <>
                <div className="grid gap-3 lg:grid-cols-4">
                  {planCards.map((plan) => {
                    const creditsPerMonth = plan.upfront_credits || (plan.name === "Free" ? FREE_PLAN_CREDITS : 0);
                    const isFree = plan.name === "Free";
                    const isPro = plan.name === "Pro";
                    const imageCount = exampleCosts.image ? Math.floor(creditsPerMonth / exampleCosts.image) : null;
                    const videoCount = exampleCosts.video ? Math.floor(creditsPerMonth / exampleCosts.video) : null;
                    const translateCount = exampleCosts.translate ? Math.floor(creditsPerMonth / exampleCosts.translate) : null;
                    const subtitleCount = exampleCosts.subtitle ? Math.floor(creditsPerMonth / exampleCosts.subtitle) : null;
                    return (
                      <div
                        key={plan.id}
                        className={cn(
                          "relative rounded-2xl border bg-white/[0.055] p-4",
                          isPro
                            ? "border-white bg-white text-zinc-950"
                            : "border-white/10 text-white",
                        )}
                      >
                        {isPro && (
                          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-950 px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white">
                            Best value
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-[20px] font-black leading-6">{plan.name}</h3>
                            <p className={cn("mt-1 min-h-[44px] text-[12px] leading-[16px]", isPro ? "text-zinc-600" : "text-zinc-300")}>
                              {PLAN_DESCRIPTIONS[plan.name as (typeof PLAN_ORDER)[number]] ?? ""}
                            </p>
                          </div>
                          <Sparkles className={cn("mt-1 h-4 w-4", isPro ? "text-zinc-950" : "text-yellow-300")} />
                        </div>

                        <div className="mt-4">
                          <div className="text-[26px] font-black leading-none">{displayPlanPrice(plan)}</div>
                          <div className={cn("mt-1 text-[12px] font-semibold", isPro ? "text-zinc-600" : "text-zinc-300")}>
                            {formatNumber(creditsPerMonth)} credits / month
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 text-[12px] font-semibold leading-[17px]">
                          <PlanExampleRow
                            icon={ImageIcon}
                            label="Images"
                            value={isFree ? "Locked" : imageCount == null ? "-" : `~${formatNumber(imageCount)} / mo`}
                            muted={isFree}
                            dark={isPro}
                          />
                          <PlanExampleRow
                            icon={Film}
                            label="VDO 8s"
                            value={isFree ? "Locked" : videoCount == null ? "-" : `~${formatNumber(videoCount)} / mo`}
                            muted={isFree}
                            dark={isPro}
                          />
                          <PlanExampleRow
                            icon={Languages}
                            label="Translate 1m"
                            value={translateCount == null ? "-" : `~${formatNumber(translateCount)} / mo`}
                            dark={isPro}
                          />
                          <PlanExampleRow
                            icon={Captions}
                            label="Auto subtitle 1m"
                            value={subtitleCount == null ? "-" : `~${formatNumber(subtitleCount)} / mo`}
                            dark={isPro}
                          />
                        </div>

                        <Button
                          className={cn(
                            "mt-4 h-10 w-full rounded-xl text-[13px] font-black",
                            isPro
                              ? "bg-zinc-950 text-white hover:bg-zinc-800"
                              : "bg-white/10 text-white hover:bg-white/15",
                          )}
                          onClick={handleGoToPricing}
                        >
                          {isFree ? "View pricing" : "Choose plan"}
                        </Button>
                      </div>
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {reason === "credits" && (
                    <Button
                      className="h-12 w-full bg-sky-500 font-black text-white hover:bg-sky-400"
                      onClick={() => setTopupOpen(true)}
                    >
                      <Zap className="mr-2 h-4 w-4" />
                      {t("insufficientCredits.quickTopUpPromptPay")}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    className={cn(
                      "h-12 w-full border-white/15 bg-white/5 font-black text-white hover:bg-white/10",
                      reason === "feature_locked" && "sm:col-span-2",
                    )}
                    onClick={handleGoToPricing}
                  >
                    <ArrowUpCircle className="mr-2 h-4 w-4" />
                    {t("insufficientCredits.goToPlansPricing")}
                  </Button>
                </div>
              </>
            )}
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
  <div className={cn("flex items-center justify-between gap-2", muted && "opacity-55")}>
    <span className="inline-flex items-center gap-2">
      {muted ? <LockKeyhole className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
      <span>{label}</span>
    </span>
    <span className={cn("text-right", dark ? "text-zinc-700" : "text-zinc-200")}>
      {muted ? (
        value
      ) : (
        <span className="inline-flex items-center gap-1">
          <Check className="h-3 w-3 text-emerald-400" />
          {value}
        </span>
      )}
    </span>
  </div>
);

export default InsufficientCreditsDialog;

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Captions,
  CheckCircle2,
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
import logoIcon from "@/assets/logo-icon.png";

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
const FREE_PLAN_CREDITS = 500;
const PLAN_ORDER = ["Free", "Starter", "Creator", "Pro"] as const;
const PLAN_COPY: Record<"en" | "th", Record<(typeof PLAN_ORDER)[number], string>> = {
  en: {
    Free: "500 starter credits for getting started. Add credits or upgrade when you need more capacity.",
    Starter: "Daily prompts, audio and light generation for a practical start.",
    Creator: "More room for image, video, translate and subtitle workflows.",
    Pro: "Best value for heavier production and faster iteration.",
  },
  th: {
    Free: "เริ่มใช้เครื่องมือพื้นฐานได้ แต่สร้างภาพ วิดีโอ และอัปสเกลต้องใช้แพ็กเกจชำระเงิน",
    Starter: "เหมาะสำหรับเริ่มสร้างงานรายวัน ทั้ง prompt, audio และงานเจนเบา ๆ",
    Creator: "เครดิตมากขึ้นสำหรับงานภาพ วิดีโอ แปลเสียง และซับไตเติล",
    Pro: "คุ้มที่สุดสำหรับงานโปรดักชันที่ต้องเจนต่อเนื่องมากขึ้น",
  },
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
  const { t, language } = useLanguage();
  const [topupOpen, setTopupOpen] = useState(false);
  const isThai = language === "th";

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
      ? isThai
        ? "อัปเกรดเพื่อใช้ฟีเจอร์นี้"
        : "Upgrade to unlock this feature"
      : isEducationSpace
        ? t("insufficientCredits.classSpaceLow")
        : t("insufficientCredits.notEnough");
  const displayFeatureName =
    isThai && featureName
      ? featureName
          .replace(/Image generation/i, "สร้างภาพ")
          .replace(/Video generation|VDO generation/i, "สร้างวิดีโอ")
          .replace(/Upscale/i, "ขยายภาพ")
          .replace(/Translate/i, "แปลวิดีโอ")
          .replace(/Auto Subtitle/i, "ซับอัตโนมัติ")
      : featureName;
  const description =
    reason === "feature_locked"
      ? isThai
        ? `${displayFeatureName || "ฟีเจอร์นี้"} ยังไม่รวมอยู่ในแพ็กเกจปัจจุบัน เลือก Starter ขึ้นไปเพื่อใช้งาน`
        : `${displayFeatureName || "This feature"} is not included in your current plan. Choose Starter or higher to unlock it.`
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
        <DialogContent className="!fixed !inset-0 !left-0 !top-0 !z-[1000] !h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 overflow-hidden border-0 bg-transparent p-0 text-white shadow-none outline-none focus:outline-none focus-visible:outline-none [&>button]:right-4 [&>button]:top-4 [&>button]:z-30 [&>button]:h-12 [&>button]:w-12 [&>button]:rounded-full [&>button]:border [&>button]:border-white/[0.14] [&>button]:bg-black/40 [&>button]:text-white [&>button]:opacity-100 [&>button]:backdrop-blur-xl [&>button]:hover:bg-white/[0.1] md:[&>button]:right-5 md:[&>button]:top-4 md:[&>button]:h-[52px] md:[&>button]:w-[52px] xl:[&>button]:right-4 xl:[&>button]:top-3">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>

          <div className="relative h-[100dvh] overflow-y-auto bg-transparent">
            <div className="pointer-events-none absolute inset-0 bg-black/55 backdrop-blur-[22px]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_14%,rgba(255,255,255,0.07),transparent_24%),linear-gradient(180deg,rgba(0,0,0,0.16),rgba(0,0,0,0.76))]" />
            <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1500px] items-center justify-center px-5 py-8 sm:px-7 xl:px-10 xl:py-7">
              <div className="grid w-full grid-cols-1 items-center gap-5 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
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
                  ? isThai ? "เติมเครดิต" : "Top up credits"
                  : isCurrent && reason === "feature_locked"
                    ? isThai ? "อัปเกรดแพ็กเกจ" : "Upgrade plan"
                    : isFree
                      ? isThai ? "ดูแพ็กเกจ" : "View plans"
                      : isThai ? "เลือกแพ็กเกจ" : "Choose plan";
              const onCtaClick = reason === "credits" && isCurrent ? () => setTopupOpen(true) : handleGoToPricing;
              const featureRows = [
                {
                  icon: ImageIcon,
                  label: isThai ? "ภาพ" : "Image",
                  value: isFree
                    ? isThai ? "ล็อก" : "Locked"
                    : imageCount == null ? "-" : `~${formatNumber(imageCount)}${isThai ? " รูป/เดือน" : " / mo"}`,
                  muted: isFree,
                },
                {
                  icon: Film,
                  label: isThai ? "VDO" : "VDO",
                  value: isFree
                    ? isThai ? "ล็อก" : "Locked"
                    : videoCount == null ? "-" : `~${formatNumber(videoCount)}${isThai ? " คลิป/เดือน" : " / mo"}`,
                  muted: isFree,
                },
                {
                  icon: Languages,
                  label: isThai ? "แปล" : "Translate",
                  value: translateCount == null ? "-" : `~${formatNumber(translateCount)} ${isThai ? "นาที/เดือน" : "min"}`,
                },
                {
                  icon: Captions,
                  label: isThai ? "ซับ" : "Subtitle",
                  value: subtitleCount == null ? "-" : `~${formatNumber(subtitleCount)} ${isThai ? "นาที/เดือน" : "min"}`,
                },
              ];
              const urgencyCopy =
                reason === "feature_locked"
                  ? isThai
                    ? `${displayFeatureName || "ฟีเจอร์นี้"} ต้องใช้ Starter ขึ้นไป`
                    : `${displayFeatureName || "This feature"} needs Starter or higher.`
                  : isEducationSpace
                    ? isThai ? "เครดิตของคลาสไม่พอ" : "Class credit balance is too low."
                    : shortage > 0
                      ? isThai ? `ขาดอีก ${shortageText} เครดิต` : `Short by ${shortageText} credits.`
                      : null;
              const headlineCopy =
                urgencyCopy && isCurrent
                  ? urgencyCopy
                  : PLAN_COPY[isThai ? "th" : "en"][plan.name as (typeof PLAN_ORDER)[number]];
              const badgeLabel = isCurrent
                ? isThai ? "แพ็กเกจปัจจุบัน" : "Current plan"
                : isPro
                  ? isThai ? "คุ้มสุด" : "Most popular"
                  : isThai ? "แพ็กเกจ" : "Plan";
              const priceLabel = plan.price_thb <= 0 ? "Free" : `THB ${formatNumber(plan.price_thb)}`;
              const creditLabel = isThai
                ? `${formatNumber(creditsPerMonth)} เครดิต/เดือน`
                : `${formatNumber(creditsPerMonth)} credits / month`;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "group relative isolate flex h-auto min-h-[730px] overflow-hidden rounded-[32px] border border-white/[0.13] bg-[#070807]/95 px-8 pb-7 pt-9 text-white shadow-[0_42px_100px_rgba(0,0,0,0.66)] backdrop-blur-2xl transition-transform hover:-translate-y-0.5 sm:px-9 xl:h-[min(712px,calc(100dvh-56px))] xl:min-h-0 xl:px-7 xl:pb-5 xl:pt-7",
                    (isCurrent || isPro) && "border-white/[0.22]",
                  )}
                >
                  <img
                    src={logoIcon}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-24 -top-20 h-[330px] w-[330px] rotate-[-10deg] object-contain opacity-[0.055] mix-blend-screen xl:-right-20 xl:-top-16 xl:h-[270px] xl:w-[270px]"
                  />
                  <img
                    src={logoIcon}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-24 -left-28 h-[300px] w-[300px] rotate-[14deg] object-contain opacity-[0.035] mix-blend-screen xl:h-[250px] xl:w-[250px]"
                  />
                  <div className="pointer-events-none absolute right-[-96px] top-[-54px] h-[286px] w-[286px] rotate-[-24deg] rounded-[76px] border border-white/[0.08] bg-white/[0.025] xl:h-[240px] xl:w-[240px]" />
                  <div className="pointer-events-none absolute right-[-46px] top-[126px] h-[238px] w-[132px] rounded-full border border-white/[0.08] bg-black/[0.18] xl:top-[108px] xl:h-[200px] xl:w-[112px]" />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.07),rgba(255,255,255,0.015)_34%,rgba(0,0,0,0.82)_100%)]" />

                  <div className="relative z-10 flex h-full w-full flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="min-w-0 flex-1 text-[44px] font-light leading-none tracking-normal xl:text-[35px]">
                        {plan.name}
                      </h3>
                      <div
                        className={cn(
                          "shrink-0 rounded-full border px-4 py-2.5 text-[13px] font-semibold leading-none backdrop-blur-xl xl:px-3.5 xl:py-2 xl:text-[12px]",
                          isCurrent
                            ? "border-[#e5ff36]/70 bg-[#e5ff36] text-black"
                            : "border-white/[0.15] bg-black/30 text-zinc-100",
                        )}
                      >
                        {badgeLabel}
                      </div>
                    </div>

                    <div className="mt-12 xl:mt-9">
                      <p className="min-h-[82px] max-w-[330px] text-[22px] font-medium leading-[1.5] text-zinc-300 xl:min-h-[62px] xl:text-[15px] xl:leading-[1.45]">
                        {headlineCopy}
                      </p>
                      <div className="mt-8 flex items-end gap-2 xl:mt-5">
                        <span className="text-[58px] font-light leading-none tracking-normal xl:text-[39px]">{priceLabel}</span>
                        {plan.price_thb > 0 && (
                          <span className="pb-1.5 text-[22px] font-semibold text-zinc-400 xl:text-[13px]">
                            {isThai ? "/เดือน" : "/month"}
                          </span>
                        )}
                      </div>
                      <div className="mt-5 inline-flex rounded-full border border-white/10 bg-white/[0.08] px-5 py-2.5 text-[16px] font-semibold text-zinc-300 xl:mt-3 xl:px-4 xl:py-2 xl:text-[12px]">
                        {creditLabel}
                      </div>
                    </div>

                    <Button
                      className="mt-9 h-[70px] rounded-[18px] bg-[#e5ff36] px-6 text-[22px] font-black text-black shadow-[0_20px_38px_rgba(0,0,0,0.34)] hover:bg-[#efff72] xl:mt-6 xl:h-[62px] xl:text-[16px]"
                      onClick={onCtaClick}
                    >
                      {ctaLabel === "Choose plan" ? "Choose this plan" : ctaLabel}
                    </Button>

                    <div className="mt-8 flex items-center gap-4 text-zinc-500 xl:mt-5">
                      <div className="h-px flex-1 bg-white/[0.12]" />
                      <span className="text-[15px] font-black uppercase tracking-normal xl:text-[11px]">MediaForge +</span>
                      <div className="h-px flex-1 bg-white/[0.12]" />
                    </div>

                    <div className="mt-6 grid gap-4 xl:mt-4 xl:gap-3">
                      {featureRows.map((row) => (
                        <PlanExampleRow
                          key={row.label}
                          icon={row.icon}
                          label={row.label}
                          value={row.value}
                          muted={row.muted}
                          current={isCurrent}
                        />
                      ))}
                      {reason === "credits" && isCurrent && shortage > 0 && !isEducationSpace && (
                        <PlanExampleRow
                          icon={Sparkles}
                          label={isThai ? "เครดิตที่ขาด" : "Credit shortage"}
                          value={shortageText}
                          current={isCurrent}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
              </div>
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
  current,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  muted?: boolean;
  current: boolean;
}) => (
  <div
    className={cn(
      "flex min-w-0 items-center gap-3 text-zinc-300 sm:gap-4 xl:gap-2",
      muted && "opacity-58",
    )}
  >
    <span
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-zinc-200 sm:h-12 sm:w-12 xl:h-8 xl:w-8",
        current && "bg-[#e5ff36]/[0.2] text-[#e5ff36]",
      )}
    >
      {muted ? (
        <LockKeyhole className="h-5 w-5 sm:h-6 sm:w-6 xl:h-4 xl:w-4" />
      ) : (
        <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 xl:h-4 xl:w-4" />
      )}
    </span>
    <Icon className="h-6 w-6 shrink-0 text-zinc-500 sm:h-7 sm:w-7 xl:h-[18px] xl:w-[18px]" />
    <span className="min-w-[74px] shrink-0 whitespace-nowrap text-[20px] font-medium leading-8 sm:text-[22px] xl:min-w-[44px] xl:text-[14px] xl:leading-5">
      {label}
    </span>
    <span className="ml-auto shrink-0 whitespace-nowrap text-[19px] font-semibold leading-8 text-[#e5ff36] sm:text-[20px] xl:text-[12px] xl:leading-5">
      {value}
    </span>
  </div>
);

export default InsufficientCreditsDialog;

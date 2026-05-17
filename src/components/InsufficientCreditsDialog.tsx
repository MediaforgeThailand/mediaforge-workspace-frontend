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
const PLAN_COPY: Record<"en" | "th", Record<(typeof PLAN_ORDER)[number], string>> = {
  en: {
    Free: "Utility tools for getting started. Creative generation unlocks on paid plans.",
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
        <DialogContent className="!fixed !inset-0 !left-0 !top-0 !z-[1000] !h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 overflow-hidden border-0 bg-black p-0 text-white shadow-none outline-none focus:outline-none focus-visible:outline-none [&>button]:right-4 [&>button]:top-4 [&>button]:z-30 [&>button]:h-12 [&>button]:w-12 [&>button]:rounded-full [&>button]:border [&>button]:border-white/[0.12] [&>button]:bg-black/30 [&>button]:text-white [&>button]:opacity-100 [&>button]:backdrop-blur-xl [&>button]:hover:bg-white/[0.1] md:[&>button]:right-5 md:[&>button]:top-4 md:[&>button]:h-[52px] md:[&>button]:w-[52px] xl:[&>button]:right-4 xl:[&>button]:top-3">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>

          <div className="relative h-[100dvh] overflow-y-auto bg-[#020302]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_3%_0%,rgba(229,255,54,0.7),transparent_12%),radial-gradient(circle_at_18%_15%,rgba(181,219,26,0.42),transparent_24%),linear-gradient(104deg,rgba(178,219,25,0.2)_0%,rgba(34,48,13,0.72)_24%,rgba(6,7,6,0.98)_58%,#000_100%)]" />
            <div className="pointer-events-none absolute inset-0 opacity-90 [background-image:radial-gradient(circle_at_2%_11%,rgba(255,255,255,.42)_0_2px,transparent_3px),radial-gradient(circle_at_8%_24%,rgba(255,255,255,.22)_0_2px,transparent_3px),radial-gradient(circle_at_15%_8%,rgba(255,255,255,.28)_0_2px,transparent_3px),radial-gradient(circle_at_25%_2%,rgba(255,255,255,.14)_0_4px,transparent_5px),radial-gradient(circle_at_32%_17%,rgba(229,255,54,.12)_0_6px,transparent_7px)]" />
            <div className="pointer-events-none absolute inset-y-0 left-0 w-full bg-[linear-gradient(90deg,rgba(229,255,54,0.18),transparent_36%)]" />
            <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1480px] items-center justify-center px-5 py-8 sm:px-7 xl:px-10 xl:py-7">
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
                    "group relative isolate flex h-auto min-h-[730px] overflow-hidden rounded-[32px] border bg-[#080908]/95 px-8 pb-7 pt-9 text-white shadow-[0_48px_120px_rgba(0,0,0,0.72)] backdrop-blur-2xl transition-transform hover:-translate-y-1 sm:px-9 xl:h-[min(712px,calc(100dvh-56px))] xl:min-h-0 xl:px-7 xl:pb-5 xl:pt-7",
                    isPro ? "border-[#e5ff36]/85" : "border-white/[0.12]",
                    isCurrent &&
                      "border-[#e5ff36] shadow-[0_0_0_1px_rgba(229,255,54,0.65),0_36px_120px_rgba(229,255,54,0.16)]",
                  )}
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-[260px] bg-[radial-gradient(circle_at_14%_14%,rgba(229,255,54,0.82),transparent_18%),linear-gradient(134deg,rgba(191,232,28,0.52)_0%,rgba(50,66,20,0.62)_32%,rgba(8,9,8,0.04)_75%)] xl:h-[230px]" />
                  <div className="pointer-events-none absolute right-[-94px] top-[-48px] h-[286px] w-[286px] rotate-[-24deg] rounded-[76px] border border-white/[0.09] bg-black/[0.25] xl:h-[240px] xl:w-[240px]" />
                  <div className="pointer-events-none absolute right-[-46px] top-[126px] h-[238px] w-[132px] rounded-full border border-white/[0.09] bg-black/[0.24] xl:top-[108px] xl:h-[200px] xl:w-[112px]" />
                  <div className="pointer-events-none absolute left-[17%] top-[86px] h-2 w-2 rounded-full bg-white/35" />
                  <div className="pointer-events-none absolute right-[38%] top-[83px] h-2.5 w-2.5 rounded-full bg-white/20" />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(8,9,8,0.1)_29%,rgba(8,9,8,0.98)_100%)]" />

                  <div className="relative z-10 flex h-full w-full flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div className="relative grid h-[74px] w-[74px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#e5ff36] shadow-[0_26px_38px_rgba(0,0,0,0.46)] ring-1 ring-white/30 xl:h-[58px] xl:w-[58px]">
                        <span className="absolute -left-4 top-2 h-10 w-14 rotate-[-28deg] rounded-full bg-black/20" />
                        <span className="absolute -right-3 bottom-2 h-11 w-14 rotate-[24deg] rounded-full bg-white/24" />
                        <Sparkles className="relative h-8 w-8 text-black xl:h-6 xl:w-6" strokeWidth={2.35} />
                      </div>
                      <div
                        className={cn(
                          "rounded-full border px-4 py-2.5 text-[12px] font-semibold leading-none backdrop-blur-xl xl:px-3 xl:py-1.5 xl:text-[9px]",
                          isCurrent
                            ? "border-[#e5ff36]/70 bg-[#e5ff36] text-black"
                            : "border-white/[0.15] bg-black/30 text-zinc-100",
                        )}
                      >
                        {badgeLabel}
                      </div>
                    </div>

                    <div className="mt-14 xl:mt-7">
                      <h3 className="text-[38px] font-light leading-none tracking-normal xl:text-[27px]">{plan.name}</h3>
                      <p className="mt-5 min-h-[76px] max-w-[310px] text-[18px] font-medium leading-[1.5] text-zinc-300 xl:mt-4 xl:min-h-[50px] xl:text-[11.5px] xl:leading-[1.45]">
                        {headlineCopy}
                      </p>
                      <div className="mt-7 flex items-end gap-2 xl:mt-4">
                        <span className="text-[48px] font-light leading-none tracking-normal xl:text-[30px]">{priceLabel}</span>
                        {plan.price_thb > 0 && (
                          <span className="pb-1.5 text-[18px] font-semibold text-zinc-400 xl:text-[10px]">
                            {isThai ? "/เดือน" : "/month"}
                          </span>
                        )}
                      </div>
                      <div className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-[13px] font-semibold text-zinc-300 xl:mt-2.5 xl:px-3 xl:py-1.5 xl:text-[9px]">
                        {creditLabel}
                      </div>
                    </div>

                    <Button
                      className="mt-9 h-[62px] rounded-xl bg-[#e5ff36] text-[18px] font-black text-black shadow-[0_24px_44px_rgba(0,0,0,0.38)] hover:bg-[#efff72] xl:mt-5 xl:h-12 xl:text-[12px]"
                      onClick={onCtaClick}
                    >
                      {ctaLabel === "Choose plan" ? "Choose this plan" : ctaLabel}
                    </Button>

                    <div className="mt-8 flex items-center gap-4 text-zinc-500 xl:mt-4">
                      <div className="h-px flex-1 bg-white/[0.12]" />
                      <span className="text-[12px] font-black uppercase tracking-normal xl:text-[9px]">MediaForge +</span>
                      <div className="h-px flex-1 bg-white/[0.12]" />
                    </div>

                    <div className="mt-6 grid gap-4 xl:mt-3 xl:gap-2.5">
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
  <div className={cn("flex min-w-0 items-center gap-4 text-zinc-300 xl:gap-2.5", muted && "opacity-58")}>
    <span
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-zinc-200 xl:h-7 xl:w-7",
        current && "bg-[#e5ff36]/[0.2] text-[#e5ff36]",
      )}
    >
      {muted ? (
        <LockKeyhole className="h-5 w-5 xl:h-3.5 xl:w-3.5" />
      ) : (
        <CheckCircle2 className="h-5 w-5 xl:h-3.5 xl:w-3.5" />
      )}
    </span>
    <Icon className="h-6 w-6 shrink-0 text-zinc-500 xl:h-[18px] xl:w-[18px]" />
    <span className="min-w-0 flex-1 truncate text-[18px] font-medium leading-7 xl:text-[11.5px] xl:leading-4">
      {label}
    </span>
    <span className="shrink-0 whitespace-nowrap text-[16px] font-semibold leading-7 text-[#e5ff36] xl:text-[10.5px] xl:leading-4">
      {value}
    </span>
  </div>
);

export default InsufficientCreditsDialog;

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Zap, Crown, Building2, Palette, Rocket, Boxes } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface PlanData {
  id: string;
  name: string;
  target: string;
  billing_cycle: string;
  price_thb: number;
  upfront_credits: number;
  flow_quota: number | null;
  discount_official: number;
  discount_community: number;
  cashback_percent?: number | null;
}

interface PricingPlanCardProps {
  plan: PlanData;
  features: string[];
  isPopular: boolean;
  isCurrent: boolean;
  billingCycle: "monthly" | "annual";
  monthlyPrice: number;
  monthlyCredits: number;
  language: string;
  onSubscribe: () => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Starter: Sparkles,
  Growth: Zap,
  Professional: Crown,
  Enterprise: Building2,
  Hobbyist: Palette,
  Pro: Crown,
  Studio: Boxes,
};

const PricingPlanCard = ({
  plan,
  features,
  isPopular,
  isCurrent,
  billingCycle,
  monthlyPrice,
  monthlyCredits: _monthlyCredits,
  language: _language,
  onSubscribe,
}: PricingPlanCardProps) => {
  const { t } = useLanguage();
  const Icon = ICON_MAP[plan.name] || Rocket;
  const isAnnual = billingCycle === "annual";
  const monthlyEquivPrice = isAnnual && plan.price_thb > 0 ? Math.round(plan.price_thb / 12) : plan.price_thb;
  const cashbackPercent = plan.cashback_percent ?? 0;

  return (
    <div
      className={cn(
        "relative bg-card/60 border backdrop-blur-xl rounded-2xl shadow-xl shadow-black/20 p-6 flex flex-col tech-card transition-all",
        isCurrent
          ? "border-primary ring-2 ring-primary/30"
          : isPopular
            ? "border-primary/50 ring-1 ring-primary/10"
            : "border-border"
      )}
    >
      {/* Top badge */}
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <Badge className="bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 shadow-lg">
            {t("pricingYourPlan")}
          </Badge>
        </div>
      )}
      {!isCurrent && isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <Badge className="gradient-primary text-primary-foreground text-xs font-semibold px-4 py-1 shadow-lg">
            {t("pricingMostPopular")}
          </Badge>
        </div>
      )}

      {/* Header */}
      <div className="text-center pb-4 border-b border-border">
        <div
          className={cn(
            "w-11 h-11 mx-auto rounded-xl flex items-center justify-center mb-3",
            isPopular ? "gradient-primary" : "bg-secondary"
          )}
        >
          {isPopular ? (
            <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}>
              <Icon className="w-6 h-6 text-primary-foreground" />
            </motion.div>
          ) : (
            <Icon className={cn("w-6 h-6", "text-muted-foreground")} />
          )}
        </div>
        <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>

        {/* Price */}
        <div className="mt-3">
          {isAnnual ? (
            <div className="space-y-1">
              <span className="text-3xl font-bold text-foreground">
                ฿{plan.price_thb.toLocaleString()}
              </span>
              <span className="text-muted-foreground text-sm">/{t("pricingPlanCard.year")}</span>
              <p className="text-xs text-muted-foreground">
                ≈ ฿{monthlyEquivPrice.toLocaleString()}/{t("pricingPlanCard.monthShort")}
              </p>
              {monthlyPrice > 0 && (
                <p className="text-xs text-muted-foreground line-through">
                  ฿{(monthlyPrice * 12).toLocaleString()}/{t("pricingPlanCard.year")}
                </p>
              )}
            </div>
          ) : (
            <div>
              <span className="text-3xl font-bold text-foreground">
                ฿{plan.price_thb.toLocaleString()}
              </span>
              <span className="text-muted-foreground text-sm">/{t("pricingPlanCard.monthShort")}</span>
            </div>
          )}
        </div>

        {/* Upfront Credits — Freepik-style emphasis */}
        {plan.upfront_credits > 0 && (
          <div className={cn(
            "mt-3 rounded-xl py-2.5 px-3",
            isAnnual
              ? "bg-primary/10 border border-primary/20"
              : "bg-secondary/50"
          )}>
            {isAnnual ? (
              <>
                <p className="text-xs text-primary font-medium mb-0.5">
                  {t("pricingReceiveToday")}
                </p>
                <p className="text-2xl font-black text-primary tabular-nums">
                  {plan.upfront_credits.toLocaleString()}
                </p>
                <p className="text-[10px] text-primary/70 font-medium">
                  {t("pricingPlanCard.credits")}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-foreground">
                  {plan.upfront_credits.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {t("pricingCreditsPerMonth")}
                </p>
              </>
            )}
          </div>
        )}

        {/* Flow quota for creators */}
        {plan.target === "creator" && (
          <p className="text-xs text-muted-foreground mt-2">
            {plan.flow_quota
              ? t("pricingMaxFlows", { n: plan.flow_quota })
              : t("pricingUnlimitedFlows")}
          </p>
        )}
      </div>

      {/* Discount & Cashback badges */}
      {(plan.discount_official > 0 || plan.discount_community > 0 || cashbackPercent > 0) && (
        <div className="flex flex-wrap gap-1.5 pt-3">
          {cashbackPercent > 0 && (
            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
              {t("pricingPlanCard.cashback", { percent: cashbackPercent })}
            </Badge>
          )}
          {plan.discount_official > 0 && (
            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
              {t("pricingPlanCard.officialDiscount", { percent: plan.discount_official })}
            </Badge>
          )}
          {plan.discount_community > 0 && (
            <Badge variant="outline" className="text-[10px] border-accent/30 text-accent">
              {t("pricingPlanCard.communityDiscount", { percent: plan.discount_community })}
            </Badge>
          )}
        </div>
      )}

      {/* Features */}
      <ul className="py-4 space-y-2 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span className="text-sm text-foreground">{f}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Button
        variant={isCurrent ? "secondary" : isPopular ? "gradient" : "outline"}
        size="lg"
        className="w-full"
        disabled={isCurrent}
        onClick={onSubscribe}
      >
        {isCurrent ? t("pricingYourPlan") : t("pricingSubscribe")}
      </Button>
    </div>
  );
};

export default PricingPlanCard;

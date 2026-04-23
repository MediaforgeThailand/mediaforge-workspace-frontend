import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Plus, ArrowUpCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import EmbeddedCheckoutModal from "./EmbeddedCheckoutModal";

interface TopupPackage {
  id: string;
  name: string;
  credits: number;
  price_thb: number;
  stripe_price_id: string | null;
  is_active: boolean;
  sort_order: number;
}

interface InsufficientCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredCredits?: number;
}

const InsufficientCreditsDialog = ({
  open,
  onOpenChange,
  requiredCredits,
}: InsufficientCreditsDialogProps) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { credits } = useCredits();
  const { language, t } = useLanguage();
  const isSubscribed = profile?.subscription_status !== "free";

  const [topupPackages, setTopupPackages] = useState<TopupPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPkgId, setSelectedPkgId] = useState("");
  const [checkoutMode, setCheckoutMode] = useState<"subscription" | "topup">("topup");

  useEffect(() => {
    if (open && isSubscribed) {
      supabase
        .from("topup_packages" as any)
        .select("*")
        .eq("is_active", true)
        .order("sort_order")
        .then(({ data }) => {
          if (data) setTopupPackages(data as any);
        });
    }
  }, [open, isSubscribed]);

  const handleTopup = (pkg: TopupPackage) => {
    setSelectedPkgId(pkg.id);
    setCheckoutMode("topup");
    setCheckoutOpen(true);
  };

  const handleGoToPricing = () => {
    onOpenChange(false);
    navigate("/app/pricing");
  };

  const balance = credits?.balance ?? 0;
  const shortage = requiredCredits ? requiredCredits - balance : 0;

  return (
    <>
      <Dialog open={open && !checkoutOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Coins className="w-5 h-5 text-destructive" />
              {t("insuffCreditsTitle")}
            </DialogTitle>
            <DialogDescription>
              {requiredCredits ? t("insuffCreditsNeed", { balance: balance.toLocaleString(), required: requiredCredits.toLocaleString() }) : t("insuffCreditsHave", { balance: balance.toLocaleString() })}
            </DialogDescription>
          </DialogHeader>

          {isSubscribed ? (
            <div className="space-y-4 mt-2">
              {/* Top-up options for subscribers */}
              <p className="text-sm text-muted-foreground">
                {t("insuffTopupDesc")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {topupPackages.slice(0, 4).map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => handleTopup(pkg)}
                    className="flex flex-col items-center p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  >
                    <span className="text-lg font-bold text-foreground">
                      {pkg.credits.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">credits</span>
                    <span className="text-sm font-semibold text-foreground mt-1">
                      ฿{Number(pkg.price_thb).toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">
                  {t("insuffOr")}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoToPricing}
              >
                <ArrowUpCircle className="w-4 h-4 mr-2" />
                {t("insuffUpgrade")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground">
                {t("insuffSubscribeDesc")}
              </p>
              <Button
                className="w-full gradient-primary text-primary-foreground"
                onClick={handleGoToPricing}
              >
                <ArrowUpCircle className="w-4 h-4 mr-2" />
                {t("insuffViewPlans")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EmbeddedCheckoutModal
        open={checkoutOpen}
        onOpenChange={(v) => {
          setCheckoutOpen(v);
          if (!v) onOpenChange(false);
        }}
        mode={checkoutMode}
        packageId={selectedPkgId}
      />
    </>
  );
};

export default InsufficientCreditsDialog;

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowUpCircle, BookOpen, Coins, Zap } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { useLanguage } from "@/contexts/LanguageContext";
import BuyCreditsDialog from "@/components/settings/BuyCreditsDialog";

interface InsufficientCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredCredits?: number;
  workspaceId?: string | null;
}

const InsufficientCreditsDialog = ({
  open,
  onOpenChange,
  requiredCredits,
  workspaceId,
}: InsufficientCreditsDialogProps) => {
  const navigate = useNavigate();
  const { credits, refetch } = useCredits(workspaceId);
  const { t } = useLanguage();
  const [topupOpen, setTopupOpen] = useState(false);

  const balance = credits?.balance ?? 0;
  const shortage = requiredCredits ? Math.max(0, requiredCredits - balance) : 0;
  const balanceText = balance.toLocaleString();
  const requiredText = requiredCredits?.toLocaleString() ?? "";
  const shortageText = shortage.toLocaleString();
  const isEducationSpace =
    credits?.credit_scope === "education_space" ||
    credits?.organization_type === "school" ||
    credits?.organization_type === "university";

  const handleGoToPricing = () => {
    onOpenChange(false);
    navigate("/app/pricing");
  };

  return (
    <>
      <Dialog open={open && !topupOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md border-white/10 bg-[#111827] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Coins className="h-5 w-5 text-sky-400" />
              {isEducationSpace
                ? t("insufficientCredits.classSpaceLow")
                : t("insufficientCredits.notEnough")}
            </DialogTitle>
            <DialogDescription className="text-zinc-300">
              {isEducationSpace
                ? t("insufficientCredits.classSpaceDescription", { balance: balanceText })
                : requiredCredits
                  ? t("insufficientCredits.requiredDescription", { required: requiredText, balance: balanceText })
                  : t("insufficientCredits.balanceDescription", { balance: balanceText })}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-3">
            <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              {isEducationSpace
                ? t("insufficientCredits.classSpaceLocked")
                : shortage > 0
                  ? t("insufficientCredits.shortBy", { shortage: shortageText })
                  : t("insufficientCredits.topUpOrChoosePlan")}
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
                <Button
                  className="h-11 w-full bg-sky-500 font-semibold text-white hover:bg-sky-400"
                  onClick={() => setTopupOpen(true)}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  {t("insufficientCredits.quickTopUpPromptPay")}
                </Button>

                <Button
                  variant="outline"
                  className="h-11 w-full border-white/15 bg-white/5 text-white hover:bg-white/10"
                  onClick={handleGoToPricing}
                >
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  {t("insufficientCredits.goToPlansPricing")}
                </Button>
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

export default InsufficientCreditsDialog;

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
import { ArrowUpCircle, Coins, Zap } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { useLanguage } from "@/contexts/LanguageContext";
import BuyCreditsDialog from "@/components/settings/BuyCreditsDialog";

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
  const { credits, refetch } = useCredits();
  const { language } = useLanguage();
  const [topupOpen, setTopupOpen] = useState(false);

  const balance = credits?.balance ?? 0;
  const shortage = requiredCredits ? Math.max(0, requiredCredits - balance) : 0;

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
              {language === "th" ? "เครดิตไม่เพียงพอ" : "Not enough credits"}
            </DialogTitle>
            <DialogDescription className="text-zinc-300">
              {requiredCredits
                ? language === "th"
                  ? `ต้องใช้ ${requiredCredits.toLocaleString()} credits แต่ตอนนี้มี ${balance.toLocaleString()} credits`
                  : `This action needs ${requiredCredits.toLocaleString()} credits. Current balance: ${balance.toLocaleString()} credits.`
                : language === "th"
                  ? `ยอดคงเหลือปัจจุบัน ${balance.toLocaleString()} credits`
                  : `Current balance: ${balance.toLocaleString()} credits.`}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-3">
            <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              {shortage > 0
                ? language === "th"
                  ? `ขาดอีก ${shortage.toLocaleString()} credits`
                  : `Short by ${shortage.toLocaleString()} credits.`
                : language === "th"
                  ? "เติมเครดิตหรือเลือกแพ็กเกจใหม่เพื่อใช้งานต่อ"
                  : "Top up credits or choose a plan to continue."}
            </div>

            <Button
              className="h-11 w-full bg-sky-500 font-semibold text-white hover:bg-sky-400"
              onClick={() => setTopupOpen(true)}
            >
              <Zap className="mr-2 h-4 w-4" />
              {language === "th"
                ? "Top-up ด่วนด้วย PromptPay QR"
                : "Quick top-up with PromptPay QR"}
            </Button>

            <Button
              variant="outline"
              className="h-11 w-full border-white/15 bg-white/5 text-white hover:bg-white/10"
              onClick={handleGoToPricing}
            >
              <ArrowUpCircle className="mr-2 h-4 w-4" />
              {language === "th" ? "ไปหน้า Plan & Pricing" : "Go to plans and pricing"}
            </Button>
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

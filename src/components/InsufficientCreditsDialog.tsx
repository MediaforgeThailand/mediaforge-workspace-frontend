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
import { getLocalizedText, useLanguage } from "@/contexts/LanguageContext";
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
  const { language } = useLanguage();
  const [topupOpen, setTopupOpen] = useState(false);

  const balance = credits?.balance ?? 0;
  const shortage = requiredCredits ? Math.max(0, requiredCredits - balance) : 0;
  const isEducationSpace =
    credits?.credit_scope === "education_space" ||
    credits?.organization_type === "school" ||
    credits?.organization_type === "university";

  const handleGoToPricing = () => {
    onOpenChange(false);
    navigate("/app/pricing");
  };
  const txt = (values: Parameters<typeof getLocalizedText>[1]) =>
    getLocalizedText(language, values);

  return (
    <>
      <Dialog open={open && !topupOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md border-white/10 bg-[#111827] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Coins className="h-5 w-5 text-sky-400" />
              {isEducationSpace
                ? txt({ en: "Class space credits are low", th: "เครดิตใน class space ไม่พอ", es: "Los créditos de espacio de clase son bajos", ja: "クラススペースのクレジットが不足しています" })
                : txt({ en: "Not enough credits", th: "เครดิตไม่เพียงพอ", es: "No hay suficientes créditos", ja: "クレジットが不足しています" })}
            </DialogTitle>
            <DialogDescription className="text-zinc-300">
              {isEducationSpace
                ? txt({
                    en: `This class space has ${balance.toLocaleString()} credits. Ask your teacher to add credits to this space before continuing.`,
                    th: `space นี้มี ${balance.toLocaleString()} credits ให้ขออาจารย์เติมเครดิตใน class space นี้ก่อนใช้งานต่อ`,
                    es: `Este espacio de clase tiene ${balance.toLocaleString()} créditos. Pide a tu profesor que agregue créditos a este espacio antes de continuar.`,
                    ja: `このクラススペースには ${balance.toLocaleString()} クレジットがあります。続ける前に先生にこのスペースへクレジットを追加してもらってください。`,
                  })
                : requiredCredits
                  ? txt({
                      en: `This action needs ${requiredCredits.toLocaleString()} credits. Current balance: ${balance.toLocaleString()} credits.`,
                      th: `ต้องใช้ ${requiredCredits.toLocaleString()} credits แต่ตอนนี้มี ${balance.toLocaleString()} credits`,
                      es: `Esta acción necesita ${requiredCredits.toLocaleString()} créditos. Saldo actual: ${balance.toLocaleString()} créditos.`,
                      ja: `この操作には ${requiredCredits.toLocaleString()} クレジットが必要です。現在の残高: ${balance.toLocaleString()} クレジット。`,
                    })
                  : txt({
                      en: `Current balance: ${balance.toLocaleString()} credits.`,
                      th: `ยอดคงเหลือปัจจุบัน ${balance.toLocaleString()} credits`,
                      es: `Saldo actual: ${balance.toLocaleString()} créditos.`,
                      ja: `現在の残高: ${balance.toLocaleString()} クレジット。`,
                    })}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-3">
            <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              {isEducationSpace
                ? txt({
                    en: "Student credits are locked to each class space, so personal top-ups cannot be used here.",
                    th: "เครดิตของนักเรียนถูกล็อกตาม class space จึงไม่สามารถเติมเงินส่วนตัวเพื่อใช้แทนได้",
                    es: "Los créditos estudiantiles están bloqueados en cada espacio de clase, por lo que aquí no se pueden utilizar recargas personales.",
                    ja: "学生のクレジットは各クラススペースに紐づいているため、ここでは個人のチャージを代わりに使えません。",
                  })
                : shortage > 0
                  ? txt({
                      en: `Short by ${shortage.toLocaleString()} credits.`,
                      th: `ขาดอีก ${shortage.toLocaleString()} credits`,
                      es: `Faltan ${shortage.toLocaleString()} créditos.`,
                      ja: `${shortage.toLocaleString()} クレジット不足しています。`,
                    })
                  : txt({
                      en: "Top up credits or choose a plan to continue.",
                      th: "เติมเครดิตหรือเลือกแพ็กเกจใหม่เพื่อใช้งานต่อ",
                      es: "Recarga créditos o elige un plan para continuar.",
                      ja: "クレジットをチャージするか、プランを選んで続行してください。",
                    })}
            </div>

            {isEducationSpace ? (
              <Button
                className="h-11 w-full bg-emerald-500 font-semibold text-white hover:bg-emerald-400"
                onClick={() => onOpenChange(false)}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                {txt({ en: "Back to class space", th: "กลับไปที่ class space", es: "Volver al espacio de clase", ja: "クラススペースに戻る" })}
              </Button>
            ) : (
              <>
                <Button
                  className="h-11 w-full bg-sky-500 font-semibold text-white hover:bg-sky-400"
                  onClick={() => setTopupOpen(true)}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  {txt({ en: "Quick top-up with PromptPay QR", th: "Top-up ด่วนด้วย PromptPay QR", es: "Recarga rápida con PromptPay QR", ja: "PromptPay QR でクイックチャージ" })}
                </Button>

                <Button
                  variant="outline"
                  className="h-11 w-full border-white/15 bg-white/5 text-white hover:bg-white/10"
                  onClick={handleGoToPricing}
                >
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  {txt({ en: "Go to plans and pricing", th: "ไปหน้า Plan & Pricing", es: "Ir a planes y precios", ja: "プランと料金へ" })}
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

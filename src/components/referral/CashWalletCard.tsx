import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAffiliateEarnings } from "@/hooks/useAffiliateEarnings";
import WithdrawDialog from "./WithdrawDialog";

interface Props {
  /** Legacy cash wallet balance (referral cash). Shown as a small line. */
  balance: number;
}

const CashWalletCard = ({ balance }: Props) => {
  const { data: earnings, isLoading } = useAffiliateEarnings();
  const [open, setOpen] = useState(false);

  const available = Math.floor(earnings?.available_to_withdraw_thb ?? 0);
  const canWithdraw = available >= 500;

  if (!earnings?.isPartner) {
    // Non-partner: keep simple cash wallet display (referral cashback)
    return (
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
          Cash Wallet
        </p>
        <p
          className="text-[32px] font-bold leading-none tabular-nums"
          style={{ letterSpacing: "-0.02em" }}
        >
          ฿ {balance.toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground">
          ใช้เป็นส่วนลดเมื่อเติม Credits เท่านั้น — ถอนเงินไม่ได้
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
          รายได้ Partner Commission
        </p>
        {isLoading ? (
          <Skeleton className="h-10 w-40" />
        ) : (
          <p
            className="text-[32px] font-bold leading-none tabular-nums"
            style={{ letterSpacing: "-0.02em" }}
          >
            ฿ {available.toLocaleString()}
          </p>
        )}
        <p className="text-xs text-muted-foreground">พร้อมถอนเข้าบัญชีธนาคาร</p>
      </div>

      <Separator />

      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">รอปล่อย (30 วัน)</dt>
          <dd className="tabular-nums">
            ฿ {Math.floor(earnings?.holding_thb ?? 0).toLocaleString()}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">อยู่ระหว่างโอน</dt>
          <dd className="tabular-nums">
            ฿ {Math.floor(earnings?.pending_payout_thb ?? 0).toLocaleString()}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">โอนให้แล้ว (สะสม)</dt>
          <dd className="tabular-nums">
            ฿ {Math.floor(earnings?.paid_thb ?? 0).toLocaleString()}
          </dd>
        </div>
        <div className="flex justify-between font-medium pt-2 border-t border-border">
          <dt>รายได้สะสมทั้งหมด</dt>
          <dd className="tabular-nums">
            ฿ {Math.floor(earnings?.lifetime_thb ?? 0).toLocaleString()}
          </dd>
        </div>
      </dl>

      <Button
        className="w-full"
        disabled={!canWithdraw}
        onClick={() => setOpen(true)}
      >
        {canWithdraw
          ? `ถอนเงิน ฿ ${available.toLocaleString()}`
          : "ถอนเงิน (ขั้นต่ำ ฿500)"}
      </Button>

      {balance > 0 && (
        <p className="text-[11px] text-muted-foreground">
          + Cash Wallet (referral cashback): ฿ {balance.toFixed(2)} — ใช้เป็นส่วนลดเติม Credits
        </p>
      )}

      <WithdrawDialog open={open} onOpenChange={setOpen} maxAmount={available} />
    </div>
  );
};

export default CashWalletCard;

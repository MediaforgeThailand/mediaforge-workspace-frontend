import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const BANKS = [
  { code: "KBANK", name: "กสิกรไทย" },
  { code: "SCB", name: "ไทยพาณิชย์" },
  { code: "BBL", name: "กรุงเทพ" },
  { code: "KTB", name: "กรุงไทย" },
  { code: "BAY", name: "กรุงศรี" },
  { code: "TTB", name: "ทหารไทยธนชาต" },
  { code: "GSB", name: "ออมสิน" },
  { code: "KKP", name: "เกียรตินาคิน" },
  { code: "CIMB", name: "ซีไอเอ็มบี" },
  { code: "UOB", name: "ยูโอบี" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  maxAmount: number;
}

const WithdrawDialog = ({ open, onOpenChange, maxAmount }: Props) => {
  const qc = useQueryClient();
  const [amount, setAmount] = useState<string>(String(Math.floor(maxAmount)));
  const [bank, setBank] = useState<string>("KBANK");
  const [accountNo, setAccountNo] = useState("");
  const [accountName, setAccountName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const amt = parseInt(amount, 10);
    if (!amt || amt < 500) {
      toast.error("จำนวนเงินขั้นต่ำ 500 บาท");
      return;
    }
    if (amt > Math.floor(maxAmount)) {
      toast.error("จำนวนเงินเกินยอดที่ถอนได้");
      return;
    }
    if (!accountNo.trim() || !accountName.trim()) {
      toast.error("กรอกข้อมูลบัญชีให้ครบ");
      return;
    }
    setSubmitting(true);
    const bankName = BANKS.find((b) => b.code === bank)?.name ?? bank;
    const { error } = await supabase.rpc("request_payout", {
      p_amount_thb: amt,
      p_bank_snapshot: {
        bank_code: bank,
        bank_name: bankName,
        bank_account_number: accountNo.trim(),
        bank_account_name: accountName.trim(),
      },
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message || "ส่งคำขอถอนเงินไม่สำเร็จ");
      return;
    }
    toast.success("ส่งคำขอถอนเงินแล้ว รอ Admin อนุมัติ");
    qc.invalidateQueries({ queryKey: ["affiliate-earnings"] });
    qc.invalidateQueries({ queryKey: ["my-payouts"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ถอนเงิน Commission</DialogTitle>
          <DialogDescription>
            ยอดถอนได้สูงสุด ฿{Math.floor(maxAmount).toLocaleString()} (ขั้นต่ำ ฿500)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="amount">จำนวนเงิน (บาท)</Label>
            <Input
              id="amount"
              type="number"
              min={500}
              max={Math.floor(maxAmount)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>ธนาคาร</Label>
            <Select value={bank} onValueChange={setBank}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BANKS.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accNo">เลขที่บัญชี</Label>
            <Input
              id="accNo"
              value={accountNo}
              onChange={(e) => setAccountNo(e.target.value)}
              placeholder="000-0-00000-0"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accName">ชื่อบัญชี</Label>
            <Input
              id="accName"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="ชื่อ - นามสกุล"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "กำลังส่ง..." : "ยืนยันคำขอถอน"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WithdrawDialog;

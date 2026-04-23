import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, HelpCircle, Link as LinkIcon, Clock, Wallet, Shield } from "lucide-react";

interface Props {
  commissionRate?: number; // 0.30 = 30%
  tier?: string;
}

const Step = ({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="flex gap-3">
    <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
      <Icon className="w-4 h-4 text-primary" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold">{title}</p>
      <div className="text-xs text-muted-foreground mt-1 leading-relaxed space-y-1">
        {children}
      </div>
    </div>
  </div>
);

const HowItWorksCard = ({ commissionRate, tier }: Props) => {
  const [open, setOpen] = useState(false);
  const ratePct = commissionRate ? (commissionRate * 100).toFixed(0) : "30";

  return (
    <Card className="p-6">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between gap-2 text-left">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <h2
                  className="text-base font-semibold"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  How it works
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  โปรแกรมพาร์ทเนอร์ทำงานอย่างไร — คลิกเพื่ออ่าน
                </p>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-5 space-y-5">
          <Step icon={LinkIcon} title="1. สร้าง link และแชร์">
            <p>
              สร้าง campaign link ในหัวข้อ <b>My links</b> — ระบบจะออกโค้ดแบบ{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">MF-P-XXXXXX-LABEL</code>
              พร้อม share URL ที่ track ได้ทันที
            </p>
            <p>
              ทุกคลิก + signup + การซื้อแพ็กเกจจะถูกผูกกับ link ที่คุณแชร์ (attribution window 30 วัน)
            </p>
          </Step>

          <Step icon={Wallet} title={`2. รับ commission ${ratePct}% จากยอดซื้อ`}>
            <p>
              เมื่อ referral ของคุณซื้อ subscription หรือ top-up credits ระบบจะคำนวณ commission{" "}
              <b>{ratePct}%</b> จาก <b>ยอดหลังหัก VAT และค่าธรรมเนียม</b> (net amount)
            </p>
            <p>
              Commission ถูกบันทึกทันทีที่ Stripe ยืนยันการจ่ายเงิน (webhook invoice.payment_succeeded)
            </p>
          </Step>

          <Step icon={Clock} title="3. Holding period 30 วัน">
            <p>
              Commission ใหม่จะอยู่ในสถานะ <b>holding</b> เป็นเวลา 30 วัน เพื่อรองรับ refund / chargeback
            </p>
            <p>
              หลังพ้น hold period จะเปลี่ยนเป็น <b>available</b> อัตโนมัติ พร้อมถอนได้
            </p>
          </Step>

          <Step icon={Wallet} title="4. ถอนเงิน">
            <p>
              กด <b>Request payout</b> เมื่อ available ≥ 500 บาท — เงินจะโอนเข้าบัญชีธนาคารที่ลงทะเบียนไว้
            </p>
            <p>
              รอบการโอน: ทีม finance ดำเนินการภายใน 3-5 วันทำการ
            </p>
          </Step>

          <Step icon={Shield} title="5. Fraud protection & Clawback">
            <p>
              ระบบมีการตรวจจับ self-referral, IP/device ซ้ำ, และ pattern ที่ผิดปกติ — commission ที่ถูก flag จะไม่ถูกนับ
            </p>
            <p>
              หากพบการ refund หลัง payout แล้ว จะถูก clawback จาก available balance ในรอบถัดไป
            </p>
          </Step>

          <div className="rounded-md border bg-muted/20 p-3 text-xs">
            <p className="font-semibold">สรุปสั้น ๆ สำหรับ tier ของคุณ</p>
            <ul className="mt-1.5 space-y-0.5 text-muted-foreground list-disc list-inside">
              <li>
                Tier: <b>{tier ?? "standard"}</b> · Commission rate: <b>{ratePct}%</b>
              </li>
              <li>Holding: 30 วัน · Min payout: 500 บาท</li>
              <li>Payout: 3-5 วันทำการ</li>
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default HowItWorksCard;

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { step1Schema, type Step1, type WizardData } from "../schemas";
import { useEffect } from "react";

interface Props {
  defaults: WizardData;
  onValidChange: (valid: boolean, data: Partial<Step1>) => void;
}

const BULLETS = [
  "30% commission on every subscription paid by your referrals",
  "Recurring revenue — you earn every billing cycle, for life",
  "Withdraw to your bank account, min 500 THB",
  "Dedicated Partner Dashboard with real-time analytics",
];

const Step1Intro = ({ defaults, onValidChange }: Props) => {
  const form = useForm<Step1>({
    resolver: zodResolver(step1Schema),
    mode: "onChange",
    defaultValues: { accept_terms: (defaults.accept_terms as true) ?? undefined },
  });

  const accepted = form.watch("accept_terms");

  useEffect(() => {
    onValidChange(accepted === true, { accept_terms: accepted as true });
  }, [accepted, onValidChange]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em" }}>
          Become a MediaForge Partner
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          เข้าร่วมโปรแกรม Partner รับค่าตอบแทนจากผู้ใช้ที่คุณแนะนำตลอดอายุการเป็นสมาชิก
        </p>
      </div>

      <Card className="p-6 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Why become a Partner
        </h3>
        <ul className="space-y-2.5">
          {BULLETS.map((b) => (
            <li key={b} className="flex gap-3 text-sm leading-relaxed">
              <span className="text-primary font-bold mt-0.5">—</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6 space-y-2 border-primary/30 bg-primary/5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">
          Payout Schedule
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          เงินจะถูก hold 30 วันหลังการชำระ เพื่อคุ้มครองกรณีคืนเงิน หลังจากนั้นจะเป็น Available
          ให้กดถอนได้
        </p>
      </Card>

      <div className="flex items-start gap-3 pt-2">
        <Checkbox
          id="accept_terms"
          checked={accepted === true}
          onCheckedChange={(v) =>
            form.setValue("accept_terms", v === true ? (true as const) : (undefined as any), {
              shouldValidate: true,
            })
          }
        />
        <Label htmlFor="accept_terms" className="text-sm leading-relaxed cursor-pointer">
          ฉันยอมรับ{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Terms & Conditions
          </a>{" "}
          และนโยบายการจ่ายค่าคอมมิชชันของ MediaForge Partner Program
        </Label>
      </div>
    </div>
  );
};

export default Step1Intro;

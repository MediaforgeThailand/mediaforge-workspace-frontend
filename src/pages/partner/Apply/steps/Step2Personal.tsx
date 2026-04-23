import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { step2Schema, type Step2, type WizardData } from "../schemas";
import { toast } from "sonner";
import { Check } from "lucide-react";

interface Props {
  defaults: WizardData;
  onValidChange: (valid: boolean, data: Partial<Step2>) => void;
}

const Step2Personal = ({ defaults, onValidChange }: Props) => {
  const form = useForm<Step2>({
    resolver: zodResolver(step2Schema),
    mode: "onChange",
    defaultValues: {
      legal_first_name: defaults.legal_first_name ?? "",
      legal_last_name: defaults.legal_last_name ?? "",
      national_id: defaults.national_id ?? "",
      phone_e164: defaults.phone_e164 ?? "+66",
      phone_verified: (defaults.phone_verified as true) ?? undefined,
      address_line1: defaults.address_line1 ?? "",
      address_line2: defaults.address_line2 ?? "",
      city: defaults.city ?? "",
      postal_code: defaults.postal_code ?? "",
      country_code: defaults.country_code ?? "TH",
    },
  });

  const values = form.watch();
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const verified = values.phone_verified === true;

  useEffect(() => {
    const valid = form.formState.isValid;
    onValidChange(valid, values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values), form.formState.isValid]);

  const handleSendOtp = () => {
    const phoneOk = /^\+66\d{9}$/.test(values.phone_e164 ?? "");
    if (!phoneOk) {
      toast.error("กรุณากรอกเบอร์โทรในรูปแบบ +66XXXXXXXXX ก่อน");
      return;
    }
    setOtpOpen(true);
    toast.success("ส่งรหัส OTP แล้ว (โหมดทดสอบ: ใส่เลข 6 หลักใดก็ได้)");
  };

  const handleVerify = () => {
    if (!/^\d{6}$/.test(otp)) {
      toast.error("รหัส OTP ต้องเป็นเลข 6 หลัก");
      return;
    }
    form.setValue("phone_verified", true as const, { shouldValidate: true });
    setOtpOpen(false);
    toast.success("ยืนยันเบอร์โทรเรียบร้อย");
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold" style={{ letterSpacing: "-0.02em" }}>
          Personal Information
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          ข้อมูลตามบัตรประชาชนเพื่อยืนยันตัวตน (KYC)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="legal_first_name">ชื่อจริง (ตามบัตรประชาชน)</Label>
          <Input id="legal_first_name" {...form.register("legal_first_name")} />
          {form.formState.errors.legal_first_name && (
            <p className="text-xs text-destructive">{form.formState.errors.legal_first_name.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="legal_last_name">นามสกุล</Label>
          <Input id="legal_last_name" {...form.register("legal_last_name")} />
          {form.formState.errors.legal_last_name && (
            <p className="text-xs text-destructive">{form.formState.errors.legal_last_name.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="national_id">เลขบัตรประชาชน (13 หลัก)</Label>
        <Input
          id="national_id"
          inputMode="numeric"
          maxLength={13}
          {...form.register("national_id")}
        />
        {form.formState.errors.national_id && (
          <p className="text-xs text-destructive">{form.formState.errors.national_id.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone_e164">เบอร์โทรศัพท์</Label>
        <div className="flex gap-2">
          <Input
            id="phone_e164"
            disabled={verified}
            placeholder="+66812345678"
            {...form.register("phone_e164")}
          />
          {verified ? (
            <Badge className="bg-primary/15 text-primary border-primary/30 self-center px-3 py-1.5">
              <Check className="w-3.5 h-3.5 mr-1" /> Verified
            </Badge>
          ) : otpOpen ? (
            <>
              <Input
                placeholder="OTP 6 หลัก"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="w-32"
              />
              <Button type="button" onClick={handleVerify} className="shrink-0">
                Verify
              </Button>
            </>
          ) : (
            <Button type="button" variant="secondary" onClick={handleSendOtp} className="shrink-0">
              Send OTP
            </Button>
          )}
        </div>
        {form.formState.errors.phone_e164 && (
          <p className="text-xs text-destructive">{form.formState.errors.phone_e164.message}</p>
        )}
        {!verified && form.formState.errors.phone_verified && (
          <p className="text-xs text-destructive">{form.formState.errors.phone_verified.message as string}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address_line1">ที่อยู่ บรรทัด 1</Label>
        <Input id="address_line1" {...form.register("address_line1")} />
        {form.formState.errors.address_line1 && (
          <p className="text-xs text-destructive">{form.formState.errors.address_line1.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address_line2">ที่อยู่ บรรทัด 2 (ไม่บังคับ)</Label>
        <Input id="address_line2" {...form.register("address_line2")} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="city">จังหวัด / เมือง</Label>
          <Input id="city" {...form.register("city")} />
          {form.formState.errors.city && (
            <p className="text-xs text-destructive">{form.formState.errors.city.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="postal_code">รหัสไปรษณีย์</Label>
          <Input id="postal_code" inputMode="numeric" maxLength={5} {...form.register("postal_code")} />
          {form.formState.errors.postal_code && (
            <p className="text-xs text-destructive">{form.formState.errors.postal_code.message}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Step2Personal;

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BANKS, step3Schema, type Step3, type WizardData } from "../schemas";

interface Props {
  defaults: WizardData;
  onValidChange: (valid: boolean, data: Partial<Step3>) => void;
}

const Step3Banking = ({ defaults, onValidChange }: Props) => {
  const form = useForm<Step3>({
    resolver: zodResolver(step3Schema),
    mode: "onChange",
    defaultValues: {
      bank_name: defaults.bank_name as Step3["bank_name"],
      bank_account_no: defaults.bank_account_no ?? "",
      bank_account_name: defaults.bank_account_name ?? "",
    },
  });

  const values = form.watch();

  useEffect(() => {
    onValidChange(form.formState.isValid, values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values), form.formState.isValid]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold" style={{ letterSpacing: "-0.02em" }}>
          Banking Information
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          บัญชีสำหรับรับค่าคอมมิชชันที่ถอนได้ขั้นต่ำ 500 บาท
        </p>
      </div>

      <Alert className="border-destructive/40 bg-destructive/5">
        <AlertDescription className="text-sm leading-relaxed">
          <strong className="text-destructive">สำคัญ:</strong>{" "}
          ชื่อบัญชีธนาคารต้องตรงกับชื่อในบัตรประชาชน มิฉะนั้นคำขอจะถูกปฏิเสธ
        </AlertDescription>
      </Alert>

      <div className="space-y-1.5">
        <Label>ธนาคาร</Label>
        <Select
          value={values.bank_name ?? ""}
          onValueChange={(v) =>
            form.setValue("bank_name", v as Step3["bank_name"], { shouldValidate: true })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="เลือกธนาคาร" />
          </SelectTrigger>
          <SelectContent>
            {BANKS.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.bank_name && (
          <p className="text-xs text-destructive">{form.formState.errors.bank_name.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bank_account_no">เลขบัญชี (10-12 หลัก)</Label>
        <Input
          id="bank_account_no"
          inputMode="numeric"
          maxLength={12}
          {...form.register("bank_account_no")}
        />
        {form.formState.errors.bank_account_no && (
          <p className="text-xs text-destructive">{form.formState.errors.bank_account_no.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bank_account_name">ชื่อบัญชี (ตรงกับบัตรประชาชน)</Label>
        <Input id="bank_account_name" {...form.register("bank_account_name")} />
        {form.formState.errors.bank_account_name && (
          <p className="text-xs text-destructive">
            {form.formState.errors.bank_account_name.message}
          </p>
        )}
      </div>
    </div>
  );
};

export default Step3Banking;

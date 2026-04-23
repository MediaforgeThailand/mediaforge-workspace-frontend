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
import { Card } from "@/components/ui/card";
import { SOCIAL_PLATFORMS, step5Schema, type Step5, type WizardData } from "../schemas";

interface Props {
  defaults: WizardData;
  onValidChange: (valid: boolean, data: Partial<Step5>) => void;
}

const Step5Social = ({ defaults, onValidChange }: Props) => {
  const form = useForm<Step5>({
    resolver: zodResolver(step5Schema),
    mode: "onChange",
    defaultValues: {
      social_platform: defaults.social_platform as Step5["social_platform"],
      social_profile_url: defaults.social_profile_url ?? "",
      follower_count: defaults.follower_count ?? 0,
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
          Social Channel
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          ข้อมูลช่องทางที่คุณจะใช้โปรโมต MediaForge
        </p>
      </div>

      <Card className="p-4 border-primary/30 bg-primary/5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          เราจะตรวจสอบว่าช่องของคุณมีอยู่จริงและมี engagement เพียงพอ หาก follower
          ไม่ถึงเกณฑ์ เราจะยังรับพิจารณาแต่จะเน้นดู engagement quality
        </p>
      </Card>

      <div className="space-y-1.5">
        <Label>แพลตฟอร์ม</Label>
        <Select
          value={values.social_platform ?? ""}
          onValueChange={(v) =>
            form.setValue("social_platform", v as Step5["social_platform"], {
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="เลือกแพลตฟอร์ม" />
          </SelectTrigger>
          <SelectContent>
            {SOCIAL_PLATFORMS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.social_platform && (
          <p className="text-xs text-destructive">{form.formState.errors.social_platform.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="social_profile_url">URL ของช่อง / โปรไฟล์</Label>
        <Input
          id="social_profile_url"
          type="url"
          placeholder="https://www.tiktok.com/@yourname"
          {...form.register("social_profile_url")}
        />
        {form.formState.errors.social_profile_url && (
          <p className="text-xs text-destructive">
            {form.formState.errors.social_profile_url.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="follower_count">จำนวน Follower (โดยประมาณ)</Label>
        <Input
          id="follower_count"
          type="number"
          min={0}
          {...form.register("follower_count")}
        />
        {form.formState.errors.follower_count && (
          <p className="text-xs text-destructive">{form.formState.errors.follower_count.message}</p>
        )}
      </div>
    </div>
  );
};

export default Step5Social;

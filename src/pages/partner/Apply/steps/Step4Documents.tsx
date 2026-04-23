import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { uploadKycFile, type KycSlot } from "@/lib/supabase/uploadKyc";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { WizardData, Step4 } from "../schemas";
import { step4Schema } from "../schemas";

interface Props {
  defaults: WizardData;
  onValidChange: (valid: boolean, data: Partial<Step4>) => void;
}

interface ZoneSpec {
  slot: KycSlot;
  field: keyof Step4;
  title: string;
  required: boolean;
  recommended?: boolean;
  hint?: string;
}

const ZONES: ZoneSpec[] = [
  { slot: "id_card_front", field: "id_card_front_url", title: "ID Card — Front", required: true, hint: "JPG/PNG · max 5MB · min 1000×700" },
  { slot: "id_card_back", field: "id_card_back_url", title: "ID Card — Back (optional)", required: false, hint: "JPG/PNG · max 5MB" },
  { slot: "bank_book", field: "bank_book_url", title: "Bank Book / Statement", required: true, hint: "JPG/PNG/PDF · max 5MB" },
  { slot: "selfie_with_id", field: "selfie_with_id_url", title: "Selfie holding ID", required: false, recommended: true, hint: "JPG/PNG · max 5MB" },
];

const MAX_BYTES = 5 * 1024 * 1024;
const MIN_W = 1000;
const MIN_H = 700;

async function validateImageDims(file: File): Promise<boolean> {
  if (!file.type.startsWith("image/")) return true; // skip for PDFs etc.
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width >= MIN_W && img.height >= MIN_H);
    img.onerror = () => resolve(false);
    img.src = URL.createObjectURL(file);
  });
}

const UploadZone = ({
  spec,
  value,
  onUploaded,
  onRemove,
}: {
  spec: ZoneSpec;
  value: string | undefined;
  onUploaded: (url: string) => void;
  onRemove: () => void;
}) => {
  const { user } = useAuth();
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(value || null);

  useEffect(() => {
    setPreview(value || null);
  }, [value]);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file || !user) return;
      if (file.size > MAX_BYTES) {
        toast.error("ไฟล์ใหญ่เกิน 5MB");
        return;
      }
      if (spec.slot === "id_card_front") {
        const ok = await validateImageDims(file);
        if (!ok) {
          toast.error(`รูปต้องมีขนาดอย่างน้อย ${MIN_W}×${MIN_H}`);
          return;
        }
      }
      try {
        setProgress(5);
        const { publicUrl } = await uploadKycFile(user.id, spec.slot, file, setProgress);
        setPreview(publicUrl);
        onUploaded(publicUrl);
        toast.success("อัปโหลดสำเร็จ");
      } catch (e: any) {
        toast.error(e?.message || "อัปโหลดล้มเหลว");
      } finally {
        setProgress(null);
      }
    },
    [user, spec.slot, onUploaded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png"], "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: progress !== null,
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            {spec.title}
            {spec.required && <span className="text-destructive ml-1">*</span>}
          </p>
          {spec.hint && <p className="text-[11px] text-muted-foreground mt-0.5">{spec.hint}</p>}
        </div>
        {spec.recommended && (
          <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">
            Recommended — reduces review time
          </Badge>
        )}
      </div>

      {preview ? (
        <div className="space-y-2">
          <div className="w-[200px] h-[120px] rounded-md overflow-hidden bg-muted border border-border">
            {/* If it's a PDF the img will fail; we fallback to filename text */}
            <img
              src={preview}
              alt={spec.title}
              className="w-full h-full object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" {...getRootProps()}>
              <input {...getInputProps()} />
              Replace
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors",
            isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/60",
            progress !== null && "opacity-60 pointer-events-none"
          )}
        >
          <input {...getInputProps()} />
          <p className="text-sm text-muted-foreground">
            {isDragActive ? "วางไฟล์ที่นี่..." : "ลากไฟล์มาวาง หรือคลิกเพื่อเลือก"}
          </p>
        </div>
      )}

      {progress !== null && <Progress value={progress} className="h-1.5" />}
    </Card>
  );
};

const Step4Documents = ({ defaults, onValidChange }: Props) => {
  const [data, setData] = useState<Partial<Step4>>({
    id_card_front_url: defaults.id_card_front_url ?? "",
    id_card_back_url: defaults.id_card_back_url ?? "",
    bank_book_url: defaults.bank_book_url ?? "",
    selfie_with_id_url: defaults.selfie_with_id_url ?? "",
  });

  useEffect(() => {
    const result = step4Schema.safeParse(data);
    onValidChange(result.success, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data)]);

  const updateField = (field: keyof Step4, value: string) => {
    setData((d) => ({ ...d, [field]: value }));
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold" style={{ letterSpacing: "-0.02em" }}>
          Document Upload
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          เอกสารทั้งหมดถูกเก็บแบบเข้ารหัสและเข้าถึงได้เฉพาะทีมตรวจสอบเท่านั้น
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ZONES.map((spec) => (
          <UploadZone
            key={spec.slot}
            spec={spec}
            value={data[spec.field] as string | undefined}
            onUploaded={(url) => updateField(spec.field, url)}
            onRemove={() => updateField(spec.field, "")}
          />
        ))}
      </div>
    </div>
  );
};

export default Step4Documents;

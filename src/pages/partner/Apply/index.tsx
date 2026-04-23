import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import Step1Intro from "./steps/Step1Intro";
import Step2Personal from "./steps/Step2Personal";
import Step3Banking from "./steps/Step3Banking";
import Step4Documents from "./steps/Step4Documents";
import Step5Social from "./steps/Step5Social";

import {
  STEP_LABELS,
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  type WizardData,
} from "./schemas";

const TOTAL_STEPS = 5;

// Map wizard data → DB columns
function toDbRow(userId: string, d: WizardData, status: "draft" | "submitted") {
  return {
    user_id: userId,
    legal_first_name: d.legal_first_name ?? "",
    legal_last_name: d.legal_last_name ?? "",
    national_id: d.national_id ?? "",
    phone_e164: d.phone_e164 ?? "",
    address_line1: d.address_line1 ?? null,
    address_line2: d.address_line2 ?? null,
    city: d.city ?? null,
    postal_code: d.postal_code ?? null,
    country_code: d.country_code ?? "TH",
    bank_name: d.bank_name ?? "",
    bank_account_no: d.bank_account_no ?? "",
    bank_account_name: d.bank_account_name ?? "",
    bank_book_url: d.bank_book_url ?? "",
    id_card_front_url: d.id_card_front_url ?? "",
    id_card_back_url: d.id_card_back_url ?? null,
    selfie_with_id_url: d.selfie_with_id_url ?? null,
    social_platform: d.social_platform ?? null,
    social_profile_url: d.social_profile_url ?? null,
    follower_count: d.follower_count ?? null,
    status,
    ...(status === "submitted" ? { submitted_at: new Date().toISOString() } : {}),
  };
}

// Map DB row → wizard data
function fromDbRow(row: any): WizardData {
  return {
    legal_first_name: row.legal_first_name ?? "",
    legal_last_name: row.legal_last_name ?? "",
    national_id: row.national_id ?? "",
    phone_e164: row.phone_e164 ?? "",
    phone_verified: row.phone_e164 ? (true as const) : undefined,
    address_line1: row.address_line1 ?? "",
    address_line2: row.address_line2 ?? "",
    city: row.city ?? "",
    postal_code: row.postal_code ?? "",
    country_code: row.country_code ?? "TH",
    bank_name: row.bank_name ?? undefined,
    bank_account_no: row.bank_account_no ?? "",
    bank_account_name: row.bank_account_name ?? "",
    id_card_front_url: row.id_card_front_url ?? "",
    id_card_back_url: row.id_card_back_url ?? "",
    bank_book_url: row.bank_book_url ?? "",
    selfie_with_id_url: row.selfie_with_id_url ?? "",
    social_platform: row.social_platform ?? undefined,
    social_profile_url: row.social_profile_url ?? "",
    follower_count: row.follower_count ?? 0,
    accept_terms: true as const, // implicit if a draft exists
  };
}

const PartnerApply = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0..4
  const [data, setData] = useState<WizardData>({});
  const [stepValid, setStepValid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load existing application or draft
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: row, error } = await supabase
        .from("partner_applications")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        toast.error("โหลดข้อมูลไม่สำเร็จ");
      }
      if (row) {
        if (["submitted", "in_review", "approved"].includes(row.status)) {
          navigate("/app/partner/status", { replace: true });
          return;
        }
        setApplicationId(row.id);
        setData(fromDbRow(row));
      }
      setLoading(false);
    })();
  }, [user, navigate]);

  const handleStepValid = useCallback((valid: boolean, partial: Partial<WizardData>) => {
    setStepValid(valid);
    setData((d) => ({ ...d, ...partial }));
  }, []);

  const persistDraft = async (silent = false): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const row = toDbRow(user.id, data, "draft");
      let result;
      if (applicationId) {
        result = await supabase
          .from("partner_applications")
          .update(row)
          .eq("id", applicationId)
          .select("id")
          .single();
      } else {
        result = await supabase
          .from("partner_applications")
          .insert(row)
          .select("id")
          .single();
      }
      if (result.error) throw result.error;
      if (result.data?.id) setApplicationId(result.data.id);
      if (!silent) toast.success("Progress saved");
      return true;
    } catch (e: any) {
      toast.error(e?.message || "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    if (!stepValid) {
      toast.error("กรุณากรอกข้อมูลให้ครบและถูกต้อง");
      return;
    }
    if (step < TOTAL_STEPS - 1) {
      // persist silently between steps
      await persistDraft(true);
      setStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      await handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const handleSubmit = async () => {
    if (!user) return;
    // Validate all schemas
    const checks = [
      step1Schema.safeParse(data),
      step2Schema.safeParse(data),
      step3Schema.safeParse(data),
      step4Schema.safeParse(data),
      step5Schema.safeParse(data),
    ];
    const failed = checks.findIndex((c) => !c.success);
    if (failed >= 0) {
      toast.error(`กรุณากลับไปแก้ไข Step ${failed + 1} — ${STEP_LABELS[failed]}`);
      setStep(failed);
      return;
    }

    setSubmitting(true);
    try {
      // TODO: encrypt national_id + bank_account_no via Edge Function before storing (MVP stores plaintext)
      const row = toDbRow(user.id, data, "submitted");
      let result;
      if (applicationId) {
        result = await supabase
          .from("partner_applications")
          .update(row)
          .eq("id", applicationId)
          .select("id")
          .single();
      } else {
        result = await supabase
          .from("partner_applications")
          .insert(row)
          .select("id")
          .single();
      }
      if (result.error) throw result.error;
      toast.success("ส่งคำขอเรียบร้อย — เราจะตรวจสอบภายใน 3-5 วันทำการ");
      navigate("/app/partner/status", { replace: true });
    } catch (e: any) {
      toast.error(e?.message || "ส่งคำขอไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const stepNode = useMemo(() => {
    switch (step) {
      case 0:
        return <Step1Intro defaults={data} onValidChange={handleStepValid} />;
      case 1:
        return <Step2Personal defaults={data} onValidChange={handleStepValid} />;
      case 2:
        return <Step3Banking defaults={data} onValidChange={handleStepValid} />;
      case 3:
        return <Step4Documents defaults={data} onValidChange={handleStepValid} />;
      case 4:
        return <Step5Social defaults={data} onValidChange={handleStepValid} />;
      default:
        return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (loading) {
    return (
      <div className="container max-w-3xl mx-auto py-10 px-4 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      <div className="container max-w-3xl mx-auto py-8 px-4 space-y-6">
        {/* Progress dots */}
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
            Step {step + 1} of {TOTAL_STEPS} — {STEP_LABELS[step]}
          </p>
          <div className="flex items-center gap-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} className="flex items-center flex-1">
                <div
                  className={cn(
                    "w-3 h-3 rounded-full shrink-0 transition-colors",
                    i < step
                      ? "bg-primary"
                      : i === step
                      ? "bg-primary ring-4 ring-primary/20"
                      : "bg-border"
                  )}
                />
                {i < TOTAL_STEPS - 1 && (
                  <div
                    className={cn(
                      "h-[2px] flex-1 mx-1 transition-colors",
                      i < step ? "bg-primary" : "bg-border"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <Card className="p-6 md:p-8">{stepNode}</Card>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur z-30">
        <div className="container max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={handleBack} disabled={step === 0 || submitting}>
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => persistDraft(false)}
              disabled={saving || submitting}
            >
              {saving ? "Saving…" : "Save & Continue Later"}
            </Button>
            <Button onClick={handleContinue} disabled={!stepValid || submitting}>
              {submitting
                ? "Submitting…"
                : step === TOTAL_STEPS - 1
                ? "Submit Application"
                : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartnerApply;

import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Briefcase, AlertTriangle, Star, Coins, Lightbulb,
  ArrowRight, Gift, CheckCircle2, Globe,
} from "lucide-react";
import logo from "@/assets/logo-white.png";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { surveySections, type SurveySection } from "./surveyConfig";
import { SurveyQuestionRenderer } from "./SurveyQuestions";

const ICON_MAP: Record<string, React.ElementType> = {
  Briefcase, AlertTriangle, Star, Coins, Lightbulb,
};

const SurveyWizard = () => {
  const { user } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0); // 0=welcome, 1-5=sections, 6=success
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const txt = useCallback(
    (obj: Record<string, string>) => obj[language] || obj.en || "",
    [language]
  );

  /* ── Check if should show survey (day 2+ after first login, not completed) ── */
  useEffect(() => {
    if (!user) { setChecking(false); return; }
    const check = async () => {
      try {
        const { data } = await supabase
          .from("user_personas" as any)
          .select("onboarding_completed, first_login_at, last_visit_date")
          .eq("user_id", user.id)
          .maybeSingle();

        const persona = data as any;
        const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        if (persona) {
          const firstLogin = persona.first_login_at;
          const lastVisit = persona.last_visit_date;

          // Only update if today is a new day
          if (lastVisit !== todayStr) {
            await supabase
              .from("user_personas" as any)
              .update({ last_visit_date: todayStr } as any)
              .eq("user_id", user.id);
          }

          // Show survey if: first login was on a previous day AND not completed
          if (firstLogin && !persona.onboarding_completed) {
            const firstDate = new Date(firstLogin).toISOString().slice(0, 10);
            const skippedAt = (persona as any).survey_skipped_at;
            // Show if: never skipped, or skipped on a previous day
            if (firstDate < todayStr && (!skippedAt || skippedAt < todayStr)) {
              setOpen(true);
            }
          }
        } else {
          // First ever login — record first_login_at
          await supabase
            .from("user_personas" as any)
            .insert({
              user_id: user.id,
              visit_count: 1,
              first_login_at: new Date().toISOString(),
              last_visit_date: todayStr,
            } as any);
        }
      } catch (err) {
        console.error("Survey check error:", err);
      }
      setChecking(false);
    };
    check();
  }, [user]);

  /* ── Answer handling ── */
  const handleAnswer = (key: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  /* ── Validation per section ── */
  const isSectionValid = (sectionIdx: number): boolean => {
    const section = surveySections[sectionIdx];
    if (!section) return true;
    return section.questions.every((q) => {
      if (!q.required) return true;
      const val = answers[q.key];
      if (q.type === "multi") return Array.isArray(val) && val.length > 0;
      if (q.type === "ranking") return Array.isArray(val) && val.length === (q.items?.length ?? 0);
      if (q.type === "rating") {
        if (!val || typeof val !== "object") return false;
        return q.items?.every((item) => val[item.key] >= 1) ?? false;
      }
      if (q.type === "text") return true; // text is optional
      return !!val;
    });
  };

  /* ── Navigation ── */
  const handleNext = () => {
    if (step === 0) { setStep(1); return; }
    if (step <= surveySections.length) {
      if (!isSectionValid(step - 1)) {
        toast.error(t("surveyAnswerRequired"));
        return;
      }
      if (step < surveySections.length) setStep(step + 1);
      else handleFinish();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  /* ── Finish & save ── */
  const handleFinish = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Check if credits were already awarded
      const { data: existingPersona } = await supabase
        .from("user_personas" as any)
        .select("credits_awarded")
        .eq("user_id", user.id)
        .maybeSingle();

      const alreadyAwarded = (existingPersona as any)?.credits_awarded === true;

      // Save survey data
      await supabase
        .from("user_personas" as any)
        .upsert({
          user_id: user.id,
          onboarding_completed: true,
          credits_awarded: true,
          survey_data: answers,
          // Map some fields for backwards compatibility
          profession: answers.role || null,
          use_case: answers.top_priority || null,
          ai_experience: answers.media_frequency || null,
          favorite_feature: answers.wtp_speed || null,
          content_frequency: answers.media_frequency || null,
        } as any, { onConflict: "user_id" });

      // Award 200 credits if not already awarded
      if (!alreadyAwarded) {
        const { data: creditRow } = await supabase
          .from("user_credits")
          .select("balance, total_purchased")
          .eq("user_id", user.id)
          .maybeSingle();

        if (creditRow) {
          await supabase.from("user_credits").update({
            balance: creditRow.balance + 200,
            total_purchased: creditRow.total_purchased + 200,
          }).eq("user_id", user.id);
        } else {
          await supabase.from("user_credits").insert({
            user_id: user.id, balance: 200, total_purchased: 200,
          });
        }

        await supabase.from("credit_transactions").insert({
          user_id: user.id, amount: 200, type: "bonus", feature: "onboarding",
          description: t("surveyBonusDesc"),
          balance_after: (creditRow?.balance ?? 0) + 200,
        });
        await supabase.from("credit_batches").insert({
          user_id: user.id, amount: 200, remaining: 200, source_type: "topup",
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          reference_id: "onboarding_bonus",
        });
      }

      setStep(surveySections.length + 1);
    } catch (err) {
      console.error("Survey save error:", err);
      toast.error(t("surveyError"));
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!user) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      await supabase
        .from("user_personas" as any)
        .update({ survey_skipped_at: todayStr } as any)
        .eq("user_id", user.id);
    } catch (err) {
      console.error("Skip save error:", err);
    }
    setOpen(false);
  };

  const handleClose = () => {
    if (step === surveySections.length + 1) setOpen(false);
  };

  if (checking || !user) return null;

  const totalSteps = surveySections.length + 2; // welcome + sections + success
  const currentSection = step >= 1 && step <= surveySections.length ? surveySections[step - 1] : null;
  const SectionIcon = currentSection ? (ICON_MAP[currentSection.iconName] || Briefcase) : Gift;
  const canProceed = step === 0 || step > surveySections.length || isSectionValid(step - 1);
  const toggleLang = () => setLanguage(language === "th" ? "en" : "th");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="bg-[hsl(240_8%_8%)]/80 backdrop-blur-2xl border border-white/10 max-w-lg p-0 overflow-hidden [&>button]:hidden max-h-[90vh] shadow-[0_0_60px_hsl(0_0%_0%_/_0.6)]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Progress + Language toggle */}
        <div className="relative shrink-0">
        <div className="h-1 bg-white/[0.06]">
            <div
              className="h-full bg-white/30 transition-all duration-500 rounded-r-full"
              style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
            />
          </div>
          <button
            onClick={toggleLang}
            className="absolute top-3 right-4 flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors bg-white/[0.06] px-2.5 py-1 rounded-full border border-white/10 z-10"
          >
            <Globe className="w-3.5 h-3.5" />
            {language === "th" ? "EN" : "TH"}
          </button>
        </div>

        {/* ─── Welcome ─── */}
        {step === 0 && (
          <div className="p-8 pt-6 text-center space-y-5">
            <img src={logo} alt="MediaForge" className="w-24 h-auto mx-auto mb-2" />
            <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
              <Gift className="w-8 h-8 text-white/70" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {t("surveyTitle")}
              </h2>
              <p className="text-white/50 mt-2 text-sm">
                {t("surveyDesc")}
              </p>
            </div>
            <div className="bg-white/[0.04] rounded-xl px-4 py-3 text-sm text-white font-semibold border border-white/10 flex items-center justify-center gap-2">
              <Gift className="w-4 h-4 text-white/60" />
              {t("surveyBonus")}
            </div>
            <Button className="w-full bg-white/10 hover:bg-white/15 text-white border border-white/10" onClick={handleNext}>
              {t("surveyStart")} <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <button
              onClick={handleSkip}
              className="text-xs text-white/40 hover:text-white transition-colors underline underline-offset-2"
            >
              {t("surveySkip")}
            </button>
          </div>
        )}

        {/* ─── Section Steps ─── */}
        {currentSection && (
          <div className="flex flex-col min-h-0">
            {/* Section header */}
            <div className="px-8 pt-6 pb-3 text-center space-y-3 shrink-0">
              <div className="flex items-center justify-between text-xs text-white/40">
                <span>
                  {t("surveySection")} {step} / {surveySections.length}
                </span>
                <span className="flex items-center gap-1">
                  <Gift className="w-3 h-3 text-white/40" /> 200 Credits
                </span>
              </div>
              <div className="w-14 h-14 mx-auto rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
                <SectionIcon className="w-7 h-7 text-white/60" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{txt(currentSection.title)}</h2>
                <p className="text-white/50 mt-1 text-sm">{txt(currentSection.desc)}</p>
              </div>
            </div>

            {/* Questions - scrollable */}
            <ScrollArea className="flex-1 min-h-0 max-h-[45vh]">
              <div className="px-8 pb-2 space-y-5">
                {currentSection.questions.map((q) => (
                  <div key={q.key} className="space-y-2">
                    <p className="text-sm font-semibold text-white">{txt(q.title)}</p>
                    {q.desc && <p className="text-xs text-white/40">{txt(q.desc)}</p>}
                    <SurveyQuestionRenderer
                      question={q}
                      language={language}
                      value={answers[q.key]}
                      onChange={handleAnswer}
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Step dots + nav */}
            <div className="px-8 pb-6 pt-3 space-y-4 shrink-0">
              <div className="flex justify-center gap-1.5">
                {surveySections.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i + 1 === step ? "bg-white/60 w-6" : i + 1 < step ? "bg-white/30 w-1.5" : "bg-white/10 w-1.5"
                    }`}
                  />
                ))}
              </div>
              <div className="flex gap-3">
                {step > 1 && (
                  <Button variant="outline" className="flex-1 border-white/10 text-white/60 hover:text-white" onClick={handleBack}>
                    {t("surveyBack")}
                  </Button>
                )}
                <Button
                  className="flex-1 bg-white/10 hover:bg-white/15 text-white border border-white/10"
                  onClick={handleNext}
                  disabled={!canProceed || loading}
                >
                  {loading
                    ? t("surveySaving")
                    : step < surveySections.length
                      ? <>{t("surveyNext")} <ArrowRight className="w-4 h-4 ml-1" /></>
                      : t("surveyFinish")}
                </Button>
              </div>
              <button
                onClick={handleSkip}
                className="text-xs text-white/40 hover:text-white transition-colors underline underline-offset-2 mx-auto"
              >
                {t("surveySkip")}
              </button>
            </div>
          </div>
        )}

        {/* ─── Success ─── */}
        {step === surveySections.length + 1 && (
          <div className="p-8 text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-white/60" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {t("surveyThankYou")}
              </h2>
              <p className="text-white/50 mt-2 text-sm">
                {t("surveyThankYouDesc")}
              </p>
            </div>
            <div className="bg-white/[0.04] rounded-xl px-4 py-4 text-center border border-white/10">
              <p className="text-2xl font-bold text-white">+200</p>
              <p className="text-xs text-white/40 mt-1">
                {t("surveyCreditsAdded")}
              </p>
            </div>
            <Button className="w-full bg-white/10 hover:bg-white/15 text-white border border-white/10" onClick={() => setOpen(false)}>
              {t("surveyStartUsing")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SurveyWizard;

import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Rocket, DollarSign, Shield, Zap, ArrowLeft, CheckCircle2, Sparkles,
} from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import { useLanguage } from "@/contexts/LanguageContext";

export default function PartnerProgram() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const BENEFITS = [
    { 
      icon: DollarSign, 
      title: t("revenue"),   
      desc: t("revenueDesc"),
    },
    { 
      icon: Zap,        
      title: t("apiaccess"), 
      desc: t("apiaccessDesc"),
     },
    { 
      icon: Shield,     
      title: t("support"),   
      desc: t("supportDesc"),
     },
  ];

  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    use_case: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.use_case.trim()) {
      toast({ title: t("partnerFillRequired"), variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("partner_leads").insert({
      user_id: user?.id ?? null,
      name: form.name.trim(),
      email: form.email.trim(),
      company: form.company.trim() || null,
      use_case: form.use_case.trim(),
    } as any);
    setLoading(false);
    if (error) {
      toast({ title: t("partnerSomethingWrong"), description: error.message, variant: "destructive" });
      return;
    }
    setSubmitted(true);
    toast({ title: t("partnerRequestSubmitted"), description: t("partnerReviewContact") });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-16 md:pt-32 md:pb-24">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-primary/10 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t("partnerBadge")}
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {t("partnerContext1")}
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {t("partnerContext2")}
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            {t("partnerContext3")}
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="grid gap-6 sm:grid-cols-3">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="group rounded-2xl border border-border/50 bg-card/50 p-6 backdrop-blur-sm transition-colors hover:border-primary/40"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <b.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Form */}
      <section className="mx-auto max-w-xl px-6 pb-24">
        <div className="rounded-2xl border border-border/50 bg-card/60 p-8 backdrop-blur-sm">
          {submitted ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <CheckCircle2 className="h-14 w-14 text-primary" />
              <h2 className="text-2xl font-bold">{t("partnerThankYou")}</h2>
              <p className="text-muted-foreground">
                {t("partnerReviewContact")}
              </p>
              <Link to="/app/home">
                <Button variant="outline" className="mt-4 gap-2">
                  <ArrowLeft className="h-4 w-4" /> {t("partnerBackHome")}
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-center gap-3">
                <Rocket className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-bold">{t("partnerRequestAccess")}</h2>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t("partnerFullName")}</Label>
                  <Input id="name" name="name" value={form.name} onChange={handleChange} placeholder="John Doe" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t("partnerEmailLabel")}</Label>
                  <Input id="email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="john@company.com" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company">{t("partnerCompanyLabel")}</Label>
                  <Input id="company" name="company" value={form.company} onChange={handleChange} placeholder={t("partnerOptional")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="use_case">{t("partnerUseCaseLabel")}</Label>
                  <Textarea
                    id="use_case"
                    name="use_case"
                    value={form.use_case}
                    onChange={handleChange}
                    placeholder={t("partnerUseCasePlaceholder")}
                    rows={4}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? t("partnerSubmitting") : t("partnerSubmitButton")}
                </Button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

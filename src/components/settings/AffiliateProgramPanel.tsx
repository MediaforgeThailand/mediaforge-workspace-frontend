import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Loader2, Send, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLanguageLocale, useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/contexts/locales/en";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/friendlyError";
import { cn } from "@/lib/utils";

type AffiliateStatus = {
  application: {
    status?: string | null;
    legal_first_name?: string | null;
    legal_last_name?: string | null;
    phone_e164?: string | null;
    bank_name?: string | null;
    bank_account_no?: string | null;
    bank_account_name?: string | null;
    social_profile_url?: string | null;
    social_platform?: string | null;
    follower_count?: number | null;
    rejection_reason?: string | null;
  } | null;
  partner: { commission_rate?: number | null; suspended_at?: string | null } | null;
  codes: Array<{ code: string; discount_percent?: number | null; is_active?: boolean | null }>;
  totals: { total: number; holding: number; available: number; paid: number };
  sales_total_thb?: number;
  upgrade?: {
    threshold_thb: number;
    discount_percent: number;
    sales_total_thb: number;
    remaining_thb: number;
    eligible: boolean;
    unlocked: boolean;
  };
};

const emptyStatus: AffiliateStatus = {
  application: null,
  partner: null,
  codes: [],
  totals: { total: 0, holding: 0, available: 0, paid: 0 },
  sales_total_thb: 0,
  upgrade: {
    threshold_thb: 100_000,
    discount_percent: 20,
    sales_total_thb: 0,
    remaining_thb: 100_000,
    eligible: false,
    unlocked: false,
  },
};

type LocalizedOption = {
  value: string;
  labelKey: TranslationKey;
};

const APPLICATION_STATUS_KEYS: Record<string, TranslationKey> = {
  "not submitted": "affiliate.status.notSubmitted",
  submitted: "affiliate.status.submitted",
  approved: "affiliate.status.approved",
  rejected: "affiliate.status.rejected",
};

const SOCIAL_PLATFORM_OPTIONS: LocalizedOption[] = [
  { value: "YouTube", labelKey: "affiliate.platform.youtube" },
  { value: "TikTok", labelKey: "affiliate.platform.tiktok" },
  { value: "Instagram", labelKey: "affiliate.platform.instagram" },
  { value: "Facebook", labelKey: "affiliate.platform.facebook" },
  { value: "X / Twitter", labelKey: "affiliate.platform.xTwitter" },
  { value: "Threads", labelKey: "affiliate.platform.threads" },
  { value: "Twitch", labelKey: "affiliate.platform.twitch" },
  { value: "Website / Blog", labelKey: "affiliate.platform.websiteBlog" },
  { value: "Podcast", labelKey: "affiliate.platform.podcast" },
  { value: "Other", labelKey: "affiliate.platform.other" },
];

const THAI_BANK_OPTIONS: LocalizedOption[] = [
  { value: "Bangkok Bank (BBL)", labelKey: "affiliate.bank.bangkokBank" },
  { value: "Kasikornbank (KBank)", labelKey: "affiliate.bank.kasikornbank" },
  { value: "Krungthai Bank (KTB)", labelKey: "affiliate.bank.krungthai" },
  { value: "Siam Commercial Bank (SCB)", labelKey: "affiliate.bank.scb" },
  { value: "Bank of Ayudhya / Krungsri (BAY)", labelKey: "affiliate.bank.krungsri" },
  { value: "TMBThanachart Bank (ttb)", labelKey: "affiliate.bank.ttb" },
  { value: "Government Savings Bank (GSB)", labelKey: "affiliate.bank.gsb" },
  { value: "BAAC", labelKey: "affiliate.bank.baac" },
  { value: "Government Housing Bank (GHB)", labelKey: "affiliate.bank.ghb" },
  { value: "Kiatnakin Phatra Bank (KKP)", labelKey: "affiliate.bank.kkp" },
  { value: "CIMB Thai Bank", labelKey: "affiliate.bank.cimbThai" },
  { value: "TISCO Bank", labelKey: "affiliate.bank.tisco" },
  { value: "United Overseas Bank (Thai) / UOB", labelKey: "affiliate.bank.uobThai" },
  { value: "LH Bank", labelKey: "affiliate.bank.lh" },
  { value: "Thai Credit Bank", labelKey: "affiliate.bank.thaiCredit" },
  { value: "Islamic Bank of Thailand", labelKey: "affiliate.bank.islamicBank" },
  { value: "Standard Chartered Bank (Thai)", labelKey: "affiliate.bank.standardCharteredThai" },
  { value: "ICBC (Thai)", labelKey: "affiliate.bank.icbcThai" },
  { value: "Bank of China (Thai)", labelKey: "affiliate.bank.bankOfChinaThai" },
  { value: "SME D Bank", labelKey: "affiliate.bank.smeD" },
  { value: "EXIM Bank Thailand", labelKey: "affiliate.bank.exim" },
  { value: "Other Thai bank", labelKey: "affiliate.bank.otherThai" },
];

function normalizePhone(raw: string): { value: string; valid: boolean } {
  const trimmed = raw.replace(/[\s-]/g, "");
  // Thai local format "0XXXXXXXXX" → "+66XXXXXXXXX"
  if (/^0\d{8,9}$/.test(trimmed)) {
    return { value: `+66${trimmed.slice(1)}`, valid: true };
  }
  // E.164: leading + then 7-15 digits, first digit 1-9
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) {
    return { value: trimmed, valid: true };
  }
  return { value: trimmed, valid: false };
}

function formatMoney(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export default function AffiliateProgramPanel({ className }: { className?: string }) {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const locale = getLanguageLocale(language);
  const money = (value: number) => formatMoney(value, locale);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    social_profile_url: "",
    social_platform: "",
    follower_count: "",
    bank_name: "",
    bank_account_no: "",
    bank_account_name: "",
  });

  const statusQuery = useQuery({
    queryKey: ["affiliate-portal-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ data: AffiliateStatus }>("affiliate-portal", {
        body: { action: "get_affiliate_status" },
      });
      if (error) throw error;
      return data?.data ?? emptyStatus;
    },
  });

  const status = statusQuery.data ?? emptyStatus;
  const isApproved = Boolean(status.partner && !status.partner.suspended_at);
  const applicationStatus = status.application?.status ?? "not submitted";
  const statusKey = APPLICATION_STATUS_KEYS[applicationStatus.toLowerCase()] ?? "affiliate.status.unknown";
  const applicationStatusLabel =
    statusKey === "affiliate.status.unknown"
      ? t(statusKey, { status: applicationStatus })
      : t(statusKey);
  const commissionRate = Math.round(Number(status.partner?.commission_rate ?? 0.3) * 100);
  const salesTotal = Number(status.sales_total_thb ?? status.upgrade?.sales_total_thb ?? 0);
  const upgrade = status.upgrade ?? emptyStatus.upgrade!;
  const upgradeProgress = Math.max(0, Math.min(100, (salesTotal / Math.max(1, upgrade.threshold_thb)) * 100));

  const activeCode = status.codes.find((row) => row.is_active !== false);
  const referralLink = useMemo(() => {
    if (!activeCode?.code) return "";
    return `${window.location.origin}/app/pricing?ref=${encodeURIComponent(activeCode.code)}`;
  }, [activeCode?.code]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const phone = normalizePhone(form.phone);
      if (!phone.valid) {
        throw new Error(t("affiliate.error.invalidPhone"));
      }
      if (!form.bank_name) {
        throw new Error(t("affiliate.error.chooseBank"));
      }
      const { data, error } = await supabase.functions.invoke("affiliate-portal", {
        body: {
          action: "submit_affiliate_application",
          ...form,
          phone: phone.value,
          follower_count: Number(form.follower_count || 0),
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["affiliate-portal-status"] });
      toast({
        title: t("affiliate.toast.applicationSentTitle"),
        description: t("affiliate.toast.applicationSentDescription"),
      });
    },
    onError: (error) => {
      toast({
        title: t("affiliate.toast.submitFailedTitle"),
        description: friendlyError(error),
        variant: "destructive",
      });
    },
  });

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const copyText = async (labelKey: TranslationKey, value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast({
      title: t("affiliate.toast.copiedTitle"),
      description: t("affiliate.toast.copiedDescription", { label: t(labelKey) }),
    });
  };

  if (statusQuery.isLoading) {
    return (
      <div className={cn("flex min-h-[220px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
      </div>
    );
  }

  if (isApproved) {
    return (
      <div className={cn("max-w-[920px] space-y-[18px]", className)}>
        <div className="flex flex-col gap-[12px] sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-yellow-300">{t("affiliate.programLabel")}</p>
            <h2 className="mt-[6px] text-[22px] font-semibold leading-[28px] text-zinc-50">{t("affiliate.dashboard.title")}</h2>
            <p className="mt-[5px] max-w-[640px] text-[13px] leading-[20px] text-zinc-400">
              {t("affiliate.dashboard.description", { rate: commissionRate })}
            </p>
          </div>
          <Badge className="h-[26px] w-fit border-emerald-400/25 bg-emerald-400/10 px-[10px] text-emerald-200">
            <CheckCircle2 className="mr-[5px] h-[13px] w-[13px]" />
            {t("affiliate.status.approved")}
          </Badge>
        </div>

        <div className="grid gap-[12px] sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={t("affiliate.metric.attributedSales")} value={money(salesTotal)} />
          <Metric label={t("affiliate.metric.totalCommission")} value={money(status.totals.total)} />
          <Metric label={t("affiliate.metric.available")} value={money(status.totals.available)} />
          <Metric label={t("affiliate.metric.paid")} value={money(status.totals.paid)} />
        </div>

        <div className="grid gap-[14px] lg:grid-cols-[1fr_0.9fr]">
          <section className="rounded-lg border border-white/10 bg-white/[0.03] p-[16px]">
            <div className="flex items-start justify-between gap-[12px]">
              <div>
                <h3 className="text-[15px] font-semibold leading-[20px] text-zinc-100">{t("affiliate.dashboard.upgradeTitle")}</h3>
                <p className="mt-[4px] text-[13px] leading-[20px] text-zinc-400">
                  {t("affiliate.dashboard.upgradeDescription", {
                    threshold: money(upgrade.threshold_thb),
                    percent: upgrade.discount_percent,
                  })}
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0",
                  upgrade.unlocked
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                    : "border-yellow-400/30 bg-yellow-400/10 text-yellow-200",
                )}
              >
                {upgrade.unlocked
                  ? t("affiliate.dashboard.unlocked")
                  : t("affiliate.dashboard.remaining", { amount: money(upgrade.remaining_thb) })}
              </Badge>
            </div>
            <div className="mt-[14px] h-[8px] overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-yellow-300" style={{ width: `${upgradeProgress}%` }} />
            </div>
            <div className="mt-[8px] flex items-center justify-between text-[12px] leading-[16px] text-zinc-500">
              <span>{money(salesTotal)}</span>
              <span>{upgradeProgress.toFixed(0)}%</span>
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/[0.03] p-[16px]">
            <h3 className="text-[15px] font-semibold leading-[20px] text-zinc-100">{t("affiliate.dashboard.codesTitle")}</h3>
            {status.codes.length === 0 ? (
              <p className="mt-[8px] text-[13px] leading-[20px] text-zinc-400">{t("affiliate.dashboard.noCodes")}</p>
            ) : (
              <div className="mt-[12px] space-y-[8px]">
                {status.codes.map((code) => (
                  <div key={code.code} className="flex items-center justify-between gap-[10px] rounded-md border border-white/10 bg-black/20 px-[10px] py-[8px]">
                    <span className="font-mono text-[13px] font-semibold text-zinc-100">{code.code}</span>
                    <span className="text-[12px] text-emerald-300">
                      {Number(code.discount_percent ?? 0) > 0
                        ? t("affiliate.dashboard.discountOff", { percent: Number(code.discount_percent ?? 0) })
                        : t("affiliate.dashboard.linkOnly")}
                    </span>
                  </div>
                ))}
                {referralLink && (
                  <div className="grid gap-[8px] sm:grid-cols-2">
                    <Button type="button" variant="outline" className="h-[36px]" onClick={() => copyText("affiliate.dashboard.referralLink", referralLink)}>
                      <Copy className="mr-[6px] h-[14px] w-[14px]" />
                      {t("affiliate.dashboard.copyLink")}
                    </Button>
                    <Button type="button" variant="outline" className="h-[36px]" onClick={() => copyText("affiliate.dashboard.creatorCode", activeCode?.code ?? "")}>
                      <Copy className="mr-[6px] h-[14px] w-[14px]" />
                      {t("affiliate.dashboard.copyCode")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("max-w-[920px] space-y-[18px]", className)}>
      <div className="flex flex-col gap-[12px] sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-yellow-300">{t("affiliate.programLabel")}</p>
          <h2 className="mt-[6px] text-[22px] font-semibold leading-[28px] text-zinc-50">{t("affiliate.apply.title")}</h2>
          <p className="mt-[5px] max-w-[640px] text-[13px] leading-[20px] text-zinc-400">
            {t("affiliate.apply.description", { rate: 30 })}
          </p>
        </div>
        <Badge variant="outline" className="h-[26px] w-fit border-white/15 bg-white/[0.04] px-[10px] text-zinc-300">
          {applicationStatusLabel}
        </Badge>
      </div>

      <div className="rounded-lg border border-yellow-300/30 bg-yellow-300/[0.09] p-[14px] shadow-[0_0_0_1px_rgba(253,224,71,0.04)]">
        <div className="flex gap-[10px]">
          <TrendingUp className="mt-[2px] h-[16px] w-[16px] shrink-0 text-yellow-200" />
          <p className="text-[13px] leading-[20px] text-yellow-50/90">
            {t("affiliate.apply.upgradePath", {
              threshold: money(emptyStatus.upgrade!.threshold_thb),
              percent: emptyStatus.upgrade!.discount_percent,
            })}
          </p>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitMutation.mutate();
        }}
        className="rounded-lg border border-white/15 bg-zinc-900/85 p-[18px] shadow-[0_14px_36px_rgba(0,0,0,0.22)]"
      >
        <h3 className="text-[15px] font-semibold leading-[20px] text-zinc-50">{t("affiliate.form.title")}</h3>
        <div className="mt-[16px] grid gap-[14px] sm:grid-cols-2">
          <Field label={t("affiliate.form.fullName")} value={form.full_name} onChange={(v) => updateField("full_name", v)} />
          <Field label={t("affiliate.form.phone")} value={form.phone} onChange={(v) => updateField("phone", v)} placeholder={t("affiliate.form.phonePlaceholder")} required />
          <Field label={t("affiliate.form.socialProfileUrl")} value={form.social_profile_url} onChange={(v) => updateField("social_profile_url", v)} required />
          <SelectField
            label={t("affiliate.form.platform")}
            value={form.social_platform}
            onChange={(v) => updateField("social_platform", v)}
            placeholder={t("affiliate.form.platformPlaceholder")}
            options={SOCIAL_PLATFORM_OPTIONS}
          />
          <Field label={t("affiliate.form.followerCount")} value={form.follower_count} onChange={(v) => updateField("follower_count", v)} placeholder={t("affiliate.form.optional")} />
          <SelectField
            label={t("affiliate.form.bankName")}
            value={form.bank_name}
            onChange={(v) => updateField("bank_name", v)}
            placeholder={t("affiliate.form.bankNamePlaceholder")}
            options={THAI_BANK_OPTIONS}
            required
          />
          <Field label={t("affiliate.form.bankAccountNumber")} value={form.bank_account_no} onChange={(v) => updateField("bank_account_no", v)} required />
          <Field label={t("affiliate.form.bankAccountName")} value={form.bank_account_name} onChange={(v) => updateField("bank_account_name", v)} required />
        </div>

        {status.application?.rejection_reason && (
          <div className="mt-[12px] rounded-md border border-red-400/30 bg-red-500/10 p-[10px] text-[13px] leading-[20px] text-red-100">
            {status.application.rejection_reason}
          </div>
        )}

        <Button
          type="submit"
          disabled={submitMutation.isPending}
          className="mt-[16px] h-[38px] rounded-full bg-yellow-300 px-[18px] text-[13px] font-semibold text-zinc-950 hover:bg-yellow-200"
        >
          {submitMutation.isPending ? <Loader2 className="mr-[6px] h-[14px] w-[14px] animate-spin" /> : <Send className="mr-[6px] h-[14px] w-[14px]" />}
          {submitMutation.isPending ? t("affiliate.form.submitting") : t("affiliate.form.submit")}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-[6px]">
      <Label className="text-[12px] font-semibold leading-[16px] text-zinc-100">{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        className="h-[38px] rounded-md border-zinc-600/70 bg-zinc-800/90 px-[12px] text-[13px] text-zinc-50 placeholder:text-zinc-500 focus:border-yellow-300/70 focus:ring-1 focus:ring-yellow-300/30 focus:ring-offset-0"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  placeholder,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: LocalizedOption[];
  required?: boolean;
}) {
  const { t } = useLanguage();

  return (
    <div className="space-y-[6px]">
      <Label className="text-[12px] font-semibold leading-[16px] text-zinc-100">
        {label}
        {required ? <span className="ml-[3px] text-yellow-200">*</span> : null}
      </Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-[38px] rounded-md border-zinc-600/70 bg-zinc-800/90 px-[12px] text-[13px] text-zinc-50 focus:border-yellow-300/70 focus:ring-1 focus:ring-yellow-300/30 focus:ring-offset-0">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-[260px] border-white/10 bg-[#1f1f1f] text-zinc-100">
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="text-[13px] focus:bg-yellow-300/10 focus:text-yellow-50"
            >
              {t(option.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-[14px]">
      <p className="text-[12px] leading-[16px] text-zinc-500">{label}</p>
      <p className="mt-[4px] text-[18px] font-semibold leading-[24px] text-zinc-50">{value}</p>
    </div>
  );
}

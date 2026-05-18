import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Loader2, Send, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

function money(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export default function AffiliateProgramPanel({ className }: { className?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
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
        throw new Error("Use international phone format like +66812345678, or Thai local 0812345678.");
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
      toast({ title: "Application sent", description: "Our team will review and approve it manually." });
    },
    onError: (error) => {
      toast({
        title: "Could not submit application",
        description: friendlyError(error),
        variant: "destructive",
      });
    },
  });

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const copyText = async (label: string, value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
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
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-yellow-300">Affiliate Program</p>
            <h2 className="mt-[6px] text-[22px] font-semibold leading-[28px] text-zinc-50">Creator dashboard</h2>
            <p className="mt-[5px] max-w-[640px] text-[13px] leading-[20px] text-zinc-400">
              Your account is approved. You earn {commissionRate}% commission from confirmed subscription sales,
              and renewals keep using the first paid amount as the commission base.
            </p>
          </div>
          <Badge className="h-[26px] w-fit border-emerald-400/25 bg-emerald-400/10 px-[10px] text-emerald-200">
            <CheckCircle2 className="mr-[5px] h-[13px] w-[13px]" />
            Approved
          </Badge>
        </div>

        <div className="grid gap-[12px] sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Attributed sales" value={money(salesTotal)} />
          <Metric label="Total commission" value={money(status.totals.total)} />
          <Metric label="Available" value={money(status.totals.available)} />
          <Metric label="Paid" value={money(status.totals.paid)} />
        </div>

        <div className="grid gap-[14px] lg:grid-cols-[1fr_0.9fr]">
          <section className="rounded-lg border border-white/10 bg-white/[0.03] p-[16px]">
            <div className="flex items-start justify-between gap-[12px]">
              <div>
                <h3 className="text-[15px] font-semibold leading-[20px] text-zinc-100">Upgrade condition</h3>
                <p className="mt-[4px] text-[13px] leading-[20px] text-zinc-400">
                  Reach {money(upgrade.threshold_thb)} in confirmed affiliate sales to unlock your own {upgrade.discount_percent}% discount code.
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
                {upgrade.unlocked ? "Unlocked" : `${money(upgrade.remaining_thb)} left`}
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
            <h3 className="text-[15px] font-semibold leading-[20px] text-zinc-100">Codes and link</h3>
            {status.codes.length === 0 ? (
              <p className="mt-[8px] text-[13px] leading-[20px] text-zinc-400">Your referral link will appear here after the first code is created.</p>
            ) : (
              <div className="mt-[12px] space-y-[8px]">
                {status.codes.map((code) => (
                  <div key={code.code} className="flex items-center justify-between gap-[10px] rounded-md border border-white/10 bg-black/20 px-[10px] py-[8px]">
                    <span className="font-mono text-[13px] font-semibold text-zinc-100">{code.code}</span>
                    <span className="text-[12px] text-emerald-300">
                      {Number(code.discount_percent ?? 0) > 0 ? `${code.discount_percent}% off` : "link only"}
                    </span>
                  </div>
                ))}
                {referralLink && (
                  <div className="grid gap-[8px] sm:grid-cols-2">
                    <Button type="button" variant="outline" className="h-[36px]" onClick={() => copyText("Referral link", referralLink)}>
                      <Copy className="mr-[6px] h-[14px] w-[14px]" />
                      Copy link
                    </Button>
                    <Button type="button" variant="outline" className="h-[36px]" onClick={() => copyText("Creator code", activeCode?.code ?? "")}>
                      <Copy className="mr-[6px] h-[14px] w-[14px]" />
                      Copy code
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
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-yellow-300">Affiliate Program</p>
          <h2 className="mt-[6px] text-[22px] font-semibold leading-[28px] text-zinc-50">Apply as a creator affiliate</h2>
          <p className="mt-[5px] max-w-[640px] text-[13px] leading-[20px] text-zinc-400">
            Submit a simple creator profile for manual review. Approved creators earn 30% commission from confirmed subscription sales.
          </p>
        </div>
        <Badge variant="outline" className="h-[26px] w-fit border-white/15 bg-white/[0.04] px-[10px] capitalize text-zinc-300">
          {applicationStatus}
        </Badge>
      </div>

      <div className="rounded-lg border border-yellow-300/20 bg-yellow-300/[0.06] p-[14px]">
        <div className="flex gap-[10px]">
          <TrendingUp className="mt-[2px] h-[16px] w-[16px] shrink-0 text-yellow-200" />
          <p className="text-[13px] leading-[20px] text-yellow-50/90">
            Upgrade path: when your confirmed affiliate sales reach {money(emptyStatus.upgrade!.threshold_thb)},
            your creator account unlocks a personal {emptyStatus.upgrade!.discount_percent}% discount code.
          </p>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitMutation.mutate();
        }}
        className="rounded-lg border border-white/10 bg-white/[0.03] p-[16px]"
      >
        <h3 className="text-[15px] font-semibold leading-[20px] text-zinc-100">Creator and payout details</h3>
        <div className="mt-[14px] grid gap-[12px] sm:grid-cols-2">
          <Field label="Full name" value={form.full_name} onChange={(v) => updateField("full_name", v)} />
          <Field label="Phone" value={form.phone} onChange={(v) => updateField("phone", v)} placeholder="+66812345678 or 0812345678" required />
          <Field label="Social profile URL" value={form.social_profile_url} onChange={(v) => updateField("social_profile_url", v)} required />
          <Field label="Platform" value={form.social_platform} onChange={(v) => updateField("social_platform", v)} placeholder="YouTube, TikTok, Instagram" />
          <Field label="Follower count" value={form.follower_count} onChange={(v) => updateField("follower_count", v)} placeholder="Optional" />
          <Field label="Bank name" value={form.bank_name} onChange={(v) => updateField("bank_name", v)} required />
          <Field label="Bank account number" value={form.bank_account_no} onChange={(v) => updateField("bank_account_no", v)} required />
          <Field label="Bank account name" value={form.bank_account_name} onChange={(v) => updateField("bank_account_name", v)} required />
        </div>

        {status.application?.rejection_reason && (
          <div className="mt-[12px] rounded-md border border-red-400/30 bg-red-500/10 p-[10px] text-[13px] leading-[20px] text-red-100">
            {status.application.rejection_reason}
          </div>
        )}

        <Button
          type="submit"
          disabled={submitMutation.isPending}
          className="mt-[14px] h-[36px] rounded-full bg-yellow-300 px-[16px] text-[13px] font-semibold text-zinc-950 hover:bg-yellow-200"
        >
          {submitMutation.isPending ? <Loader2 className="mr-[6px] h-[14px] w-[14px] animate-spin" /> : <Send className="mr-[6px] h-[14px] w-[14px]" />}
          Submit for approval
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
      <Label className="text-[12px] font-semibold leading-[16px] text-zinc-300">{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        className="h-[36px] rounded-md border-white/15 bg-[#232323] px-[12px] text-[13px] text-zinc-100 placeholder:text-zinc-600"
      />
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

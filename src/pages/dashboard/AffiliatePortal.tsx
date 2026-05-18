import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Send, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/friendlyError";

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
};

const emptyStatus: AffiliateStatus = {
  application: null,
  partner: null,
  codes: [],
  totals: { total: 0, holding: 0, available: 0, paid: 0 },
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export default function AffiliatePortal() {
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
  const referralLink = useMemo(() => {
    const code = status.codes.find((row) => row.is_active !== false)?.code;
    if (!code) return "";
    return `${window.location.origin}/app/pricing?ref=${encodeURIComponent(code)}`;
  }, [status.codes]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("affiliate-portal", {
        body: {
          action: "submit_affiliate_application",
          ...form,
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

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    toast({ title: "Copied", description: "Referral link copied to clipboard." });
  };

  return (
    <div className="min-h-screen bg-[#151515] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-yellow-300">Creator affiliate</p>
            <h1 className="mt-2 text-3xl font-black">Earn from MediaForge subscriptions</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Apply once, wait for manual approval, then share your link or creator code.
              Commission is 30% and renewals use the first successful paid amount as the locked base.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
            <span className="text-zinc-400">Status</span>
            <div className="mt-1 flex items-center gap-2 font-bold capitalize">
              {statusQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 text-emerald-300" />}
              {isApproved ? "approved" : applicationStatus}
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitMutation.mutate();
            }}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20"
          >
            <h2 className="text-lg font-bold">Simple KYC</h2>
            <p className="mt-1 text-sm text-zinc-400">We only collect what the team needs to approve and pay creators.</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Full name" value={form.full_name} onChange={(v) => updateField("full_name", v)} />
              <Field label="Phone" value={form.phone} onChange={(v) => updateField("phone", v)} required />
              <Field label="Social profile URL" value={form.social_profile_url} onChange={(v) => updateField("social_profile_url", v)} required />
              <Field label="Platform" value={form.social_platform} onChange={(v) => updateField("social_platform", v)} placeholder="YouTube, TikTok, Instagram" />
              <Field label="Follower count" value={form.follower_count} onChange={(v) => updateField("follower_count", v)} placeholder="Optional" />
              <Field label="Bank name" value={form.bank_name} onChange={(v) => updateField("bank_name", v)} required />
              <Field label="Bank account number" value={form.bank_account_no} onChange={(v) => updateField("bank_account_no", v)} required />
              <Field label="Bank account name" value={form.bank_account_name} onChange={(v) => updateField("bank_account_name", v)} required />
            </div>

            {status.application?.rejection_reason && (
              <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                {status.application.rejection_reason}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitMutation.isPending}
              className="mt-5 h-11 rounded-full bg-yellow-300 font-black text-zinc-950 hover:bg-yellow-200"
            >
              {submitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Submit for approval
            </Button>
          </form>

          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <h2 className="text-lg font-bold">Commission</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Metric label="Total" value={money(status.totals.total)} />
                <Metric label="Available" value={money(status.totals.available)} />
                <Metric label="Holding" value={money(status.totals.holding)} />
                <Metric label="Paid" value={money(status.totals.paid)} />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <h2 className="text-lg font-bold">Your code and link</h2>
              {status.codes.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-400">A code or referral link appears here after approval.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {status.codes.map((code) => (
                    <div key={code.code} className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-sm font-bold">{code.code}</span>
                        <span className="text-xs text-emerald-300">
                          {Number(code.discount_percent ?? 0) > 0 ? `${code.discount_percent}% off` : "referral link"}
                        </span>
                      </div>
                    </div>
                  ))}
                  {referralLink && (
                    <Button type="button" variant="outline" className="w-full rounded-full" onClick={copyLink}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy referral link
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
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
    <div className="space-y-2">
      <Label className="text-xs font-bold text-zinc-300">{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        className="h-10 rounded-xl border-white/10 bg-black/25 text-white placeholder:text-zinc-600"
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-base font-black">{value}</p>
    </div>
  );
}

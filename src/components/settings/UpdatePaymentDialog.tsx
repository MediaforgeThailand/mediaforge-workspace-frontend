import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertCircle, CheckCircle2, CreditCard, QrCode } from "lucide-react";
import {
  Elements,
  PaymentElement,
  useStripe as useStripeJs,
  useElements,
} from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { getStripe } from "@/lib/stripe";
import { useToast } from "@/hooks/use-toast";

/**
 * Update payment details dialog.
 *
 * Two tabs:
 *   - Card    → SetupIntent flow via Stripe Elements. On confirm we
 *               POST `stripe-attach-payment-method` to set the new PM
 *               as default.
 *   - PromptPay → no card to "store" (PromptPay is one-shot QR), so
 *                 instead this tab tells the user PromptPay is
 *                 always available at checkout time and points them
 *                 at the topup flow. We can't pre-attach a PromptPay
 *                 PM as a "default" because Stripe doesn't keep
 *                 reusable PromptPay payment methods.
 *
 * Why split this from QuickTopUpModal: QuickTopUpModal kicks a
 * PaymentIntent (immediate charge); this dialog uses SetupIntent
 * (no charge, just save the card for future renewals / auto-refill).
 */

interface UpdatePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const CardForm = ({ onSaved, onClose }: { onSaved?: () => void; onClose: () => void }) => {
  const stripe = useStripeJs();
  const elements = useElements();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    // Confirm the SetupIntent. Stripe attaches the resulting PM to
    // the customer (we passed customer + usage='off_session' on the
    // server when creating the intent), so the only follow-up step
    // is to mark this PM as the customer's default for invoices.
    const { error: confirmErr, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/app/settings?paymentmethod=updated`,
      },
      redirect: "if_required",
    });

    if (confirmErr) {
      setError(confirmErr.message ?? "Could not save card");
      setSubmitting(false);
      return;
    }

    const pmId = setupIntent?.payment_method;
    if (!pmId) {
      setError("Stripe did not return a payment method id");
      setSubmitting(false);
      return;
    }

    // Mark this PM as default for future invoices via our edge fn.
    const { error: attachErr, data } = await supabase.functions.invoke("stripe-attach-payment-method", {
      body: { payment_method_id: typeof pmId === "string" ? pmId : pmId.id, set_default: true },
    });
    if (attachErr || data?.error) {
      setError(attachErr?.message || data?.error || "Could not set as default");
      setSubmitting(false);
      return;
    }

    toast({ title: "Card saved", description: "Future renewals will use this card." });
    setSubmitting(false);
    onSaved?.();
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
          <AlertCircle className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full bg-violet-600 hover:bg-violet-500 text-white"
      >
        {submitting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            Saving card…
          </>
        ) : (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            Save card as default
          </>
        )}
      </Button>
    </form>
  );
};

const UpdatePaymentDialog = ({ open, onOpenChange, onSaved }: UpdatePaymentDialogProps) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState(false);

  // Pre-warm Stripe.js so the Elements provider doesn't show a flash
  // of empty space when the user clicks the Card tab.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const s = await getStripe();
      if (!cancelled) setStripeReady(!!s);
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Lazily request a SetupIntent on first open.
  useEffect(() => {
    if (!open) {
      // Reset on close so the next open gets a fresh intent.
      setClientSecret(null);
      setError(null);
      return;
    }
    if (clientSecret || loading) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase.functions.invoke("stripe-payment-methods", {
          body: { op: "setup_intent" },
        });
        if (err || data?.error) throw new Error(err?.message || data?.error);
        if (!data?.client_secret) throw new Error("Stripe did not return a client secret");
        setClientSecret(data.client_secret);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start card setup");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, clientSecret, loading]);

  const elementsOptions: StripeElementsOptions | undefined = useMemo(() => {
    if (!clientSecret) return undefined;
    return {
      clientSecret,
      appearance: {
        theme: "night",
        variables: {
          colorPrimary: "#a78bfa",
          colorBackground: "#0c1020",
          colorText: "#e5e7eb",
          colorDanger: "#ef4444",
          fontFamily: "Prompt, system-ui, sans-serif",
          borderRadius: "8px",
        },
      },
    };
  }, [clientSecret]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] p-0 overflow-hidden bg-[#0c1020] border-white/[0.08] rounded-2xl gap-0">
        <div className="px-6 pt-6 pb-3">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-zinc-50">
              Update payment details
            </DialogTitle>
            <DialogDescription className="text-[11px] text-zinc-400">
              Save a card for renewals and auto-refills, or pay via PromptPay QR at checkout.
            </DialogDescription>
          </DialogHeader>
        </div>

        <Tabs defaultValue="card" className="px-6 pb-5">
          <TabsList className="bg-white/[0.04] border border-white/[0.06] mb-4">
            <TabsTrigger value="card" className="text-xs data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-100">
              <CreditCard className="w-3.5 h-3.5 mr-1.5" />
              Card
            </TabsTrigger>
            <TabsTrigger value="promptpay" className="text-xs data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-100">
              <QrCode className="w-3.5 h-3.5 mr-1.5" />
              PromptPay QR
            </TabsTrigger>
          </TabsList>

          <TabsContent value="card" className="m-0">
            {(loading || !stripeReady) && !error && !clientSecret && (
              <div className="flex items-center gap-2 py-6 justify-center text-xs text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading secure card form…
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                <AlertCircle className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {stripeReady && clientSecret && elementsOptions && (
              <Elements stripe={getStripe()} options={elementsOptions}>
                <CardForm onSaved={onSaved} onClose={() => onOpenChange(false)} />
              </Elements>
            )}
          </TabsContent>

          <TabsContent value="promptpay" className="m-0">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-400" />
                <p className="text-sm font-medium text-zinc-100">
                  PromptPay is checkout-only
                </p>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Thai PromptPay QR is a one-shot payment method — there's no reusable token to "save". When you pay with PromptPay at checkout (top-up or subscription), Stripe generates a fresh QR for that single charge.
              </p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                For automatic renewals and auto-refill of credits, save a card under the <span className="text-zinc-200 font-medium">Card</span> tab. You can still pay individual top-ups with PromptPay any time.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full border-white/10 text-zinc-300 hover:bg-white/5"
              >
                Got it
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default UpdatePaymentDialog;

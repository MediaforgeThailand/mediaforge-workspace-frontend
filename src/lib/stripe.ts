/**
 * Shared loader for the Stripe.js singleton.
 *
 * Several surfaces (subscription checkout, topup checkout, card-add
 * SetupIntent flow) all need a `loadStripe()` promise tied to the
 * same publishable key. Loading the script once and caching the
 * resulting promise prevents flicker and avoids the "Stripe.js
 * loaded multiple times" console warning.
 *
 * The publishable key is fetched from the `get-stripe-key` edge
 * function on first request — we don't ship it as a Vite env var,
 * because the workspace project rotates keys per environment and
 * keeping the source of truth on the server avoids stale builds.
 */
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { supabase } from "@/integrations/supabase/client";

let publishableKeyPromise: Promise<string | null> | null = null;
let stripePromise: Promise<StripeJs | null> | null = null;

const getPublishableKey = async (): Promise<string | null> => {
  if (!publishableKeyPromise) {
    publishableKeyPromise = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-stripe-key");
        if (error || !data?.publishableKey) return null;
        return data.publishableKey as string;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[stripe] failed to fetch publishable key:", e);
        return null;
      }
    })();
  }
  return publishableKeyPromise;
};

/**
 * Returns the cached Stripe.js promise, loading it lazily on first
 * call. Resolves to `null` if the publishable key cannot be fetched
 * (callers should treat null as "Stripe unavailable" and surface a
 * friendly error rather than crashing).
 */
export const getStripe = (): Promise<StripeJs | null> => {
  if (!stripePromise) {
    stripePromise = (async () => {
      const key = await getPublishableKey();
      if (!key) return null;
      return loadStripe(key);
    })();
  }
  return stripePromise;
};

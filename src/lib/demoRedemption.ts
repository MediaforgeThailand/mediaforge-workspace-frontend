import { supabase } from "@/integrations/supabase/client";

interface RedeemDemoCreditsParams {
  token: string;
  userId: string;
  userEmail?: string | null;
  creditsHint?: string | number | null;
}

interface RedeemDemoCreditsResponse {
  success?: boolean;
  error?: string;
  credits?: number;
  already_redeemed?: boolean;
  repaired_link?: boolean;
}

let activeDemoRedemptionToken: string | null = null;

const parseCreditsHint = (creditsHint?: string | number | null) => {
  const parsedCredits = typeof creditsHint === "string" ? Number(creditsHint) : Number(creditsHint ?? 0);
  return Number.isFinite(parsedCredits) ? parsedCredits : 0;
};

export const getStoredDemoRedemption = () => ({
  token: localStorage.getItem("demo_token"),
  credits: localStorage.getItem("demo_credits"),
});

export const clearStoredDemoRedemption = () => {
  localStorage.removeItem("demo_token");
  localStorage.removeItem("demo_credits");
};

export const beginDemoRedemption = (token: string) => {
  if (!token || activeDemoRedemptionToken === token) {
    return false;
  }

  activeDemoRedemptionToken = token;
  return true;
};

export const endDemoRedemption = (token?: string | null) => {
  if (!token || activeDemoRedemptionToken === token) {
    activeDemoRedemptionToken = null;
  }
};

/**
 * Calls the local redeem-demo edge function.
 * The server handles credit grant via Service Role Key + grant_credits RPC.
 */
export const redeemDemoCredits = async ({
  token,
  userId,
  userEmail,
  creditsHint,
}: RedeemDemoCreditsParams) => {
  const parsedCreditsHint = parseCreditsHint(creditsHint);
  const normalizedToken = token?.trim();

  if (!normalizedToken) {
    throw new Error("Demo token not found");
  }

  // Ensure the Supabase client has the current JWT before making the RPC call
  await supabase.auth.getSession();

  const { data, error } = await supabase.rpc("redeem_demo_link", {
    p_token: normalizedToken,
  });

  const rpcData = data && typeof data === "object" && !Array.isArray(data)
    ? (data as RedeemDemoCreditsResponse)
    : null;

  if (error) {
    throw new Error(error.message || "Unable to redeem credits from Demo link");
  }

  if (rpcData?.error) {
    throw new Error(rpcData.error);
  }

  const creditsAmount = Number(rpcData?.credits ?? parsedCreditsHint ?? 0);

  if (!Number.isFinite(creditsAmount) || creditsAmount <= 0) {
    throw new Error("Invalid credit amount from Demo link");
  }

  return {
    credits: creditsAmount,
    alreadyRedeemed: Boolean(rpcData?.already_redeemed),
    repairedLink: Boolean(rpcData?.repaired_link),
    data: rpcData ?? data,
  };
};

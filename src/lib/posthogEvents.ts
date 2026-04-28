import { posthog } from "./posthog";

// Flow Studio
export const phFlowCreated = (flowId: string, name: string, isOfficial?: boolean) =>
  posthog.capture("flow_created", { flow_id: flowId, flow_name: name, is_official: isOfficial ?? false });

export const phFlowPublished = (flowId: string, name: string, isOfficial?: boolean) =>
  posthog.capture("flow_published", { flow_id: flowId, flow_name: name, is_official: isOfficial ?? false });

export const phNodeAdded = (flowId: string, nodeType: string) =>
  posthog.capture("node_added", { flow_id: flowId, node_type: nodeType });

// PlayFlow execution
export const phFlowExecuted = (flowId: string, props: { flow_name?: string; node_count?: number; cost_credits?: number; provider?: string }) =>
  posthog.capture("flow_executed", { flow_id: flowId, ...props });

// Generation results
export const phImageGenerated = (props: { flow_id: string; provider: string; duration_ms?: number }) =>
  posthog.capture("image_generated", props);

export const phVideoGenerated = (props: { flow_id: string; provider: string; duration_ms?: number }) =>
  posthog.capture("video_generated", props);

// Credits & payments
export const phCreditsPurchased = (props: { amount_thb: number; credits: number; payment_method: string }) =>
  posthog.capture("credits_purchased", props);

export const phSubscriptionStarted = (props: { plan: string; interval: string }) =>
  posthog.capture("subscription_started", props);

// Stock library
export const phStockDownloaded = (props: { resource_id: string; source: string }) =>
  posthog.capture("stock_downloaded", props);

// Submit for review
export const phFlowSubmittedForReview = (flowId: string, isOfficial?: boolean) =>
  posthog.capture("flow_submitted_for_review", { flow_id: flowId, is_official: isOfficial ?? false });

// Flow execution outcomes
export const phFlowRunCompleted = (props: { flow_id: string; run_id: string; duration_ms?: number; output_type?: string }) =>
  posthog.capture("flow_run_completed", props);

export const phFlowRunFailed = (props: { flow_id: string; run_id: string; error: string; refunded: boolean }) =>
  posthog.capture("flow_run_failed", props);

// Credit signals
export const phCreditBalanceZero = () =>
  posthog.capture("credit_balance_zero");

export const phCheckoutAbandoned = (props: { source: string }) =>
  posthog.capture("checkout_abandoned", props);

// Landing & onboarding
export const phLandingCtaClicked = (cta: string) =>
  posthog.capture("landing_cta_clicked", { cta });

// Flow Studio engagement
export const phFlowStudioSession = (props: { flow_id: string; duration_ms: number; node_count: number; is_official?: boolean }) =>
  posthog.capture("flow_studio_session", { ...props, is_official: props.is_official ?? false });

// Asset & stock
export const phAssetDownloaded = (props: { asset_type: string; flow_id?: string }) =>
  posthog.capture("asset_downloaded", props);

export const phStockSearched = (props: { query: string; type: string; results_count: number }) =>
  posthog.capture("stock_searched", props);

// Consent
export const phCookieConsentDeclined = () =>
  posthog.capture("cookie_consent_declined");

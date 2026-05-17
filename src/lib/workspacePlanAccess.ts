export type WorkspacePaidFeature = "image" | "video" | "upscale";

export type WorkspacePlanProfile = {
  plan_name?: string | null;
  subscription_status?: string | null;
  current_plan_id?: string | null;
  subscription_plan_id?: string | null;
  /** Staff/owner accounts (admin row in `user_roles`) bypass the Free
   *  plan paywall regardless of `plan_name`. Set by AuthContext. */
  is_admin?: boolean | null;
} | null | undefined;

const FREE_BLOCKED_STANDALONE_TOOLS = new Set([
  "image_gen",
  "video_gen",
  "image_upscale",
]);

const FREE_BLOCKED_NODE_TYPES = new Set([
  "bananaProNode",
  "imageGenNode",
  "klingVideoNode",
  "videoGenNode",
  "upscaleImageNode",
]);

export function isWorkspaceFreePlan(profile: WorkspacePlanProfile): boolean {
  if (profile?.is_admin) return false;
  const planName = String(profile?.plan_name ?? "").trim().toLowerCase();
  const status = String(profile?.subscription_status ?? "").trim().toLowerCase();
  if (planName) return planName === "free";
  if (profile?.subscription_plan_id || profile?.current_plan_id) return false;
  return status === "free" || status === "trialing_free" || !status;
}

export function freePlanBlockedFeatureForStandaloneTool(tool: string): WorkspacePaidFeature | null {
  if (!FREE_BLOCKED_STANDALONE_TOOLS.has(tool)) return null;
  if (tool === "video_gen") return "video";
  if (tool === "image_upscale") return "upscale";
  return "image";
}

export function freePlanBlockedFeatureForNodeType(nodeType: string): WorkspacePaidFeature | null {
  if (!FREE_BLOCKED_NODE_TYPES.has(nodeType)) return null;
  if (nodeType === "klingVideoNode" || nodeType === "videoGenNode") return "video";
  if (nodeType === "upscaleImageNode") return "upscale";
  return "image";
}

export function featureLabelForPlanLock(feature: WorkspacePaidFeature | null | undefined): string {
  switch (feature) {
    case "video":
      return "Video generation";
    case "upscale":
      return "Upscale";
    case "image":
      return "Image generation";
    default:
      return "This feature";
  }
}

/**
 * useShareTokenResolution — runs on the canvas page before any
 * canvas hydration. Detects `?share=<token>` in the URL, resolves
 * it via the workspace_share_resolve edge function, and pushes the
 * resulting role into the global useWorkspaceShareRole store.
 *
 * Behaviours:
 *   • No `?share=` param            → role stays "owner" (default).
 *   • Token present, user signed-out → redirects to
 *     /auth?redirect=<current-url> (preserves the share token so
 *     they re-enter as a viewer/editor after sign-in).
 *   • Token present, user signed-in → calls the resolve function.
 *       valid:true   → setShare(role, ownerLabel, …)
 *       valid:false  → returns the failure reason; the caller
 *                       renders an error card instead of the canvas.
 *
 * Returns a small status object the page can branch on.
 */

import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  useWorkspaceShareRole,
  type WorkspaceShareRole,
} from "@/store/useWorkspaceShareRole";

export type ShareResolutionStatus =
  | { phase: "no-token" }
  | { phase: "redirecting" }
  | { phase: "resolving" }
  | { phase: "ok"; role: WorkspaceShareRole; ownerLabel: string }
  | { phase: "error"; reason: "expired" | "revoked" | "invalid" | "network" };

export function useShareTokenResolution(): ShareResolutionStatus {
  const { workspaceId: routeId } = useParams<{ workspaceId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const setShare = useWorkspaceShareRole((s) => s.setShare);
  const clearShare = useWorkspaceShareRole((s) => s.clear);

  const [status, setStatus] = useState<ShareResolutionStatus>({
    phase: "no-token",
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("share");

    // No share token → not a share session. Make sure the global
    // role store is reset (in case the user navigated here from
    // another workspace where they were a viewer/editor).
    if (!token || !routeId) {
      clearShare();
      setStatus({ phase: "no-token" });
      return;
    }

    // Wait for auth to finish loading before deciding what to do.
    if (authLoading) return;

    // Token present, user not signed-in → bounce to /auth with the
    // FULL current URL (path + token query) preserved so re-entry
    // lands them right back here as the visiting role.
    if (!user?.id) {
      const current = location.pathname + location.search;
      navigate(`/auth?redirect=${encodeURIComponent(current)}`, {
        replace: true,
      });
      setStatus({ phase: "redirecting" });
      return;
    }

    // Signed in → resolve.
    setStatus({ phase: "resolving" });
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<{
          valid: boolean;
          reason?: "expired" | "revoked" | "invalid";
          role?: "viewer" | "editor";
          ownerLabel?: string;
          shareId?: string;
        }>("workspace_share_resolve", {
          body: { workspace_id: routeId, token },
        });
        if (cancelled) return;

        if (error || !data) {
          console.error("[share-resolution] network failure:", error);
          setStatus({ phase: "error", reason: "network" });
          return;
        }

        if (!data.valid) {
          setStatus({
            phase: "error",
            reason: (data.reason ?? "invalid") as "expired" | "revoked" | "invalid",
          });
          return;
        }

        if (data.role && (data.role === "viewer" || data.role === "editor")) {
          setShare({
            role: data.role,
            ownerLabel: data.ownerLabel ?? "Workspace owner",
            workspaceId: routeId,
            shareId: data.shareId ?? null,
          });
          setStatus({
            phase: "ok",
            role: data.role,
            ownerLabel: data.ownerLabel ?? "Workspace owner",
          });
        } else {
          setStatus({ phase: "error", reason: "invalid" });
        }
      } catch (err) {
        console.error("[share-resolution] unexpected error:", err);
        if (!cancelled) setStatus({ phase: "error", reason: "network" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    routeId,
    location.search,
    location.pathname,
    user?.id,
    authLoading,
    navigate,
    setShare,
    clearShare,
  ]);

  // Reset the share role on unmount so navigating away from this
  // canvas page wipes any viewer/editor role.
  useEffect(() => {
    return () => {
      clearShare();
    };
  }, [clearShare]);

  return status;
}

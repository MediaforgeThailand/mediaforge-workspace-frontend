/**
 * Canvas-page top header — solid-black breadcrumb bar.
 *
 * Sits above WorkspaceTabBar on the canvas page. Shape mirrors the
 * Magnific reference the team sent over:
 *
 *   ◀  [project chip]  >  Untitled Space            [ Share ] [👤]
 *
 * Left:
 *   • Back arrow → /app/workspace (dashboard)
 *   • Project chip — coloured square + name. Until the projects
 *     feature actually lands (the dashboard sidebar still shows
 *     "Projects (mockup)") this defaults to a "Personal" chip with
 *     the workspace owner's initial colour. When workspace.team_id
 *     gets a real value this resolves to the team's project label.
 *   • ">" + the workspace name in subtly-italic style
 *
 * Right:
 *   • Share — stub button (Wave 4 will hook into team_members /
 *     SSO orgs for actual share modal). Stays clickable so the
 *     affordance is visible; clicking just toasts "coming soon".
 *   • UserMenu (Settings / Usage / Pricing / Theme / Sign out)
 *
 * Background is solid hsl(0 0% 4%) — no backdrop blur — to match
 * the reference. The tab bar below uses the same tone so the two
 * rows read as one continuous header.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Users, Layers } from "lucide-react";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useWorkspaceShareRole } from "@/store/useWorkspaceShareRole";
import { useLanguage } from "@/contexts/LanguageContext";
import { UserMenu } from "@/components/workspace/UserMenu";
import ShareDialog from "@/components/workspace/ShareDialog";
import { useAuth } from "@/contexts/AuthContext";
import { CollaborationPresencePill } from "@/components/workspace/CanvasCollaborationOverlay";

const CanvasHeader = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const currentWorkspaceId = useWorkspaceStore(
    (s) => s.current?.workspaceId ?? null,
  );
  const workspace = useWorkspaceStore((s) =>
    currentWorkspaceId
      ? s.workspaces.find((w) => w.id === currentWorkspaceId) ?? null
      : null,
  );
  // Only owners can mint share links. Visitors who arrived via a
  // viewer/editor token shouldn't see the Share button — they
  // can't (and shouldn't be able to) re-share someone else's space.
  const shareRole = useWorkspaceShareRole((s) => s.role);
  // Hidden until the back-end ships. The audit found that Share
  // calls `workspace_share_create` / `workspace_share_list` edge
  // functions that don't exist in the backend repo — so clicking
  // Share returned an error toast and made the product look
  // half-built. Hide until the workspace_shares migration + edge
  // functions land. Re-enable by setting SHARE_FEATURE_ENABLED=true
  // (or flipping this constant) once the backend is in place.
  const SHARE_FEATURE_ENABLED = true;
  const canShare =
    SHARE_FEATURE_ENABLED &&
    shareRole === "owner" &&
    !!currentWorkspaceId &&
    (!workspace?.ownerId || workspace.ownerId === user?.id);
  const [shareOpen, setShareOpen] = useState(false);

  const projectLabel = t("workspace.canvas.personal");
  const projectAccent = "hsl(35 90% 55%)"; // matches the Personal colour swatch on the dashboard

  return (
    <div
      className="relative z-[80] flex h-[46px] shrink-0 items-center justify-between gap-[12px] bg-[hsl(0_0%_4%)] px-[16px]"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* Left — back arrow + breadcrumb */}
      <div className="flex min-w-0 flex-1 items-center gap-[9px]">
        <Link
          to="/app/workspace"
          className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-100"
          title={t("workspace.canvas.back_dashboard")}
          aria-label={t("workspace.canvas.back_dashboard")}
        >
          <ChevronLeft className="h-[17px] w-[17px]" />
        </Link>

        {/* Project chip — coloured square + label */}
        <button
          type="button"
          className="flex h-[35px] shrink-0 items-center gap-[7px] rounded-md px-[9px] text-[14px] leading-[18px] text-zinc-200 transition-colors hover:bg-white/[0.04]"
          title={t("workspace.canvas.project_tooltip", { name: projectLabel })}
        >
          <span
            className="flex h-[25px] w-[25px] items-center justify-center rounded-[6px]"
            style={{ background: projectAccent }}
          >
            <Layers className="h-[15px] w-[15px] text-zinc-950" />
          </span>
          <span className="font-medium">{projectLabel}</span>
        </button>

        <ChevronRight className="h-[15px] w-[15px] shrink-0 text-zinc-600" />

        {/* Workspace name — slightly italic + soft glyph to read as
         *  "the document title", consistent with Figma/Notion patterns. */}
        <span className="min-w-0 truncate text-[14px] leading-[18px] italic text-zinc-300">
          {workspace?.name || t("workspace.canvas.untitled_space")}
        </span>
      </div>

      {/* Right — Share + UserMenu */}
      <div className="fixed right-[16px] top-[2px] z-[95] flex shrink-0 items-center gap-[9px]">
        <CollaborationPresencePill />
        {canShare && (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="flex h-[30px] items-center gap-[6px] rounded-lg bg-white px-[11px] text-[12px] font-semibold leading-[15px] text-zinc-900 shadow-[0_8px_18px_rgba(0,0,0,0.24)] transition-colors hover:bg-zinc-200"
            title={t("workspace.canvas.share_workspace")}
          >
            <Users className="h-[14px] w-[14px]" />
            {t("workspace.canvas.share")}
          </button>
        )}
        <UserMenu compact />
      </div>

      {canShare && currentWorkspaceId && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          workspaceId={currentWorkspaceId}
          workspaceName={workspace?.name ?? ""}
        />
      )}
    </div>
  );
};

export default CanvasHeader;

/**
 * Canvas-page top header — solid-black breadcrumb bar.
 *
 * Sits above WorkspaceCanvasPagePill on the canvas page. Shape mirrors the
 * Magnific reference the team sent over:
 *
 *   ◀  [project chip]  >  Untitled Space            [ Share ] [👤]
 *
 * Left:
 *   • Back arrow → /app/workspace?section=spaces (space picker)
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
 *   • Presence / sharing controls
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
import ShareDialog from "@/components/workspace/ShareDialog";
import { useAuth } from "@/contexts/AuthContext";
import OrgCreditBadge from "@/components/OrgCreditBadge";

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
      className="relative z-[80] flex h-[44px] shrink-0 items-center justify-between gap-[11px] border-b border-white/[0.07] bg-[#050606] px-[12px] shadow-[0_14px_34px_-24px_rgba(0,0,0,0.92)]"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* Left — back arrow + breadcrumb */}
      <div className="flex min-w-0 flex-1 items-center gap-[8px]">
        <Link
          to="/app/workspace?section=spaces"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-zinc-100"
          title={t("workspace.canvas.backToWorkspaces")}
          aria-label={t("workspace.canvas.backToWorkspaces")}
        >
          <ChevronLeft className="h-[16px] w-[16px]" />
        </Link>

        {/* Project chip — coloured square + label */}
        <button
          type="button"
          className="flex h-[30px] shrink-0 items-center gap-[7px] rounded-[8px] px-[8px] text-[14px] leading-[18px] text-zinc-100 transition-colors hover:bg-white/[0.055]"
          title={t("workspace.canvas.project_tooltip", { name: projectLabel })}
        >
          <span
            className="flex h-[23px] w-[23px] items-center justify-center rounded-[6px]"
            style={{ background: projectAccent }}
          >
            <Layers className="h-[14px] w-[14px] text-zinc-950" />
          </span>
          <span className="font-medium">{projectLabel}</span>
        </button>

        <ChevronRight className="h-[14px] w-[14px] shrink-0 text-zinc-600" />

        {/* Workspace name — slightly italic + soft glyph to read as
         *  "the document title", consistent with Figma/Notion patterns. */}
        <span className="min-w-0 truncate text-[14px] font-semibold leading-[18px] text-zinc-100">
          {workspace?.name || t("workspace.canvas.untitled_space")}
        </span>
      </div>

      {/* Right — share and workspace presence controls. Account lives
       *  in the workspace sidebar, matching the redesigned app shell. */}
      <div className="flex shrink-0 items-center gap-[10px]">
        <OrgCreditBadge
          variant="pill"
          workspaceId={currentWorkspaceId}
          className="hidden h-[30px] md:inline-flex"
        />
        {canShare && (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="flex h-[34px] items-center gap-[7px] rounded-full bg-white px-[14px] text-[14px] font-semibold leading-[17px] text-zinc-900 shadow-[0_8px_18px_rgba(0,0,0,0.24)] transition-colors hover:bg-zinc-200"
            title={t("workspace.canvas.share_workspace")}
          >
            <Users className="h-[16px] w-[16px]" />
            {t("workspace.canvas.share")}
          </button>
        )}
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

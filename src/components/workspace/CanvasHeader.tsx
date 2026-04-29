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
import { UserMenu } from "@/components/workspace/UserMenu";
import ShareDialog from "@/components/workspace/ShareDialog";

const CanvasHeader = () => {
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
  const canShare = shareRole === "owner" && !!currentWorkspaceId;
  const [shareOpen, setShareOpen] = useState(false);

  const projectLabel = "Personal";
  const projectAccent = "hsl(35 90% 55%)"; // matches the Personal colour swatch on the dashboard

  return (
    <div
      className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-white/[0.04] bg-[hsl(0_0%_4%)] px-3"
      style={{ fontFamily: "'Prompt', system-ui, sans-serif" }}
    >
      {/* Left — back arrow + breadcrumb */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link
          to="/app/workspace"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-100"
          title="Back to dashboard"
          aria-label="Back to dashboard"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>

        {/* Project chip — coloured square + label */}
        <button
          type="button"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[12.5px] text-zinc-200 transition-colors hover:bg-white/[0.04]"
          title={`Project: ${projectLabel} (mockup)`}
        >
          <span
            className="flex h-5 w-5 items-center justify-center rounded-[5px]"
            style={{ background: projectAccent }}
          >
            <Layers className="h-3 w-3 text-zinc-950" />
          </span>
          <span className="font-medium">{projectLabel}</span>
        </button>

        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" />

        {/* Workspace name — slightly italic + soft glyph to read as
         *  "the document title", consistent with Figma/Notion patterns. */}
        <span className="min-w-0 truncate text-[12.5px] italic text-zinc-300">
          {workspace?.name || "Untitled space"}
        </span>
      </div>

      {/* Right — Share + UserMenu */}
      <div className="flex shrink-0 items-center gap-2">
        {canShare && (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-[12px] font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
            title="Share workspace"
          >
            <Users className="h-3.5 w-3.5" />
            Share
          </button>
        )}
        <UserMenu />
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

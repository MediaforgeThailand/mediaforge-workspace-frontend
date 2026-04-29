/**
 * Workspace page shell — sidebar only, no Account header chrome.
 *
 * For surfaces that want the workspace sidebar but own their full
 * content area (no breadcrumb header, no max-width). Currently used
 * by /app/pricing, which renders its own hero + cards layout and
 * shouldn't be squeezed inside AccountShell's `max-w-5xl` wrapper.
 *
 * Renders an `<Outlet />` by default for nested routes; pass
 * `children` to opt out (handy when mounting directly without a
 * nested route — see App.tsx).
 */

import { type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar";

export default function WorkspacePageShell({
  children,
  hideSidebarBelowLg = false,
}: {
  children?: ReactNode;
  hideSidebarBelowLg?: boolean;
}) {
  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-[hsl(0_0%_5%)] text-zinc-100"
      style={{ fontFamily: "'Prompt', system-ui, sans-serif" }}
    >
      {/* No `active` — this shell is used for surfaces that aren't
       *  one of the tagged sections (Home/Spaces/etc). */}
      <div className={hideSidebarBelowLg ? "hidden h-full lg:block" : "h-full"}>
        <WorkspaceSidebar />
      </div>

      <main className="ws-scroll-hide min-w-0 flex-1 overflow-y-auto bg-[hsl(0_0%_5%)]">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}

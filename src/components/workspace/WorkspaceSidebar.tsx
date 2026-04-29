/**
 * Workspace sidebar — shared chrome for the dashboard, account pages,
 * and any other surface that wants the workspace shell.
 *
 * Behaviour:
 *  • If `onNavigate` is provided, clicks call it with the section key.
 *    The dashboard uses this to drive its own internal section state
 *    without round-tripping through the URL.
 *  • If `onNavigate` is omitted, clicks router-navigate to
 *    `/app/workspace?section=<id>`. The dashboard reads that param on
 *    mount, so jumping in from /app/settings (or /app/pricing) lands
 *    on the correct section.
 *
 * The sidebar is intentionally dumb about routing — it doesn't know
 * which page it's on. Pass `active` to highlight a section.
 */
import {
  Home as HomeIcon,
  Workflow,
  Globe,
  FolderKanban,
  Boxes,
  Library,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export type SectionKey =
  | "home"
  | "spaces"
  | "community"
  | "projects"
  | "tools"
  | "stock";

const NAV_TOP: Array<{ id: SectionKey; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "spaces", label: "Spaces", icon: Workflow },
  { id: "community", label: "Community", icon: Globe },
  { id: "projects", label: "Projects", icon: FolderKanban },
];

const NAV_BOTTOM: Array<{ id: SectionKey; label: string; icon: LucideIcon }> = [
  { id: "tools", label: "All tools", icon: Boxes },
  { id: "stock", label: "Stock", icon: Library },
];

export interface WorkspaceSidebarProps {
  /** Highlighted section. Pass undefined when the current surface
   *  isn't one of the sidebar sections (e.g. /app/pricing). */
  active?: SectionKey;
  /** When provided, sidebar clicks call this instead of router-
   *  navigating. The dashboard uses this to drive internal state. */
  onNavigate?: (s: SectionKey) => void;
}

export default function WorkspaceSidebar({
  active,
  onNavigate,
}: WorkspaceSidebarProps) {
  const navigate = useNavigate();

  const handleClick = (s: SectionKey) => {
    if (onNavigate) {
      onNavigate(s);
    } else {
      navigate(`/app/workspace?section=${s}`);
    }
  };

  return (
    <aside className="flex h-full w-[228px] shrink-0 flex-col border-r border-white/5 bg-[hsl(0_0%_4%)]">
      {/* Brand row — clicking the wordmark always returns to the
       *  dashboard regardless of `onNavigate`. Account/Pricing pages
       *  expect this; the dashboard already highlights Home so the
       *  side-effect of clicking it from there is harmless. */}
      <div className="flex h-12 items-center justify-between px-4">
        <button
          type="button"
          onClick={() => navigate("/app/workspace")}
          className="flex items-center gap-2 text-[13.5px] font-semibold tracking-tight text-zinc-50 transition-colors hover:text-white"
        >
          {/* Mascot logo replaces the older gradient "M" tile. The
           *  cat face was supplied by design; sits in /public so
           *  Vite serves it at /mascot-logo.png without bundling.
           *  Slightly larger (h-7 w-7) than the old square because
           *  the rendered cat reads small at 24 px. */}
          {/* Logo size bumped 20% (h-7 → h-[34px]) per design ask. The
           *  brand chip needs to read at a glance against the sidebar
           *  text; 28 px felt undersized once the cat PNG replaced
           *  the gradient "M" tile. */}
          <img
            src="/mascot-logo.png"
            alt=""
            className="h-[34px] w-[34px] shrink-0 select-none"
            draggable={false}
          />
          Workspace
        </button>
      </div>

      {/* Top group — primary surfaces */}
      <nav className="flex flex-col gap-0.5 px-3 pt-2 pb-1">
        {NAV_TOP.map((it) => (
          <NavLink
            key={it.id}
            label={it.label}
            icon={it.icon}
            active={active === it.id}
            onClick={() => handleClick(it.id)}
          />
        ))}
      </nav>

      <div className="mx-4 my-3 h-px bg-white/[0.06]" />

      {/* Bottom group — utility surfaces */}
      <nav className="flex flex-col gap-0.5 px-3">
        {NAV_BOTTOM.map((it) => (
          <NavLink
            key={it.id}
            label={it.label}
            icon={it.icon}
            active={active === it.id}
            onClick={() => handleClick(it.id)}
          />
        ))}
      </nav>

      <div className="mt-auto px-4 py-3 text-[10.5px] text-zinc-600">
        v1.5 · workspace
      </div>
    </aside>
  );
}

const NavLink = ({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] transition-colors",
      active
        ? "bg-white/[0.07] text-zinc-50 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.05)]"
        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
    )}
  >
    <Icon className="h-3.5 w-3.5" />
    {label}
  </button>
);

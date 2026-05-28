import { Menu } from "lucide-react";

type WorkspaceTopBarProps = {
  title: string;
  onOpenSidebar?: () => void;
};

export default function WorkspaceTopBar({
  title,
  onOpenSidebar,
}: WorkspaceTopBarProps) {
  return (
    <header className="mf-workspace-topbar">
      {onOpenSidebar && (
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open workspace menu"
          className="mf-home-mobile-menu"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>
      )}
      <h1 className="mf-workspace-topbar-title">{title}</h1>
    </header>
  );
}

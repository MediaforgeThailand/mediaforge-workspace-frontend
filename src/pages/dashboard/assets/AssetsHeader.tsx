import { Search, Grid3x3, List, Columns, Kanban, Sliders } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ViewMode } from "./types";

interface Props {
  total: number;
  filtered: number;
  search: string;
  setSearch: (v: string) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
}

const VIEWS: { key: ViewMode; label: string; Icon: any }[] = [
  { key: "grid", label: "Grid view", Icon: Grid3x3 },
  { key: "list", label: "List view", Icon: List },
  { key: "masonry", label: "Masonry view", Icon: Columns },
  { key: "kanban", label: "Kanban view", Icon: Kanban },
];

export const AssetsHeader = ({
  total,
  filtered,
  search,
  setSearch,
  viewMode,
  setViewMode,
}: Props) => {
  return (
    <div>
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] leading-[1.1] font-bold tracking-tight text-foreground">
            My Assets
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {filtered === total
              ? `${total} files generated across your workspace`
              : `${filtered} of ${total} files shown`}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 flex-wrap">
        {/* search */}
        <div className="relative flex-1 min-w-[260px] max-w-[420px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets…"
            className="h-9 pl-9 pr-14 bg-card/70 border-strong text-[13px] placeholder:text-muted-foreground/60 focus-visible:ring-primary/40"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground border border-strong px-1.5 py-0.5 rounded bg-card/70 hidden sm:inline">
            ⌘K
          </kbd>
        </div>

        <div className="flex-1" />

        {/* view switcher */}
        <div className="flex items-center p-0.5 rounded-lg bg-card/70 border border-strong">
          {VIEWS.map((v) => {
            const Ic = v.Icon;
            const active = viewMode === v.key;
            return (
              <button
                key={v.key}
                onClick={() => setViewMode(v.key)}
                title={v.label}
                className={cn(
                  "h-8 w-8 rounded-md flex items-center justify-center transition",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Ic className="w-[15px] h-[15px]" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

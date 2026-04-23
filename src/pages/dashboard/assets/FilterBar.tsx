import { useState, useRef, useEffect } from "react";
import {
  Package,
  Image as ImageIcon,
  Film,
  Music,
  Sparkles,
  Calendar,
  ArrowUp,
  ArrowDown,
  Check,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TypeFilter, SourceFilter, TimeFilter } from "./types";

export interface Filters {
  type: TypeFilter;
  source: SourceFilter;
  time: TimeFilter;
  sortAsc: boolean;
}

interface Props {
  filters: Filters;
  setFilters: (f: Filters | ((prev: Filters) => Filters)) => void;
  counts: Record<TypeFilter, number>;
}

interface DropdownOption<K extends string> {
  key: K;
  label: string;
}

function Dropdown<K extends string>({
  label,
  value,
  options,
  onChange,
  Icon,
}: {
  label: string;
  value: K;
  options: DropdownOption<K>[];
  onChange: (k: K) => void;
  Icon?: any;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const selected = options.find((o) => o.key === value)!;
  const isDefault = value === options[0].key;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium transition border",
          isDefault
            ? "text-muted-foreground hover:text-foreground bg-transparent border-transparent hover:bg-card/60 hover:border-strong"
            : "text-primary bg-primary/15 border-primary/40"
        )}
      >
        {Icon && <Icon className="w-3.5 h-3.5" />}
        <span className="text-muted-foreground/70 font-normal">{label}:</span>
        <span>{selected.label}</span>
        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 min-w-[180px] rounded-lg bg-popover border border-strong shadow-xl z-20 py-1 overflow-hidden">
          {options.map((o) => {
            const active = o.key === value;
            return (
              <button
                key={o.key}
                onClick={() => {
                  onChange(o.key);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between px-3 h-8 text-[12px] transition",
                  active
                    ? "text-primary bg-primary/15"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <span>{o.label}</span>
                {active && <Check className="w-3 h-3" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const TYPE_TABS: { key: TypeFilter; label: string; Icon: any }[] = [
  { key: "all", label: "All", Icon: Package },
  { key: "image", label: "Images", Icon: ImageIcon },
  { key: "video", label: "Videos", Icon: Film },
  { key: "audio", label: "Audio", Icon: Music },
];

export const FilterBar = ({ filters, setFilters, counts }: Props) => {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Type tabs — segmented control */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-muted/60 border border-strong">
        {TYPE_TABS.map((t) => {
          const active = filters.type === t.key;
          const Ic = t.Icon;
          return (
            <button
              key={t.key}
              onClick={() => setFilters((f) => ({ ...f, type: t.key }))}
              className={cn(
                "group relative flex items-center gap-2 h-9 px-3.5 rounded-lg text-[13px] font-medium transition",
                active
                  ? "bg-card text-foreground shadow-sm ring-1 ring-[hsl(220_18%_26%)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Ic className="w-3.5 h-3.5" />
              <span>{t.label}</span>
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  active ? "text-primary font-semibold" : "text-muted-foreground/70"
                )}
              >
                {counts[t.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="w-px h-5 bg-[hsl(220_18%_26%)] mx-1" />

      <Dropdown<SourceFilter>
        label="Source"
        value={filters.source}
        Icon={Sparkles}
        onChange={(k) => setFilters((f) => ({ ...f, source: k }))}
        options={[
          { key: "all", label: "All sources" },
          { key: "workflow", label: "Workflow" },
          { key: "image", label: "Image" },
          { key: "video", label: "Video" },
        ]}
      />

      <Dropdown<TimeFilter>
        label="Date"
        value={filters.time}
        Icon={Calendar}
        onChange={(k) => setFilters((f) => ({ ...f, time: k }))}
        options={[
          { key: "all", label: "Any time" },
          { key: "today", label: "Today" },
          { key: "week", label: "This week" },
          { key: "month", label: "This month" },
        ]}
      />

      <div className="flex-1" />

      <button
        onClick={() => setFilters((f) => ({ ...f, sortAsc: !f.sortAsc }))}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-card/60 transition"
      >
        {filters.sortAsc ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
        {filters.sortAsc ? "Oldest first" : "Newest first"}
      </button>
    </div>
  );
};

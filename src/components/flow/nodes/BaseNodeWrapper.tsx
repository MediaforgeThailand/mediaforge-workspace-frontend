/**
 * BaseNodeWrapper — Universal shell for ALL flow nodes.
 * Test2 redesign: glassmorphic surface, accent-tinted border on select,
 * ringed ports, header w/ icon + title + credit + category pill, optional footer.
 *
 * Composition:
 *   <NodeHeader/>  ← icon · title · credit · category
 *   <NodePorts/>   ← grid of ringed ports w/ uppercase labels
 *   <children/>    ← scrollable param area (consumer-supplied)
 *   <NodeFooter/>  ← left/right mono labels (e.g. "3 params exposed", model slug)
 */
import { memo, useState, useCallback, useRef, type ReactNode } from "react";
import { NodeResizer } from "@xyflow/react";
import { Pencil, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTone, Port, CategoryPill, CreditPill } from "./primitives";

/* ─── Port Definition ─── */
export interface PortDef {
  id: string;
  label: string;
  /** Accent token: violet | sky | amber | cyan | emerald | blue | green | orange | rose */
  color: string;
  /** Optional/unconnected ports look faded */
  dim?: boolean;
}

export interface BaseNodeWrapperProps {
  title: string;
  badge?: string;
  accent: string;
  icon: React.ComponentType<{ className?: string }>;
  inputs?: PortDef[];
  outputs?: PortDef[];
  selected?: boolean;
  minWidth?: number;
  minHeight?: number;
  width?: number;
  footerLeft?: string;
  footerRight?: string;
  onTitleChange?: (newTitle: string) => void;
  creditCost?: number | null;
  creditCostLoading?: boolean;
  creditCostSuffix?: string;
  children?: ReactNode;
}

const BaseNodeWrapper = memo(({
  title, badge, accent, icon: Icon,
  inputs = [], outputs = [], selected = false,
  minWidth = 260, minHeight = 120, width,
  footerLeft, footerRight, onTitleChange,
  creditCost, creditCostLoading, creditCostSuffix,
  children,
}: BaseNodeWrapperProps) => {
  const tone = getTone(accent);
  const hasPorts = inputs.length > 0 || outputs.length > 0;

  /* ── Editable title ── */
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const startEditTitle = useCallback(() => {
    if (!onTitleChange) return;
    setDraftTitle(title);
    setIsEditingTitle(true);
    requestAnimationFrame(() => titleInputRef.current?.select());
  }, [onTitleChange, title]);

  const commitTitle = useCallback(() => {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== title) onTitleChange?.(trimmed);
    setIsEditingTitle(false);
  }, [draftTitle, title, onTitleChange]);

  return (
    <div
      className={cn("node-glass flex flex-col overflow-hidden group", selected && "selected")}
      style={{
        width: width ?? minWidth,
        minWidth,
        height: "100%",
        ["--node-accent" as string]: tone.c,
        ["--node-accent-glow" as string]: tone.glow,
      }}
    >
      <NodeResizer
        minWidth={minWidth}
        minHeight={minHeight}
        isVisible={selected}
        lineClassName="!border-[1px]"
        handleClassName="!w-2 !h-2 !bg-white/30 !border-white/40 !rounded-sm"
      />

      {/* ── Header ── */}
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 shrink-0 border-b border-white/[0.05]"
        style={{ background: `linear-gradient(180deg, ${tone.bg} 0%, transparent 100%)` }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${tone.bg}, rgba(0,0,0,0.2))`,
            border: `1px solid ${tone.bd}`,
            color: tone.c,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 12px ${tone.glow}`,
          }}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") setIsEditingTitle(false);
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 bg-transparent text-[13px] font-semibold text-white border-b border-white/20 focus:border-white/50 focus:outline-none nodrag"
              />
            ) : (
              <span
                className={cn(
                  "text-[13px] font-semibold text-white tracking-[-0.005em] truncate leading-tight",
                  onTitleChange && "cursor-text"
                )}
                onDoubleClick={startEditTitle}
              >
                {title}
              </span>
            )}
            {onTitleChange && !isEditingTitle && (
              <Pencil className="w-2.5 h-2.5 text-white/25 shrink-0" />
            )}
            {isEditingTitle && (
              <button
                onClick={(e) => { e.stopPropagation(); commitTitle(); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-4 h-4 flex items-center justify-center text-emerald-400/70 hover:text-emerald-400"
              >
                <Check className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="text-[10px] text-white/40 font-mono mt-0.5 leading-none">
            node · {accent}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {creditCost !== undefined && (
            <CreditPill
              value={creditCost}
              loading={creditCostLoading}
              suffix={creditCostSuffix}
            />
          )}
          {badge && <CategoryPill label={badge} accent={accent} />}
        </div>
      </div>

      {/* ── Ports row ── */}
      {hasPorts && (
        <div className="relative px-3.5 py-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-b border-white/[0.05] bg-white/[0.01] shrink-0">
          {Array.from({ length: Math.max(inputs.length, outputs.length) }).map((_, i) => {
            const inp = inputs[i];
            const out = outputs[i];
            return (
              <div key={i} className="contents">
                <div>
                  {inp && (
                    <Port id={inp.id} label={inp.label} accent={inp.color} side="left" dim={inp.dim} />
                  )}
                </div>
                <div className="flex justify-end">
                  {out && (
                    <Port id={out.id} label={out.label} accent={out.color} side="right" dim={out.dim} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Children (scrollable param body) ── */}
      {children && (
        <div className="px-3.5 py-3 space-y-2.5 flex-1 overflow-y-auto scrollbar-hide">
          {children}
        </div>
      )}

      {/* ── Footer ── */}
      {(footerLeft || footerRight) && (
        <div className="px-3.5 py-2 border-t border-white/[0.05] flex items-center justify-between gap-2.5 shrink-0">
          {footerLeft && (
            <span className="text-[10px] text-white/40 font-mono truncate">{footerLeft}</span>
          )}
          {footerRight && (
            <span className="text-[10px] text-white/55 font-mono truncate">{footerRight}</span>
          )}
        </div>
      )}
    </div>
  );
});

BaseNodeWrapper.displayName = "BaseNodeWrapper";
export default BaseNodeWrapper;

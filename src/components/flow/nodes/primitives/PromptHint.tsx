/**
 * PromptHint — Small mono-typography hint shown under prompt textareas.
 * Indicates @-mention / #-variable shortcuts.
 */
import { memo } from "react";

const PromptHint = memo(() => (
  <div className="flex items-center gap-1.5 mt-1 px-0.5">
    <span className="font-mono text-[9px] tracking-[0.05em] text-white/30">TYPE</span>
    <kbd className="font-mono text-[9px] px-1 rounded bg-blue-400/10 text-blue-300/90 border-0">@</kbd>
    <span className="font-mono text-[9px] tracking-[0.05em] text-white/30">media</span>
    <span className="text-white/20">·</span>
    <kbd className="font-mono text-[9px] px-1 rounded bg-emerald-400/10 text-emerald-300/90 border-0">#</kbd>
    <span className="font-mono text-[9px] tracking-[0.05em] text-white/30">vars</span>
  </div>
));

PromptHint.displayName = "PromptHint";
export default PromptHint;

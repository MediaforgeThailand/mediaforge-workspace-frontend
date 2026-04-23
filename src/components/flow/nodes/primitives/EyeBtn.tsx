/**
 * EyeBtn — Toggle for "exposed to end user" state on a param row.
 * Hidden by default, shown on row hover or when active (amber).
 */
import { memo } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface EyeBtnProps {
  on: boolean;
  onClick: () => void;
  title?: string;
}

const EyeBtn = memo(({ on, onClick, title }: EyeBtnProps) => {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn("fs-eye-btn nodrag", on && "active")}
      title={title ?? (on ? "Exposed to end users — click to hide" : "Hidden — click to expose")}
    >
      {on ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
    </button>
  );
});

EyeBtn.displayName = "EyeBtn";
export default EyeBtn;

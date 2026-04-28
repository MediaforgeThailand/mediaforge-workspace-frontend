/**
 * Port — Ringed circular handle anchored absolutely outside the node edge.
 * Test2 design: ring outside + inner dot, uppercase mono label inside.
 */
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { getTone } from "./accent";
import { portTypeFromHandleId } from "@/components/workspace/workspaceSchema";

interface PortProps {
  id: string;
  label: string;
  accent: string;
  side: "left" | "right";
  /** Faded look for optional/unconnected ports */
  dim?: boolean;
}

const Port = memo(({ id, label, accent, side, dim = false }: PortProps) => {
  const tone = getTone(accent);
  const isRight = side === "right";
  // CSS layer in workspace.css filters handle visibility during a
  // connection drag based on this attribute — image / video / etc.
  const portType = portTypeFromHandleId(id);

  return (
    <div
      className={cn(
        "relative flex items-center gap-2",
        isRight ? "flex-row-reverse pr-3.5" : "pl-3.5"
      )}
    >
      <Handle
        type={isRight ? "source" : "target"}
        position={isRight ? Position.Right : Position.Left}
        id={id}
        data-port-type={portType}
        className={cn(
          // `ws-port-handle` lets the workspace CSS target this style
          // of handle without affecting any other Handle on the page.
          "ws-port-handle",
          "!absolute !top-1/2 !-translate-y-1/2 !w-[14px] !h-[14px] !rounded-full !bg-[#07070a]",
          isRight ? "!-right-[7px]" : "!-left-[7px]"
        )}
        style={{
          borderWidth: 1.5,
          borderStyle: "solid",
          borderColor: tone.c,
          boxShadow: `inset 0 0 0 3px ${tone.c}, 0 0 6px ${tone.c}`,
          opacity: dim ? 0.55 : 1,
        }}
      />
      <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-white/55 font-medium select-none">
        {label}
      </span>
    </div>
  );
});

Port.displayName = "Port";
export default Port;

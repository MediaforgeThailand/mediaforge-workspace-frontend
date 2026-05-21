import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

export interface DrawingNodeData {
  paths?: string[];
  stroke?: string;
  strokeWidth?: number;
  width?: number;
  height?: number;
}

const DrawingNode = memo(({ data, selected }: NodeProps) => {
  const d = data as unknown as DrawingNodeData;
  const width = Math.max(12, d.width ?? 120);
  const height = Math.max(12, d.height ?? 80);
  const stroke = d.stroke ?? "#dfff1f";
  const strokeWidth = d.strokeWidth ?? 4;
  const paths = d.paths?.length ? d.paths : [];

  return (
    <div
      className={cn(
        "relative rounded-[6px]",
        selected && "ring-2 ring-[#dfff1f]/70 ring-offset-2 ring-offset-transparent",
      )}
      style={{ width, height }}
      data-testid="drawing-node"
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible"
        aria-hidden="true"
      >
        {paths.map((path, index) => (
          <path
            key={`${index}-${path.slice(0, 20)}`}
            d={path}
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
});

DrawingNode.displayName = "DrawingNode";
export default DrawingNode;

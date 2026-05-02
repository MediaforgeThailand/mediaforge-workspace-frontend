/**
 * Result bar — sits directly above the node body, visually merged with
 * it via `.workspace-node-merged` CSS (no seam, shared card look).
 *
 * Always renders, with 3 visual states:
 *   - empty        → "Results will appear here" placeholder (like Krea)
 *   - with output  → thumbnail at natural aspect ratio
 *   - multiple     → "n/N" badge + history filmstrip in the expand dialog
 */

import { memo, useState } from "react";
import { Maximize2 } from "lucide-react";
import NodeResultDialog from "./NodeResultDialog";

export interface Generation {
  id: string;
  type: "image" | "video" | "text" | "audio";
  url?: string;
  text?: string;
  /** GLB / GLTF URL — populated by the Image-to-3D (Tripo3D) node so
   *  the preview can render <model-viewer> instead of the rendered
   *  image. `url` still holds the rendered preview thumbnail. */
  model_url?: string;
  createdAt: number;
}

interface Props {
  generations?: Generation[];
  /** Index into generations[] to display as current (default 0 = newest). */
  selectedIndex?: number;
  onSelectIndex?: (i: number) => void;
  /** Match the wrapped node's width so the stack looks unified. */
  width?: number;
}

const EMPTY_MIN_HEIGHT = 140;

const NodeResultBar = memo(
  ({ generations, selectedIndex = 0, onSelectIndex, width = 300 }: Props) => {
    const [expanded, setExpanded] = useState(false);

    const hasGens = !!generations && generations.length > 0;
    const current = hasGens ? (generations![selectedIndex] ?? generations![0]) : null;

    return (
      <>
        <div
          className="node-result-bar overflow-hidden bg-black/70"
          style={{ width, borderRadius: 10 }}
        >
          {current ? (
            <div
              className="group relative cursor-zoom-in"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {current.type === "image" && current.url && (
                <img src={current.url} className="block h-auto w-full" alt="" />
              )}
              {current.type === "video" && current.url && (
                <video
                  src={current.url}
                  muted
                  playsInline
                  className="block h-auto w-full"
                  onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                  onMouseLeave={(e) => {
                    const v = e.target as HTMLVideoElement;
                    v.pause();
                    v.currentTime = 0;
                  }}
                />
              )}
              {current.type === "text" && (
                <div className="max-h-[140px] overflow-y-auto p-3 text-[11px] leading-snug text-white/80">
                  {current.text}
                </div>
              )}
              {current.type === "audio" && current.url && (
                // Audio gen output — render a compact player. Stop
                // click propagation on the controls so the lightbox
                // expand-on-click doesn't fire when the user just
                // wants to scrub or pause.
                <div className="flex items-center justify-center bg-black/60 p-3">
                  <audio
                    src={current.url}
                    controls
                    preload="metadata"
                    className="w-full max-w-[260px]"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                </div>
              )}

              {generations!.length > 1 && (
                <div className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white/80">
                  {selectedIndex + 1}/{generations!.length}
                </div>
              )}
              <div className="absolute right-1.5 top-1.5 rounded bg-black/70 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 className="h-3 w-3 text-white/80" />
              </div>
            </div>
          ) : (
            <div
              className="flex items-center justify-center text-[11px] text-white/30"
              style={{ minHeight: EMPTY_MIN_HEIGHT }}
            >
              Results will appear here
            </div>
          )}
        </div>

        {hasGens && (
          <NodeResultDialog
            open={expanded}
            onOpenChange={setExpanded}
            generations={generations!}
            selectedIndex={selectedIndex}
            onSelect={onSelectIndex}
          />
        )}
      </>
    );
  },
);

NodeResultBar.displayName = "NodeResultBar";
export default NodeResultBar;

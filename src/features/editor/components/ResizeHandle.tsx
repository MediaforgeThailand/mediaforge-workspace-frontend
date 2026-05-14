import React from "react";
import { Separator } from "react-resizable-panels";
import { GripVertical } from "lucide-react";

/**
 * ResizeHandle — vertical divider between horizontal panels in the editor.
 *
 * Wraps react-resizable-panels' `Separator` (v4 API). 6px clickable area
 * with 1px visible default; bg-primary while dragging.
 *
 * Built-in behaviors provided by the library:
 *   - Keyboard a11y: ArrowLeft/Right resize ±10%, Home/End jump to extremes,
 *     Enter/Space activates drag, focus ring via focus-visible.
 *   - Double-click resets the adjacent Panel to its `defaultSize` (set
 *     `disableDoubleClick` to opt out).
 *
 * Styling hook attributes from the library:
 *   - data-separator                  → always present
 *   - data-resize-handle-active       → during active drag (v3 compat alias)
 *   - data-resize-handle-state        → "drag" while dragging, "hover" on hover
 */
interface ResizeHandleProps {
  /** Accessible label, e.g. "Resize library panel" */
  ariaLabel?: string;
  /** id forwarded to react-resizable-panels' Separator */
  id?: string;
  /** When true, double-click won't reset the neighboring Panel */
  disableDoubleClick?: boolean;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  ariaLabel,
  id,
  disableDoubleClick,
}) => {
  return (
    <Separator
      id={id}
      disableDoubleClick={disableDoubleClick}
      aria-label={ariaLabel}
      className="group relative flex w-1.5 cursor-col-resize items-center justify-center bg-border/40 transition-colors duration-150 hover:bg-primary/50 data-[resize-handle-state=drag]:bg-primary data-[resize-handle-active]:bg-primary focus-visible:outline-none focus-visible:bg-primary/70 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
    >
      {/* Grip icon — fades in on hover/drag/focus. Pointer-events disabled so
          clicks pass through to the handle itself. */}
      <GripVertical
        size={12}
        className="pointer-events-none text-text-secondary opacity-0 transition-opacity duration-150 group-hover:opacity-70 group-focus-visible:opacity-100 group-data-[resize-handle-state=drag]:opacity-100 group-data-[resize-handle-active]:opacity-100"
      />
    </Separator>
  );
};

export default ResizeHandle;

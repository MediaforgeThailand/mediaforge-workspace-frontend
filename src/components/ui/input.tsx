import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Input — borderless minimal field.
 *
 * 2026-05 redesign:
 *   • h-10 → h-9 (matches Button default)
 *   • Drop the 1px input border; use the muted (Layer-1) bg fill so
 *     the input reads as a "well" cut into the panel surface.
 *   • Focus state replaces the soft ring with a 1px violet inner
 *     stroke — no more chunky double-ring.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

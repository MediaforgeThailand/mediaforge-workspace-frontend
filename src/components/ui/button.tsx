import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button — Magnific-style minimal palette.
 *
 * 2026-05 redesign:
 *   • Heights tightened: default 36px, sm 32px, lg 40px, xl 44px
 *     (was 40/36/44/56 — the legacy `xl` was as tall as a navbar).
 *   • Default + secondary lose their backdrop-blur + 1px borders;
 *     the box now reads from bg only, matching the Card primitive.
 *   • Gradient keeps a softer glow + drops the hover scale so it
 *     doesn't jiggle inside small dialogs.
 *   • rounded-xl → rounded-lg so the corner radius matches Card +
 *     Input again (the buttons used to look chunkier than every
 *     surface around them).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-white/[0.06] text-foreground hover:bg-white/[0.10]",
        destructive:
          "bg-destructive/20 text-destructive-foreground hover:bg-destructive/30",
        outline:
          "bg-transparent text-foreground hover:bg-white/[0.06]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-white/[0.10]",
        ghost:
          "text-foreground hover:bg-white/[0.06]",
        link: "text-primary underline-offset-4 hover:underline",
        gradient:
          "bg-gradient-to-b from-yellow-300 to-yellow-500 text-black shadow-[0_4px_14px_-4px_rgba(238,255,0,0.55)] hover:from-yellow-200 hover:to-yellow-400",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 rounded-md px-3 text-[13px]",
        lg: "h-10 px-6",
        xl: "h-11 px-8 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

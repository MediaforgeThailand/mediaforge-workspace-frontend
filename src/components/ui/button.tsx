import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97] active:brightness-90",
  {
    variants: {
      variant: {
        default:
          "bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_4px_12px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)] hover:bg-white/[0.14] hover:border-white/[0.2] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_6px_20px_rgba(0,0,0,0.5),0_0_15px_rgba(124,58,237,0.1)]",
        destructive:
          "bg-destructive/20 backdrop-blur-xl border border-destructive/30 text-destructive-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_4px_12px_rgba(239,68,68,0.2)] hover:bg-destructive/30 hover:border-destructive/40 hover:shadow-[0_6px_20px_rgba(239,68,68,0.3)]",
        outline:
          "border border-white/[0.1] bg-transparent backdrop-blur-md text-foreground hover:bg-white/[0.06] hover:border-white/[0.18] hover:shadow-[0_0_12px_rgba(124,58,237,0.08)]",
        secondary:
          "bg-white/[0.06] backdrop-blur-xl border border-white/[0.08] text-secondary-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.3)] hover:bg-white/[0.1] hover:border-white/[0.14]",
        ghost:
          "text-foreground hover:bg-white/[0.06] hover:shadow-[0_0_10px_rgba(124,58,237,0.06)]",
        link: "text-primary underline-offset-4 hover:underline",
        gradient:
          "bg-gradient-to-br from-purple-600/80 to-fuchsia-600/70 backdrop-blur-xl border border-purple-400/20 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_4px_16px_rgba(124,58,237,0.35),0_0_24px_rgba(124,58,237,0.15)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_6px_24px_rgba(124,58,237,0.45),0_0_40px_rgba(124,58,237,0.2)] hover:scale-[1.02]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-xl px-8",
        xl: "h-14 rounded-2xl px-10 text-base",
        icon: "h-10 w-10",
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

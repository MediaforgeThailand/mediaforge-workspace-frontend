import * as React from "react"
import { Button, type ButtonProps } from "./button"
import { cn } from "@/components/openreel-ui/lib/utils"

export interface IconButtonProps extends Omit<ButtonProps, 'children'> {
  icon: React.ElementType
  iconSize?: number
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, iconSize = 14, className, variant = "ghost", size = "icon-xs", title, "aria-label": ariaLabel, ...props }, ref) => {
    // Auto-derive aria-label from title if caller didn't supply one — every
    // icon-only button needs a discernible name for screen readers.
    const accessibleName = ariaLabel ?? title;
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        title={title}
        aria-label={accessibleName}
        className={cn(
          "text-text-secondary hover:text-text-primary hover:bg-background-elevated",
          className
        )}
        {...props}
      >
        <Icon size={iconSize} />
      </Button>
    )
  }
)
IconButton.displayName = "IconButton"

export { IconButton }

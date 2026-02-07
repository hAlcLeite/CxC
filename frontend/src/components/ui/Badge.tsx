import clsx from "clsx";
import type { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "danger" | "muted";
}

export function Badge({
  variant = "default",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 text-xs font-mono font-medium",
        "border-2",
        {
          "border-foreground bg-background text-foreground":
            variant === "default",
          "border-success bg-background text-success": variant === "success",
          "border-danger bg-background text-danger": variant === "danger",
          "border-muted bg-background text-muted": variant === "muted",
        },
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

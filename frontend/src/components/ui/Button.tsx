import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "font-mono font-medium transition-colors",
        "border-2 border-foreground",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        {
          // Variants
          "bg-foreground text-background hover:bg-background hover:text-foreground":
            variant === "primary" && !disabled,
          "bg-background text-foreground hover:bg-foreground hover:text-background":
            variant === "secondary" && !disabled,
          "border-transparent hover:border-foreground":
            variant === "ghost" && !disabled,
        },
        {
          // Sizes
          "px-3 py-1 text-sm": size === "sm",
          "px-4 py-2 text-base": size === "md",
          "px-6 py-3 text-lg": size === "lg",
        },
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

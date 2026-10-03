import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary-500 text-white hover:bg-primary-600 disabled:bg-primary-200",
  secondary: "bg-white text-primary-700 border border-border hover:bg-primary-50",
  ghost: "bg-transparent text-foreground hover:bg-black/[.04]",
  danger: "bg-danger-500 text-white hover:opacity-90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
};

// Exported so a plain <Link> (or any element that isn't a real <button>, e.g. LogoutButton's own
// internal button via its className prop) can read exactly the same variant/size styling instead
// of a parallel, possibly-drifting set of classes — nesting an actual <button> inside the <a> a
// <Link> renders would be invalid, interactive-inside-interactive HTML.
export function buttonClassName(variant: ButtonVariant = "primary", size: ButtonSize = "md", className = ""): string {
  return `inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button disabled={disabled || loading} className={buttonClassName(variant, size, className)} {...props}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

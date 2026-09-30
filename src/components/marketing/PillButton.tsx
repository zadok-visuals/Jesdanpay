import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "secondary" | "onDark";
type Size = "sm" | "md" | "lg";

// primary/secondary mirror src/components/ui/Button.tsx's own variantClasses exactly (same
// rounded-xl shape, same bg/text/hover) so the marketing site and the dashboard share one button
// language instead of two. onDark has no Button.tsx equivalent — Button is never used on a dark
// background in the dashboard — so it keeps its own accent treatment for the marketing tree's one
// dark-band CTA (FinalCta).
const variantClasses: Record<Variant, string> = {
  primary: "bg-primary-500 text-white hover:bg-primary-600",
  secondary: "bg-white text-primary-700 border border-border hover:bg-primary-50",
  onDark: "bg-accent-500 text-primary-900 hover:bg-accent-400",
};

// Matches src/components/ui/Button.tsx's sizeClasses so a "lg" pill button is pixel-identical in
// height/padding to a "lg" dashboard button.
const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
};

export function PillButton({
  href,
  variant = "primary",
  size = "md",
  children,
  className = "",
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </Link>
  );
}

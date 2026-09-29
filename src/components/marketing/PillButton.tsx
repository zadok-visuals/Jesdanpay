import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "secondary" | "onDark";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary-800 text-cream shadow-[0_8px_24px_-8px_rgba(10,46,31,0.55)] hover:bg-primary-900 hover:shadow-[0_10px_30px_-6px_rgba(10,46,31,0.65)]",
  secondary:
    "bg-transparent text-primary-800 border border-primary-800/25 hover:border-primary-800/50 hover:bg-primary-800/5",
  onDark:
    "bg-accent-500 text-primary-900 shadow-[0_8px_24px_-8px_rgba(214,164,25,0.5)] hover:bg-accent-400 hover:shadow-[0_10px_30px_-6px_rgba(214,164,25,0.6)]",
};

// The pill-with-soft-shadow-and-hover-glow button the marketing brief calls for — distinct from
// src/components/ui/Button.tsx (rounded-xl, used across the dashboard's transactional flows),
// which stays untouched since this is a purely visual, marketing-only treatment.
export function PillButton({
  href,
  variant = "primary",
  children,
  className = "",
}: {
  href: string;
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium tracking-wide transition-all duration-300 ${variantClasses[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

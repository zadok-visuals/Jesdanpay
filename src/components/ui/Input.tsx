import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, id, className = "", ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-foreground/80">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`h-11 rounded-xl border border-border bg-white px-3.5 text-sm outline-none transition-colors focus:border-primary-400 ${className}`}
        {...props}
      />
    </div>
  );
}

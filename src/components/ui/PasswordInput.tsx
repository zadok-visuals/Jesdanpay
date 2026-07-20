"use client";

import { useId, useState } from "react";
import type { ChangeEvent, InputHTMLAttributes } from "react";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  showStrength?: boolean;
}

function getStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

const STRENGTH_META = [
  { label: "Very weak", barColor: "bg-danger-500", textColor: "text-danger-500" },
  { label: "Weak", barColor: "bg-danger-500", textColor: "text-danger-500" },
  { label: "Fair", barColor: "bg-warning-500", textColor: "text-warning-500" },
  { label: "Good", barColor: "bg-accent-500", textColor: "text-accent-600" },
  { label: "Strong", barColor: "bg-success-500", textColor: "text-success-500" },
] as const;

export function PasswordInput({
  label,
  id,
  showStrength = false,
  onChange,
  className = "",
  ...props
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState("");

  const strength = getStrength(password);
  const meta = STRENGTH_META[strength];

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setPassword(e.target.value);
    onChange?.(e);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-foreground/80">
          {label}
        </label>
      )}

      <div className="relative">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          onChange={handleChange}
          className={`h-11 w-full rounded-xl border border-border bg-white px-3.5 pr-11 text-sm outline-none transition-colors focus:border-primary-400 ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-foreground/40 hover:text-foreground/70"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>

      {showStrength && password.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < strength ? meta.barColor : "bg-black/[.08]"
                }`}
              />
            ))}
          </div>
          <p className={`text-xs font-medium ${meta.textColor}`}>{meta.label}</p>
        </div>
      )}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-3.22 4.42" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

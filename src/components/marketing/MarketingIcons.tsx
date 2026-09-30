type IconProps = { className?: string };

const base = "h-6 w-6";

// Minimal outline icon set for the marketing site, following the same inline-SVG convention as
// src/components/layout/NavIcons.tsx (24x24 viewBox, currentColor stroke) but at a thinner 1.5
// stroke weight for the more editorial, premium feel the marketing style calls for.
export function BoltIcon({ className = "" }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ScaleIcon({ className = "" }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3v18M8 21h8M5 7l3.5-2L12 7M19 7l-3.5-2L12 7M3 7l2 5-2 .5a3 3 0 0 0 4 0L5 7Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 7l2 5-2 .5a3 3 0 0 1-4 0l2-5.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShieldIcon({ className = "" }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IdCheckIcon({ className = "" }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="8.5" cy="11.5" r="1.75" />
      <path d="M5.5 16c.6-1.6 1.9-2.5 3-2.5s2.4.9 3 2.5" strokeLinecap="round" />
      <path d="M14 10h5M14 13.5h5" strokeLinecap="round" />
    </svg>
  );
}

export function LockIcon({ className = "" }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
    </svg>
  );
}

export function HandshakeIcon({ className = "" }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 11l4-3 4 2 3-2 4 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 8v5l4 3.5a1.6 1.6 0 0 0 2.3-2.2M10 14.5l2.4 2a1.6 1.6 0 0 0 2.3-2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 8v6" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowRightIcon({ className = "" }: IconProps) {
  return (
    <svg className={`h-4 w-4 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 12h15M13 6l7 6-7 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DepositIcon({ className = "" }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 4v12M7 11l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19.5h16" strokeLinecap="round" />
    </svg>
  );
}

export function ConvertIcon({ className = "" }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 8h13M17 8l-3.5-3.5M17 8l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16H7M7 16l3.5-3.5M7 16l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SendIcon({ className = "" }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 3 3 10.5l7.2 2.8L13 20.5 21 3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.2 13.3 21 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GlobeIcon({ className = "" }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" strokeLinecap="round" />
      <path d="M12 3c2.5 2.5 3.8 5.8 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.8-3.8-9S9.5 5.5 12 3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SparkleIcon({ className = "" }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7L19 15Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClockIcon({ className = "" }: IconProps) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

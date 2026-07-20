type PillTone = "success" | "danger" | "warning" | "neutral";

const toneClasses: Record<PillTone, string> = {
  success: "bg-success-50 text-success-500",
  danger: "bg-danger-50 text-danger-500",
  warning: "bg-warning-50 text-warning-500",
  neutral: "bg-black/[.04] text-foreground/70",
};

export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): PillTone {
  switch (status) {
    case "completed":
    case "approved":
      return "success";
    case "failed":
    case "rejected":
      return "danger";
    case "pending":
    case "processing":
      return "warning";
    default:
      return "neutral";
  }
}

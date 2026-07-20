export function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">
        Step {step}/{total}
      </p>
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => i + 1).map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary-500" : "bg-black/[.08]"}`}
          />
        ))}
      </div>
    </div>
  );
}

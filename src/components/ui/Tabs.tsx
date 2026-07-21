"use client";

interface TabsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}

export function Tabs<T extends string>({ options, value, onChange }: TabsProps<T>) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-black/[.04] p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            option === value
              ? "bg-white text-primary-700"
              : "text-foreground/60 hover:text-foreground"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

import { Reveal } from "@/components/marketing/Reveal";

// PLACEHOLDER FIGURES — none of these are real reported numbers. Replace all four with the
// client's confirmed figures before launch.
const STATS = [
  { value: "$18M+", label: "Moved across the corridor" },
  { value: "24,000+", label: "Active users" },
  { value: "4", label: "Corridors supported" },
  { value: "< 2 hrs", label: "Average settlement time" },
];

export function StatsBand() {
  return (
    <section id="stats" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-[32px] border border-primary-900/10 bg-primary-900 px-6 py-16 sm:px-14">
        <Reveal className="grid grid-cols-2 gap-10 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-[family-name:var(--font-serif)] text-3xl text-cream sm:text-4xl">
                {stat.value}
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.15em] text-cream/50 sm:text-sm sm:normal-case sm:tracking-normal">
                {stat.label}
              </p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

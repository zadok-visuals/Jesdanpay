import { Reveal } from "@/components/marketing/Reveal";

const CORRIDORS = [
  { flag: "🇳🇬", code: "NGN", country: "Nigeria" },
  { flag: "🇬🇭", code: "GHS", country: "Ghana" },
  { flag: "🇰🇪", code: "KES", country: "Kenya" },
  { flag: "₮", code: "USDT", country: "Any market" },
  { flag: "🇨🇳", code: "CNY", country: "China" },
];

// Rendered twice back to back and slid left by exactly one copy-width (see .animate-marketing-
// marquee in globals.css) — a standard seamless-loop marquee technique. Replaces the old manual
// overflow-x-auto scroll strip: it never has a "dead end" on mobile and needs no user gesture to
// see every currency.
const LOOPED_CORRIDORS = [...CORRIDORS, ...CORRIDORS];

export function CorridorStrip() {
  return (
    <section id="countries" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary-800/50">
            Every corridor, one wallet
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-serif)] text-3xl text-primary-900 sm:text-4xl">
            Move freely between five currencies
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-10 overflow-hidden">
            <div className="flex w-max animate-marketing-marquee items-center gap-4">
              {LOOPED_CORRIDORS.map((corridor, i) => (
                <div key={`${corridor.code}-${i}`} className="flex shrink-0 items-center gap-4">
                  <div className="flex items-center gap-3 rounded-full border border-primary-800/10 bg-white/70 px-5 py-3 backdrop-blur">
                    <span className="text-xl leading-none">{corridor.flag}</span>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-primary-900">{corridor.code}</p>
                      <p className="text-xs text-primary-900/45">{corridor.country}</p>
                    </div>
                  </div>
                  <span className="text-primary-900/20" aria-hidden="true">
                    ⇄
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

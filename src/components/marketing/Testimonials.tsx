import { Reveal } from "@/components/marketing/Reveal";

// PLACEHOLDER QUOTES — names, roles, and quotes below are invented for layout purposes only.
// Replace all three with real, permissioned customer testimonials before launch.
const TESTIMONIALS = [
  {
    quote:
      "JesDanPay took the guesswork out of paying our suppliers in Guangzhou. What used to take days now takes minutes.",
    name: "Jeffrey Edward",
    role: "Import business owner, Lagos",
  },
  {
    quote:
      "The rate I see is the rate I get. No more surprises once the transfer actually lands.",
    name: "Tonia Philips",
    role: "Trader, Accra",
  },
  {
    quote: "Withdrawals are fast and the verification process was painless from day one.",
    name: "Eze John",
    role: "Entrepreneur, Nigeria",
  },
];

export function Testimonials() {
  return (
    <section id="testimonials" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary-800/50">
            Trusted Across The Continents
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-serif)] text-3xl text-primary-900 sm:text-4xl">
            What Our Customers Say
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name + i} delay={i * 0.1}>
              <div className="flex h-full flex-col justify-between rounded-3xl border border-white/50 bg-white/50 p-8 backdrop-blur-xl">
                <p className="font-[family-name:var(--font-serif)] text-[17px] italic leading-relaxed text-primary-900/80">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-8">
                  <p className="text-sm font-semibold text-primary-900">{t.name}</p>
                  <p className="text-xs text-primary-900/45">{t.role}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

import { Reveal } from "@/components/marketing/Reveal";
import { BoltIcon, ScaleIcon, ShieldIcon, IdCheckIcon } from "@/components/marketing/MarketingIcons";

const FEATURES = [
  {
    icon: BoltIcon,
    title: "Instant deposits",
    body: "Fund your wallet in NGN, GHS, KES, or USDT and see it reflected in seconds, not business days.",
  },
  {
    icon: ScaleIcon,
    title: "Transparent rates",
    body: "See the exact CNY rate before you convert — the rate you're quoted is the rate you get.",
  },
  {
    icon: ShieldIcon,
    title: "Secure withdrawals",
    body: "Every payout is protected by a withdrawal PIN and verified recipient details, every time.",
  },
  {
    icon: IdCheckIcon,
    title: "KYC-verified accounts",
    body: "Individual and business verification keeps the corridor compliant and your funds protected.",
  },
];

export function FeatureCards() {
  return (
    <section id="features" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary-800/50">
            Built for the trade corridor
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-serif)] text-3xl text-primary-900 sm:text-4xl">
            Everything you need to move money with confidence
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className="group h-full rounded-[24px] border border-white/50 bg-white/50 p-8 backdrop-blur-xl transition-all duration-500 hover:-translate-y-1.5 hover:bg-white/70 hover:shadow-[0_30px_60px_-25px_rgba(10,46,31,0.3)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-800/8 text-primary-800 transition-colors duration-500 group-hover:bg-accent-500 group-hover:text-primary-900">
                  <Icon />
                </div>
                <h3 className="mt-6 text-lg font-semibold text-primary-900">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-primary-900/55">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

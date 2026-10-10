import { Reveal } from "@/components/marketing/Reveal";
import { IconMotion } from "@/components/marketing/IconMotion";
import {
  BoltIcon,
  ScaleIcon,
  ShieldIcon,
  IdCheckIcon,
  SparkleIcon,
} from "@/components/marketing/MarketingIcons";

// Each card gets its own light tint pulled from the app's existing primary green / accent gold
// scales (src/app/globals.css) rather than sitting on uniform white — cardBg alternates the two
// families so the grid reads as a set of distinct but harmonious cards. Text stays primary-900 at
// high opacity throughout, which keeps contrast comfortable against every tint here since they're
// all very light (50/100-level) shades.
const FEATURES = [
  {
    icon: BoltIcon,
    title: "Instant deposits",
    body: "Fund your wallet in NGN, KES, or USDT and see it reflected in seconds, not business days. GHS is coming soon.",
    cardBg: "bg-primary-50/70",
    iconBg: "bg-primary-800/10 text-primary-800",
  },
  {
    icon: ScaleIcon,
    title: "Transparent rates",
    body: "See the exact CNY rate before you convert — the rate you're quoted is the rate you get.",
    cardBg: "bg-accent-50/70",
    iconBg: "bg-accent-600/15 text-accent-700",
  },
  {
    icon: ShieldIcon,
    title: "Secure withdrawals",
    body: "Every payout is protected by a withdrawal PIN and verified recipient details, every time.",
    cardBg: "bg-primary-100/45",
    iconBg: "bg-primary-800/12 text-primary-800",
  },
  {
    icon: IdCheckIcon,
    title: "KYC-verified accounts",
    body: "Individual and business verification keeps the corridor compliant and your funds protected.",
    cardBg: "bg-accent-100/40",
    iconBg: "bg-accent-600/18 text-accent-800",
  },
];

export function FeatureCards() {
  return (
    <section id="features" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-xl text-center">
          <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-primary-800/50">
            <SparkleIcon className="h-4 w-4" />
            Built for the trade corridor
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-serif)] text-3xl text-primary-900 sm:text-4xl">
            Everything you need to move money with confidence
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body, cardBg, iconBg }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div
                className={`group h-full rounded-3xl border border-white/50 p-8 backdrop-blur-xl transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_30px_60px_-25px_rgba(10,46,31,0.3)] ${cardBg}`}
              >
                <IconMotion
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors duration-500 group-hover:bg-accent-500 group-hover:text-primary-900 ${iconBg}`}
                >
                  <Icon />
                </IconMotion>
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

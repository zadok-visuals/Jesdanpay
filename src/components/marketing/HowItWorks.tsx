import { Reveal } from "@/components/marketing/Reveal";
import { IconMotion } from "@/components/marketing/IconMotion";
import { DepositIcon, ConvertIcon, SendIcon, ClockIcon } from "@/components/marketing/MarketingIcons";

const STEPS = [
  {
    icon: DepositIcon,
    step: "01",
    title: "Deposit",
    body: "Fund your wallet from a Nigerian, Ghanaian, or Kenyan bank, mobile money, or USDT.",
  },
  {
    icon: ConvertIcon,
    step: "02",
    title: "Convert",
    body: "Exchange into CNY at a transparent, live rate — no guesswork, no hidden fees.",
  },
  {
    icon: SendIcon,
    step: "03",
    title: "Send or withdraw",
    body: "Pay your supplier in China directly, or withdraw back to your local currency anytime.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-xl text-center">
          <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-primary-800/50">
            <ClockIcon className="h-4 w-4" />
            How it works
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-serif)] text-3xl text-primary-900 sm:text-4xl">
            Three steps, start to finish
          </h2>
        </Reveal>

        <div className="relative mt-16 grid gap-10 sm:grid-cols-3 sm:gap-6">
          <div
            className="absolute left-0 right-0 top-9 hidden border-t border-dashed border-primary-800/20 sm:block"
            aria-hidden="true"
          />

          {STEPS.map(({ icon: Icon, step, title, body }, i) => (
            <Reveal key={step} delay={i * 0.12} className="relative text-center">
              <IconMotion className="relative mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border border-primary-800/15 bg-cream text-primary-800">
                <Icon />
                <span className="absolute -top-2 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary-900 text-[11px] font-semibold text-cream">
                  {step}
                </span>
              </IconMotion>
              <h3 className="mt-6 text-lg font-semibold text-primary-900">{title}</h3>
              <p className="mx-auto mt-2 max-w-[260px] text-[15px] leading-relaxed text-primary-900/55">
                {body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

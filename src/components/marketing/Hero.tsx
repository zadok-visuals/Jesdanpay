import Image from "next/image";
import { PillButton } from "@/components/marketing/PillButton";
import { Reveal } from "@/components/marketing/Reveal";
import { ArrowRightIcon } from "@/components/marketing/MarketingIcons";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-24 pt-36 sm:px-6 sm:pt-44 lg:pt-52">
      {/* Ambient orbit rings + ribbon, purely decorative — sit behind both columns and extend
          past the viewport edge so they never compete with the copy or the product shot. */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute -right-24 top-16 h-[520px] w-[520px] animate-marketing-orbit rounded-full border border-primary-800/10 sm:-right-10" />
        <div className="absolute -right-24 top-16 h-[420px] w-[420px] translate-x-[50px] translate-y-[50px] animate-marketing-orbit-reverse rounded-full border border-accent-500/20 sm:-right-10" />
        <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary-100/40 blur-3xl" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        <div>
          <Reveal>
            <span className="inline-flex items-center rounded-full border border-primary-800/15 bg-white/60 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-primary-800 backdrop-blur">
              Nigeria · Ghana · Kenya → China
            </span>
          </Reveal>

          <Reveal delay={0.08}>
            <h1 className="mt-7 font-[family-name:var(--font-serif)] text-[2.75rem] leading-[1.05] tracking-tight text-primary-900 sm:text-6xl lg:text-[4.25rem]">
              Facilitating supplier payments{" "}
              <span className="italic text-primary-600">to China</span>.
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-primary-900/60">
              Deposit NGN, GHS, KES or USDT, convert to CNY at a transparent rate, and pay your
              supplier directly — or withdraw back out whenever you need to. Fast settlement, no
              hidden markups.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-9 flex flex-row flex-wrap items-center gap-4">
              <PillButton href="/signup" size="lg">
                Get started
                <ArrowRightIcon />
              </PillButton>
              {/* mailto placeholder — swap for the client's real support address before launch */}
              <PillButton href="mailto:hello@jesdanpay.net" variant="secondary" size="lg">
                Talk to us
              </PillButton>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.2} className="relative mx-auto w-full max-w-sm lg:max-w-none">
          <div className="relative aspect-[4/5] w-full">
            <div className="animate-marketing-float relative h-full w-full">
              <div className="absolute inset-6 rounded-3xl bg-gradient-to-br from-primary-100/70 via-cream to-accent-100/50 blur-2xl" />
              <div className="relative h-full w-full overflow-hidden rounded-3xl border border-white/50 shadow-[0_40px_80px_-30px_rgba(10,46,31,0.35)]">
                <Image
                  src="/auth-hero-female-v2.png"
                  alt="The JesDanPay app dashboard, showing NGN, USD and CNY balances"
                  fill
                  priority
                  sizes="(min-width: 1024px) 420px, 90vw"
                  className="object-cover object-top"
                />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

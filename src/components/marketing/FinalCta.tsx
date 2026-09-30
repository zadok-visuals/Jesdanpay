import { Reveal } from "@/components/marketing/Reveal";
import { PillButton } from "@/components/marketing/PillButton";
import { ArrowRightIcon } from "@/components/marketing/MarketingIcons";

export function FinalCta() {
  return (
    <section id="cta" className="px-4 py-20 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-primary-900 px-6 py-20 text-center sm:px-10">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-accent-500/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-primary-500/20 blur-3xl"
          aria-hidden="true"
        />

        <Reveal>
          <h2 className="mx-auto max-w-2xl font-[family-name:var(--font-serif)] text-3xl leading-tight text-cream sm:text-5xl">
            Ready to move money smarter?
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[15px] text-cream/60">
            Join the corridor connecting Africa&rsquo;s fastest-growing markets to China.
          </p>
          <div className="mt-10 flex justify-center">
            <PillButton href="/signup" variant="onDark" size="lg">
              Get started
              <ArrowRightIcon />
            </PillButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

import { Reveal } from "@/components/marketing/Reveal";
import { IdCheckIcon, LockIcon, HandshakeIcon } from "@/components/marketing/MarketingIcons";

const POINTS = [
  {
    icon: IdCheckIcon,
    title: "Verified identity",
    body: "Every account is KYC-checked before a withdrawal ever goes out, keeping the corridor clean for everyone.",
  },
  {
    icon: LockIcon,
    title: "Encrypted, end to end",
    body: "Your transaction data is encrypted in transit and at rest, on every deposit, conversion, and payout.",
  },
  {
    icon: HandshakeIcon,
    title: "Regulated partners",
    body: "We work with licensed banking and exchange partners in every market we serve, not workarounds.",
  },
];

export function SecurityTrust() {
  return (
    <section id="security" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <Reveal>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary-800/50">
              Security & trust
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-serif)] text-3xl text-primary-900 sm:text-4xl">
              Built on compliance, not shortcuts
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-primary-900/55">
              Cross-border payments carry real regulatory weight. We take that seriously — every
              account is verified and every transfer moves through licensed, regulated rails.
            </p>
          </Reveal>

          <div className="grid gap-5 sm:grid-cols-3">
            {POINTS.map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={i * 0.1}>
                <div className="h-full rounded-[24px] border border-white/50 bg-white/50 p-7 backdrop-blur-xl">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-800/8 text-primary-800">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-[15px] font-semibold text-primary-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-primary-900/55">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import { SmoothScroll } from "@/components/marketing/SmoothScroll";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { LegalSection } from "@/components/marketing/LegalSection";

export const metadata: Metadata = {
  title: "Terms and Conditions — JesDanPay",
  description: "The terms that govern your use of JesDanPay.",
};

const LAST_UPDATED = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const CONTACT_EMAIL = "support@jesdanpay.net";

export default function TermsPage() {
  return (
    <SmoothScroll>
      <div className="min-h-dvh bg-cream">
        <MarketingNav />
        <main className="px-4 pb-24 pt-36 sm:px-6 sm:pt-44">
          <article className="mx-auto max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary-800/50">Legal</p>
            <h1 className="mt-3 font-[family-name:var(--font-serif)] text-4xl leading-tight text-primary-900 sm:text-5xl">
              Terms and Conditions
            </h1>
            <p className="mt-4 text-sm text-primary-900/50">Last updated: {LAST_UPDATED}</p>

            <p className="mt-8 text-[15px] leading-relaxed text-primary-900/70">
              These terms govern your use of JesDanPay, a platform that helps individuals and
              businesses in Nigeria, Ghana, and Kenya pay vendors and suppliers in China. By
              creating an account, you agree to these terms.
            </p>

            <LegalSection number={1} title="Eligibility">
              <p>
                You must be at least 18 years old and legally capable of entering into binding
                agreements to use JesDanPay. You must provide accurate, current information during
                signup and KYC verification, and keep it updated.
              </p>
            </LegalSection>

            <LegalSection number={2} title="What JesDanPay Is">
              <p>
                JesDanPay is a product layer that lets you fund a wallet in your local currency and
                use it to pay vendors and suppliers in China, using licensed third party payment
                and liquidity partners to actually move funds. JesDanPay is not a bank and does not
                hold a standalone money transmission license in every jurisdiction it serves,
                payments are executed through our regulated partners.
              </p>
            </LegalSection>

            <LegalSection number={3} title="Account Verification (KYC)">
              <p>
                Access to platform features is tiered based on identity verification you complete.
                You agree to provide genuine documents and information. We reserve the right to
                request additional verification at any time, limit your account, or decline a
                payment if we&rsquo;re unable to verify your identity or have reasonable concern
                about the legitimacy of a transaction.
              </p>
            </LegalSection>

            <LegalSection number={4} title="Your Responsibilities">
              <p>
                You are responsible for the accuracy of vendor details you provide for any
                payment, including payments made to recipients in China. JesDanPay is not
                responsible for funds sent to an incorrect vendor due to information you provided.
                You agree not to use JesDanPay for any unlawful purpose, including money
                laundering, terrorist financing, or evading sanctions, and not to attempt to
                circumvent our verification or security measures.
              </p>
            </LegalSection>

            <LegalSection number={5} title="Rates, Fees, and Limits">
              <p>
                Rates shown on the platform for funding or converting your wallet are indicative
                and may change until the moment you confirm a transaction, at which point the rate
                is locked for that transaction. Transaction limits depend on your KYC tier. Any
                fees applicable to a transaction are disclosed to you before you confirm it.
              </p>
            </LegalSection>

            <LegalSection number={6} title="Payment Processing">
              <p>
                We aim to process payments to your vendors promptly, but processing times can
                depend on our payment partners, banking networks, and verification checks, and are
                not guaranteed. We may delay, decline, or reverse a payment where required for
                fraud prevention, compliance, or as directed by a payment partner or regulator.
              </p>
            </LegalSection>

            <LegalSection number={7} title="Prohibited Use">
              <p>
                You may not use JesDanPay if you are located in, or the transaction involves, a
                jurisdiction or person subject to applicable sanctions, or for any payment
                connected to illegal activity. We reserve the right to suspend or close accounts
                found or reasonably suspected to be in violation of this section.
              </p>
            </LegalSection>

            <LegalSection number={8} title="Account Suspension and Termination">
              <p>
                We may suspend or terminate your account for violation of these terms, suspected
                fraud, legal or regulatory requirement, or extended inactivity. You may close your
                account at any time by contacting us, subject to settling any pending
                transactions.
              </p>
            </LegalSection>

            <LegalSection number={9} title="Limitation of Liability">
              <p>
                JesDanPay provides the platform on an &ldquo;as is&rdquo; basis. To the fullest
                extent permitted by law, JesDanPay is not liable for indirect, incidental, or
                consequential damages arising from your use of the platform, delays or failures
                caused by our third party payment partners, or losses resulting from inaccurate
                information you provided (including vendor payment details).
              </p>
            </LegalSection>

            <LegalSection number={10} title="Disputes">
              <p>
                If you have a dispute about a transaction, contact us first at{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary-700 underline underline-offset-2">
                  {CONTACT_EMAIL}
                </a>{" "}
                so we can attempt to resolve it directly before any other action is taken.
              </p>
            </LegalSection>

            <LegalSection number={11} title="Governing Law">
              <p>
                These terms are governed by the laws of [JURISDICTION TO BE CONFIRMED], without
                regard to conflict of law principles.
              </p>
            </LegalSection>

            <LegalSection number={12} title="Changes to These Terms">
              <p>
                We may update these terms from time to time. Continued use of JesDanPay after an
                update means you accept the revised terms. For material changes, we&rsquo;ll make
                reasonable efforts to notify you directly.
              </p>
            </LegalSection>

            <LegalSection number={13} title="Contact Us">
              <p>
                Questions about these terms can be sent to{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary-700 underline underline-offset-2">
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </LegalSection>
          </article>
        </main>
        <MarketingFooter />
      </div>
    </SmoothScroll>
  );
}

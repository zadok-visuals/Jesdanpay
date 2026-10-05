import type { Metadata } from "next";
import { SmoothScroll } from "@/components/marketing/SmoothScroll";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { LegalSection } from "@/components/marketing/LegalSection";

export const metadata: Metadata = {
  title: "Privacy Policy — JesDanPay",
  description: "How JesDanPay collects, uses, and protects your information.",
};

const LAST_UPDATED = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const CONTACT_EMAIL = "support@jesdanpay.net";

export default function PrivacyPolicyPage() {
  return (
    <SmoothScroll>
      <div className="min-h-dvh bg-cream">
        <MarketingNav />
        <main className="px-4 pb-24 pt-36 sm:px-6 sm:pt-44">
          <article className="mx-auto max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary-800/50">Legal</p>
            <h1 className="mt-3 font-[family-name:var(--font-serif)] text-4xl leading-tight text-primary-900 sm:text-5xl">
              Privacy Policy
            </h1>
            <p className="mt-4 text-sm text-primary-900/50">Last updated: {LAST_UPDATED}</p>

            <p className="mt-8 text-[15px] leading-relaxed text-primary-900/70">
              JesDanPay (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;) operates a platform
              that helps individuals and businesses in Nigeria, Ghana, and Kenya pay vendors and
              suppliers in China. This policy explains what information we collect, why we
              collect it, and how we handle it.
            </p>

            <LegalSection number={1} title="Information We Collect">
              <p>
                <strong className="font-semibold text-primary-900">Account information:</strong> your
                name, email address, phone number, and country of residence when you sign up.
              </p>
              <p>
                <strong className="font-semibold text-primary-900">Identity verification (KYC):</strong>{" "}
                depending on your tier and country, we collect your BVN or NIN (Nigeria) or a
                government issued ID and its category (Ghana, Kenya), a selfie photo for identity
                matching, and proof of address documents. Business accounts additionally provide a
                tax identification number, ownership structure details, incorporation certificate,
                director identification, and proof of business address.
              </p>
              <p>
                <strong className="font-semibold text-primary-900">Transaction data:</strong> records
                of your deposits, withdrawals, wallet conversions, and payments made to vendors in
                China, including amounts, currencies, rates applied, and timestamps.
              </p>
              <p>
                <strong className="font-semibold text-primary-900">Vendor payment details:</strong>{" "}
                when you pay a vendor or supplier in China, we collect the recipient&rsquo;s details
                and a QR code image you provide so the payment reaches the correct account.
              </p>
              <p>
                <strong className="font-semibold text-primary-900">Wallet and balance data:</strong>{" "}
                your balances across supported currencies (NGN, GHS, KES, USDT, CNY) within the
                platform.
              </p>
              <p>
                <strong className="font-semibold text-primary-900">Technical data:</strong> basic
                device and session information collected automatically when you use the platform,
                used for security and fraud prevention.
              </p>
            </LegalSection>

            <LegalSection number={2} title="How We Use Your Information">
              <p>
                To verify your identity and comply with know your customer (KYC) and anti money
                laundering (AML) obligations in the jurisdictions we operate in.
              </p>
              <p>To process your deposits, withdrawals, wallet conversions, and vendor payments.</p>
              <p>To detect and prevent fraud, unauthorized access, and misuse of the platform.</p>
              <p>To provide customer support and respond to your requests.</p>
              <p>To meet legal and regulatory reporting obligations where required.</p>
              <p>
                We do not use your information for advertising, and we do not sell your personal
                information to third parties.
              </p>
            </LegalSection>

            <LegalSection number={3} title="Who We Share Your Information With">
              <p>
                <strong className="font-semibold text-primary-900">Payment and liquidity partners:</strong>{" "}
                we share the minimum information necessary with our payment processing partners
                (currently Busha and Klasha) to execute your deposits, withdrawals, and vendor
                payments.
              </p>
              <p>
                <strong className="font-semibold text-primary-900">Regulators and law enforcement:</strong>{" "}
                where legally required, we may disclose information to regulators, tax
                authorities, or law enforcement.
              </p>
              <p>
                We do not share your KYC documents, transaction history, or vendor payment details
                with any other third party for marketing or any purpose unrelated to operating the
                platform.
              </p>
            </LegalSection>

            <LegalSection number={4} title="Data Security">
              <p>
                Your data is stored on Supabase infrastructure with encryption at rest and in
                transit. Transaction PINs are hashed, never stored in plain text. Access to your
                data within our systems is restricted to what&rsquo;s needed to operate and support
                the platform, and administrative access is logged.
              </p>
            </LegalSection>

            <LegalSection number={5} title="Data Retention">
              <p>
                We retain KYC documents and transaction records for as long as your account is
                active and for a period afterward as required by applicable financial
                recordkeeping and AML regulations in the relevant jurisdiction, even if you
                request deletion of other account data.
              </p>
            </LegalSection>

            <LegalSection number={6} title="Your Rights">
              <p>
                You can request access to the personal information we hold about you, request
                correction of inaccurate information, and request deletion of your account.
                Deletion requests are subject to the retention obligations described in section 5,
                we may be legally required to retain certain records even after an account is
                closed.
              </p>
            </LegalSection>

            <LegalSection number={7} title="International Data Transfers">
              <p>
                Because JesDanPay facilitates payments from Nigeria, Ghana, and Kenya to vendors in
                China, your information may be processed in countries other than your own as part
                of completing your payments.
              </p>
            </LegalSection>

            <LegalSection number={8} title="Children">
              <p>
                JesDanPay is not intended for use by anyone under the age of 18, and we do not
                knowingly collect information from minors.
              </p>
            </LegalSection>

            <LegalSection number={9} title="Changes to This Policy">
              <p>
                We may update this policy from time to time. We&rsquo;ll post the updated version
                here with a new &ldquo;last updated&rdquo; date, and for material changes we&rsquo;ll
                make reasonable efforts to notify you directly.
              </p>
            </LegalSection>

            <LegalSection number={10} title="Analytics">
              <p>
                We use Google Analytics on our public marketing and sign in pages only — pages
                like this one, the blog, and the login and sign up screens. It collects page
                views, device and browser information, and your approximate location, using
                cookies. Google Analytics is not used anywhere inside your logged in dashboard or
                the admin area, so it never sees your transaction, balance, or KYC data. You can
                read more about how Google handles this information in{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary-700 underline underline-offset-2"
                >
                  Google&rsquo;s Privacy Policy
                </a>
                .
              </p>
            </LegalSection>

            <LegalSection number={11} title="Contact Us">
              <p>
                Questions about this policy or your data can be sent to{" "}
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

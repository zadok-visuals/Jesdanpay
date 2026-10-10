"use client";

import { useState } from "react";
import { Reveal } from "@/components/marketing/Reveal";

// DRAFT COPY — placeholder starter questions/answers for the client to review, edit, and confirm
// before launch (figures, timelines, and specifics below are illustrative, not commitments).
const FAQS = [
  {
    question: "How does the JesDanPay corridor work?",
    answer:
      "Deposit NGN, KES, or USDT into your JesDanPay wallet (GHS is coming soon), convert it to CNY at a transparent rate, then pay your supplier in China directly or withdraw back to your local currency whenever you need to.",
  },
  {
    question: "Which countries and currencies are supported?",
    answer:
      "Nigeria (NGN) and Kenya (KES) on the deposit side today, plus USDT from any market, all converting to and from Chinese Yuan (CNY). Ghana (GHS) is coming soon.",
  },
  {
    question: "What fees does JesDanPay charge?",
    answer:
      "A transparent markup is applied on top of the live exchange rate at conversion time — the rate you're quoted before confirming is the rate you get, with no hidden charges added afterward.",
  },
  {
    question: "How long does settlement take?",
    answer:
      "Most deposits and conversions complete within minutes. Payouts to a supplier or withdrawal back to your local currency typically settle the same day, depending on the destination bank or network.",
  },
  {
    question: "Do I need to complete KYC before using JesDanPay?",
    answer:
      "You can explore your dashboard right away, but KYC verification (identity and, for businesses, company details) is required before your first withdrawal or supplier payment goes out.",
  },
  {
    question: "Can I withdraw funds back to my local currency?",
    answer:
      "Yes — funds can be converted back out of CNY to NGN, KES, or USDT (GHS coming soon) and withdrawn to your saved bank account or wallet address at any time.",
  },
  {
    question: "Is my money safe with JesDanPay?",
    answer:
      "Every account is identity-verified, transaction data is encrypted in transit and at rest, and payments move through licensed banking and exchange partners in every market we serve.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Reveal className="mx-auto max-w-xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary-800/50">
            Questions, answered
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-serif)] text-3xl text-primary-900 sm:text-4xl">
            Frequently asked questions
          </h2>
        </Reveal>

        <div className="mt-10 flex flex-col gap-3">
          {FAQS.map((faq, i) => {
            const open = openIndex === i;
            return (
              <Reveal key={faq.question} delay={i * 0.05}>
                <div className="overflow-hidden rounded-2xl border border-white/50 bg-white/50 backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(open ? null : i)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  >
                    <span className="text-[15px] font-semibold text-primary-900">{faq.question}</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      className={`h-5 w-5 shrink-0 text-primary-800/60 transition-transform duration-300 ${
                        open ? "rotate-180" : ""
                      }`}
                    >
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div
                    className={`grid transition-all duration-300 ${
                      open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-6 pb-5 text-sm leading-relaxed text-primary-900/55">{faq.answer}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import type { ReactNode } from "react";

// Shared by src/app/privacy/page.tsx and src/app/terms/page.tsx — a numbered heading plus body
// paragraphs, styled consistent with the rest of the marketing site's typography (serif headings,
// warm-neutral body text) rather than a generic legal-page look.
export function LegalSection({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-[family-name:var(--font-serif)] text-xl text-primary-900">
        {number}. {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-primary-900/70">{children}</div>
    </section>
  );
}

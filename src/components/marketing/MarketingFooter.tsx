import Link from "next/link";
import { Wordmark } from "@/components/layout/Wordmark";
import { FacebookIcon, TikTokIcon, InstagramIcon } from "@/components/marketing/MarketingIcons";

// Leading "/" on the hash anchors — see MarketingNav.tsx's LINKS comment; this footer now also
// renders on /blog and /blog/[slug], where a bare "#foo" wouldn't navigate back to "/".
const FOOTER_LINKS = [
  { href: "/#how-it-works", label: "Product" },
  { href: "/#countries", label: "Countries" },
  { href: "/#security", label: "Security" },
  { href: "/#features", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/#faq", label: "FAQ" },
];

// Facebook/TikTok/Instagram — the client's actual platforms. hrefs are all "#" placeholders (no
// confirmed handles yet) — swap for the client's real profile URLs before launch.
const SOCIALS = [
  { href: "#", label: "Facebook", Icon: FacebookIcon },
  { href: "#", label: "TikTok", Icon: TikTokIcon },
  { href: "#", label: "Instagram", Icon: InstagramIcon },
];

export function MarketingFooter() {
  return (
    <footer className="px-4 pb-10 pt-16 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-3xl border border-primary-900/10 bg-white/50 px-6 py-12 backdrop-blur-xl sm:px-12">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Wordmark className="h-7" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-primary-900/50">
              Cross-border payments between Africa and China — transparent rates, fast
              settlement.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-4">
            {FOOTER_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-primary-900/60 hover:text-primary-900"
              >
                {link.label}
              </a>
            ))}
            <Link href="/login" className="text-sm font-medium text-primary-900/60 hover:text-primary-900">
              Log in
            </Link>
          </div>

          <div className="flex gap-3">
            {SOCIALS.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-primary-900/10 text-primary-900/60 transition-colors hover:border-primary-900/25 hover:text-primary-900"
              >
                <Icon />
              </a>
            ))}
          </div>
        </div>

        <div className="mt-10 border-t border-primary-900/10 pt-6">
          <p className="text-xs leading-relaxed text-primary-900/40">
            © {new Date().getFullYear()} JesDanPay. All transfers are subject to identity
            verification and the regulatory requirements applicable in each market served.
          </p>
        </div>
      </div>
    </footer>
  );
}

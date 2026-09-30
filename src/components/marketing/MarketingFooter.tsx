import Link from "next/link";
import { Wordmark } from "@/components/layout/Wordmark";

const FOOTER_LINKS = [
  { href: "#how-it-works", label: "Product" },
  { href: "#countries", label: "Countries" },
  { href: "#security", label: "Security" },
  { href: "#features", label: "Pricing" },
];

// Social hrefs are placeholders (no confirmed handles yet) — swap for the client's real profiles
// before launch.
const SOCIALS: { href: string; label: string; path: string; rect?: boolean }[] = [
  {
    href: "#",
    label: "X (Twitter)",
    path: "M4 4l7.5 8.5L4.3 20h2l6.3-6.7L17.5 20H20l-8-9 7-7h-2l-6 6.4L6.5 4H4Z",
  },
  {
    href: "#",
    label: "Instagram",
    path: "",
    rect: true,
  },
  {
    href: "#",
    label: "LinkedIn",
    path: "M4.5 8.5h3V19h-3V8.5ZM6 4a1.75 1.75 0 1 1 0 3.5A1.75 1.75 0 0 1 6 4ZM10.5 8.5h2.9v1.43h.04c.4-.76 1.4-1.57 2.9-1.57 3.1 0 3.66 2.04 3.66 4.7V19h-3v-5.24c0-1.25-.02-2.86-1.74-2.86-1.75 0-2.02 1.36-2.02 2.77V19h-3V8.5Z",
  },
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
            {SOCIALS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                aria-label={social.label}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-primary-900/10 text-primary-900/60 transition-colors hover:border-primary-900/25 hover:text-primary-900"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-[18px] w-[18px]">
                  {social.rect ? (
                    <>
                      <rect x="4" y="4" width="16" height="16" rx="4.5" />
                      <circle cx="12" cy="12" r="3.5" />
                      <circle cx="16.5" cy="7.5" r="0.75" fill="currentColor" stroke="none" />
                    </>
                  ) : (
                    <path d={social.path} strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </svg>
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

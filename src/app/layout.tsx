import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { Toaster } from "sonner";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { SITE_URL, SOCIAL_LINKS } from "@/lib/site";
import "./globals.css";

// Organization structured data — tells search engines (and AI crawlers) who JesDanPay actually
// is and where its real social profiles live, via `sameAs`. Rendered once here, not per-page,
// since an Organization identity doesn't change between routes. Escaped per Next's own JSON-LD
// guide (replacing "<" with its unicode equivalent) since JSON.stringify alone doesn't sanitize
// against XSS in this context.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "JesDanPay",
  url: SITE_URL,
  logo: `${SITE_URL}/jesdanpay-logo.png`,
  sameAs: Object.values(SOCIAL_LINKS),
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif for the marketing site's headlines (src/components/marketing/*) — the rest of
// the app (dashboard, admin) uses Geist Sans exclusively via --font-sans and never opts into this.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  // Same APP_URL convention as src/lib/email.ts, src/lib/actions/klasha.ts, src/lib/actions/auth.ts
  // — without this, Next resolves the og:image/twitter:image meta tags' URL against
  // http://localhost:3000 in every environment, breaking link previews in production.
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: "JesDanPay",
  description: "Facilitating suppliers payment to China.",
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden bg-background text-foreground">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd).replace(/</g, "\\u003c") }}
        />
        {children}
        <Toaster position="top-center" richColors />
        <GoogleAnalytics />
      </body>
    </html>
  );
}

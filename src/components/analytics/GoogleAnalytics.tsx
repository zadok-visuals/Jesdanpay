"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

// Mirrors proxy.ts's own PUBLIC_PATHS idea (prefix match, except "/" which must be exact) but is
// deliberately a separate, narrower list here — this gates ANALYTICS TRACKING, not auth/page
// access, and the two lists are allowed to diverge (e.g. /blog/[slug] is public for both, but a
// future public page that still shouldn't be tracked wouldn't need touching proxy.ts at all).
const PUBLIC_PATHS = ["/blog", "/privacy", "/terms", "/login", "/signup", "/forgot-password"];

function isPublicPath(pathname: string): boolean {
  return pathname === "/" || PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

// Loads and drives Google Analytics (gtag.js) on public marketing/auth pages only — admin and
// dashboard routes carry user IDs and financial data in their URLs and content, which must never
// reach a third party. Renders nothing at all if NEXT_PUBLIC_GA_MEASUREMENT_ID isn't set (e.g.
// every environment except Production on Vercel — see .env.local.example).
//
// Because this is a client component mounted once in the root layout, a logged-in user can
// navigate from a public page into the dashboard via client-side routing WITHOUT the script
// ever reloading — gtag's own per-property "ga-disable-<ID>" flag (documented by Google) is the
// mechanism for turning tracking off mid-session without re-fetching gtag.js, so this sets it on
// every pathname change rather than relying on the script only ever having loaded on a public
// page in the first place.
export function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const pathname = usePathname();

  useEffect(() => {
    if (!measurementId) return;
    (window as unknown as Record<string, boolean>)[`ga-disable-${measurementId}`] = !isPublicPath(pathname);
  }, [measurementId, pathname]);

  if (!measurementId) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          window["ga-disable-${measurementId}"] = ${!isPublicPath(pathname)};
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>
    </>
  );
}

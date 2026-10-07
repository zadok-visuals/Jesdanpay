"use client";

import { useEffect } from "react";

const SUPPORT_EMAIL = "support@jesdanpay.net";

// Root-layout error boundary — only fires when the root layout itself fails to render, which is
// rare but means nothing from src/app/layout.tsx (globals.css, fonts, the <html>/<body> tags) can
// be relied on here. Per Next's own file-convention docs, global-error.js "must include html and
// body tags" and "global styles... that your error page requires" itself, since it fully replaces
// the root layout when active — so this is inline-styled on purpose, not a missed Tailwind pass.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          background: "#f5faf7",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          color: "#171717",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 384,
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid #eeeef1",
            borderRadius: 24,
            padding: 32,
          }}
        >
          <p style={{ margin: "0 0 24px", fontSize: 20, fontWeight: 700, color: "#166640" }}>JesDanPay</p>
          <div
            style={{
              margin: "0 auto 16px",
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              background: "#fbeae8",
              fontSize: 24,
            }}
          >
            ⚠️
          </div>
          <h1 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ margin: "0 0 24px", fontSize: 14, color: "rgba(23,23,23,0.6)", lineHeight: 1.5 }}>
            We hit a snag loading JesDanPay. Please try again — if it keeps happening, contact us
            at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "#1b7a4b", fontWeight: 500 }}>
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 44,
              padding: "0 20px",
              borderRadius: 12,
              border: "none",
              background: "#1b7a4b",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

import type { MetadataRoute } from "next";

// Same APP_URL convention as metadataBase in layout.tsx / src/app/sitemap.ts.
const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/admin-mfa",
        "/api",
        "/auth",
        "/account-suspended",
        "/onboarding",
        "/home",
        "/accounts",
        "/payments",
        "/pay-to-china",
        "/transactions",
        "/reports",
        "/settings",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}

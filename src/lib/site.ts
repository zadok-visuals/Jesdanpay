// Single source of truth for the business's own public identity — the real social profiles and
// canonical site URL. Used by the marketing footer (src/components/marketing/MarketingFooter.tsx)
// and the Organization JSON-LD (src/app/layout.tsx) so neither can drift from the other.
export const SITE_URL = "https://jesdanpay.net";

export const SOCIAL_LINKS = {
  facebook: "https://www.facebook.com/jesdanpay",
  instagram: "https://www.instagram.com/jesdanpay",
  tiktok: "https://www.tiktok.com/@jesdanpay",
} as const;

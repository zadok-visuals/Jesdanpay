// Single source of truth for the business's own public identity — the real social profiles and
// canonical site URL. Used by the marketing footer (src/components/marketing/MarketingFooter.tsx)
// and the Organization JSON-LD (src/app/layout.tsx) so neither can drift from the other.
export const SITE_URL = "https://jesdanpay.net";

export const SOCIAL_LINKS = {
  facebook: "https://www.facebook.com/jesdanpay",
  instagram: "https://www.instagram.com/jesdanpay",
  tiktok: "https://www.tiktok.com/@jesdanpay",
} as const;

// General inquiries mailbox shown on the marketing site (Hero.tsx's "Email us" button and
// FloatingSupport.tsx's logged-out card) — distinct from the support@ mailbox used by the
// dashboard's own error/suspended pages, so keep this one separate from those.
export const HELLO_EMAIL = "hello@jesdanpay.net";

"use client";

import { useEffect } from "react";
import { logAdminSignInIfNeeded } from "@/lib/actions/admin";

// Rendered once from the persistent admin layout (src/app/admin/layout.tsx) — the layout itself
// doesn't remount on navigation between admin pages, so this effect fires once per real browser
// session rather than on every page visit. The actual once-per-session guarantee is enforced
// server-side via a short-lived cookie (see logAdminSignInIfNeeded), not by this effect alone.
export function AdminSessionLogger() {
  useEffect(() => {
    logAdminSignInIfNeeded();
  }, []);
  return null;
}

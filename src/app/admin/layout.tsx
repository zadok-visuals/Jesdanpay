import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Wordmark } from "@/components/layout/Wordmark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AdminNavTabs } from "@/components/admin/AdminNavTabs";
import type { Currency } from "@/lib/types/database";

// handle_new_user() (migration 0020) only provisions a wallet for the local currency matching
// the signup country (NG->NGN, GH->GHS, KE->KES) plus CNY+USDT always — everyone else gets no
// local wallet at all. That restriction is deliberate for regular users (presumably compliance/
// rails reasons) and must keep applying to them — this backfill exists ONLY because an admin
// account is just a regular profile with an allowlisted email (see isAdminEmail below), so an
// admin who signed up under one country would otherwise have no wallet rows for the others and
// couldn't deposit/withdraw/convert those currencies themselves (Settings/Accounts availability
// is driven entirely by which `wallets` rows exist). "USD" is deliberately excluded — a dead
// legacy enum value never actually provisioned or used anywhere in the app.
// ignoreDuplicates makes this a safe no-op on every page load: it only inserts rows that don't
// already exist (ON CONFLICT DO NOTHING on the wallets table's own (user_id, currency) primary
// key), never touching an existing wallet's balance. Runs only for the currently-authenticated
// admin's own id, never another user's — gated by sitting right after requireAdminUser() here.
const ADMIN_BACKFILL_CURRENCIES: Currency[] = ["NGN", "GHS", "KES", "CNY", "USDT"];

async function backfillAdminWallets(userId: string) {
  const admin = createAdminClient();
  await admin
    .from("wallets")
    .upsert(
      ADMIN_BACKFILL_CURRENCIES.map((currency) => ({ user_id: userId, currency })),
      { onConflict: "user_id,currency", ignoreDuplicates: true },
    );
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const adminUser = await requireAdminUser();
  await backfillAdminWallets(adminUser.id);

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
        <div className="flex items-center gap-3">
          <Wordmark className="h-6" />
          <span className="rounded-full bg-black/[.06] px-2.5 py-1 text-xs font-semibold text-foreground/60">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin-mfa/enroll" className="text-sm font-medium text-foreground/60 hover:text-foreground hover:underline">
            Security
          </a>
          <Link href="/home" className="text-sm font-medium text-foreground/60 hover:text-foreground hover:underline">
            Back to app
          </Link>
          <LogoutButton className="inline-flex items-center gap-1.5 text-sm font-medium text-danger-500 hover:underline" />
        </div>
      </header>
      <AdminNavTabs />
      <main className="p-6">{children}</main>
    </div>
  );
}

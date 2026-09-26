import { requireAdminUser } from "@/lib/auth/admin";
import { Wordmark } from "@/components/layout/Wordmark";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminUser();

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
        <div className="flex items-center gap-3">
          <Wordmark className="h-6" />
          <span className="rounded-full bg-black/[.06] px-2.5 py-1 text-xs font-semibold text-foreground/60">
            Admin
          </span>
        </div>
        <LogoutButton className="inline-flex items-center gap-1.5 text-sm font-medium text-danger-500 hover:underline" />
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}

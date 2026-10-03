import { requireSuperAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { AddAdminForm } from "@/components/admin/AddAdminForm";
import { RemoveAdminButton } from "@/components/admin/RemoveAdminButton";

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return "Never";
  return new Date(ts).toLocaleString();
}

export default async function AdminAdministratorsPage() {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { data: adminUsers } = await admin.from("admin_users").select("*").order("created_at", { ascending: true });
  const adminUserIds = (adminUsers ?? []).map((a) => a.id);

  const [{ data: profiles }, { data: loginLog }] = await Promise.all([
    adminUserIds.length
      ? admin.from("profiles").select("id, email, full_name").in("id", adminUserIds)
      : Promise.resolve({ data: [] }),
    adminUserIds.length
      ? admin
          .from("admin_login_log")
          .select("admin_user_id, event, created_at")
          .in("admin_user_id", adminUserIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  // admin_login_log has no native "most recent per (admin, event)" aggregation through the JS
  // client — rows are already sorted newest-first above, so the first sign_in/sign_out seen per
  // admin as we walk the list IS the most recent one; later matches for the same pair are ignored.
  const lastEventByAdmin = new Map<string, { sign_in?: string; sign_out?: string }>();
  for (const row of loginLog ?? []) {
    const existing = lastEventByAdmin.get(row.admin_user_id) ?? {};
    if (!existing[row.event]) {
      existing[row.event] = row.created_at;
      lastEventByAdmin.set(row.admin_user_id, existing);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-xl font-semibold">Administrators</h1>
        <p className="mb-6 text-sm text-foreground/50">
          Super admin only. Add or remove who can sign into the admin panel, and see each
          admin&rsquo;s most recent sign-in/sign-out.
        </p>
        <Card className="p-5">
          <AddAdminForm />
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {(adminUsers ?? []).length === 0 ? (
          <Card className="p-10 text-center text-sm text-foreground/50">No admins on file.</Card>
        ) : (
          (adminUsers ?? []).map((a) => {
            const profile = profileById.get(a.id);
            const lastEvents = lastEventByAdmin.get(a.id) ?? {};
            return (
              <Card key={a.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{profile?.full_name || profile?.email || a.id}</span>
                    <Pill tone={a.role === "super_admin" ? "warning" : "neutral"}>{a.role}</Pill>
                  </div>
                  <p className="text-xs text-foreground/50">{profile?.email}</p>
                </div>
                <div className="flex items-center gap-6 text-xs text-foreground/50">
                  <div>
                    <p className="text-foreground/40">Last sign-in</p>
                    <p>{formatTimestamp(lastEvents.sign_in)}</p>
                  </div>
                  <div>
                    <p className="text-foreground/40">Last sign-out</p>
                    <p>{formatTimestamp(lastEvents.sign_out)}</p>
                  </div>
                  <RemoveAdminButton adminUserId={a.id} email={profile?.email ?? a.id} />
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

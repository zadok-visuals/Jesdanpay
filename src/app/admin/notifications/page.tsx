import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { NotificationComposeForm } from "@/components/admin/NotificationComposeForm";
import { SendTestEmailButton } from "@/components/admin/SendTestEmailButton";

export default async function AdminNotificationsPage() {
  const admin = createAdminClient();

  const { data: recent } = await admin
    .from("notifications")
    .select("id, user_id, title, body, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  // Separate lookup + in-memory join rather than an embedded FK select — matches the convention
  // already used throughout the admin panel (e.g. admin/rmb joining profiles by user_id) and
  // avoids needing a typed Relationships entry just for this one display.
  const targetedUserIds = [...new Set((recent ?? []).map((n) => n.user_id).filter((id): id is string => !!id))];
  const { data: targetedProfiles } = targetedUserIds.length
    ? await admin.from("profiles").select("id, email").in("id", targetedUserIds)
    : { data: [] };
  const emailByUserId = new Map((targetedProfiles ?? []).map((p) => [p.id, p.email]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mb-6 text-xl font-semibold">Notifications</h1>
        <div className="flex max-w-lg flex-col gap-4">
          <Card className="p-5">
            <NotificationComposeForm />
          </Card>
          <Card className="p-5">
            <p className="mb-1 text-sm font-medium text-foreground/80">Verify Resend setup</p>
            <p className="mb-3 text-xs text-foreground/50">
              Sends a one-off test message to your own admin address so you can confirm email delivery without
              waiting for a real event.
            </p>
            <SendTestEmailButton />
          </Card>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">Recently sent</h2>
        {!recent || recent.length === 0 ? (
          <Card className="p-10 text-center text-sm text-foreground/50">Nothing sent yet.</Card>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((n) => (
              <Card key={n.id} className="flex flex-col gap-1 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{n.title}</span>
                  <Pill tone={n.user_id ? "neutral" : "warning"}>
                    {n.user_id ? emailByUserId.get(n.user_id) ?? "Unknown user" : "All users"}
                  </Pill>
                  <span className="text-xs text-foreground/40">{new Date(n.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-foreground/60">{n.body}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/admin";
import { getSupportThreads } from "@/lib/actions/support";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";

export default async function AdminChatPage() {
  await requireAdminUser();
  const threads = await getSupportThreads();

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Chat Support</h1>
      {threads.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">No support conversations yet.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {threads.map((t) => (
            <Link key={t.userId} href={`/admin/chat/${t.userId}`}>
              <Card className="flex flex-col gap-1 p-5 transition-colors hover:border-primary-300 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t.fullName || t.email}</span>
                    {t.unreadCount > 0 && <Pill tone="danger">{t.unreadCount} unread</Pill>}
                  </div>
                  <p className="truncate text-xs text-foreground/50">{t.lastMessage}</p>
                </div>
                <span className="text-xs text-foreground/40">{new Date(t.lastMessageAt).toLocaleString()}</span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

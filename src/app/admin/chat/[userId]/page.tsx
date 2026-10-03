import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupportThreadMessages } from "@/lib/actions/support";
import { Card } from "@/components/ui/Card";
import { AdminChatThread } from "@/components/admin/AdminChatThread";

export default async function AdminChatThreadPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireAdminUser();
  const { userId } = await params;

  const admin = createAdminClient();
  const [{ data: profile }, messages] = await Promise.all([
    admin.from("profiles").select("id, email, full_name").eq("id", userId).maybeSingle(),
    getSupportThreadMessages(userId),
  ]);
  if (!profile) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/chat" className="text-sm text-primary-600 hover:underline">
          ← Back to Chat Support
        </Link>
      </div>
      <h1 className="text-xl font-semibold">{profile.full_name || profile.email}</h1>
      <Card className="p-5">
        <AdminChatThread userId={userId} initialMessages={messages} />
      </Card>
    </div>
  );
}

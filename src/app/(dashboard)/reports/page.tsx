import { redirect } from "next/navigation";
import { ComingSoon } from "@/components/layout/ComingSoon";

// Temporarily pulled from the sidebar nav (src/components/layout/Sidebar.tsx) — redirecting
// rather than deleting the route/copy below so this is a one-line revert once Reports comes back.
export default function ReportsPage() {
  redirect("/home");

  return (
    <ComingSoon
      title="Reports"
      description="Transaction reporting and exports arrive alongside the admin panel in Milestone 3."
    />
  );
}

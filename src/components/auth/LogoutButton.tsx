"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/ui/Button";
import type { ReactNode } from "react";

// useFormStatus must be read from a component that's a DESCENDANT of the <form>, not the form
// itself — this is that descendant. Used inside <form action={logOut}> in both Sidebar.tsx and
// admin/layout.tsx, which previously had zero pending state despite logOut doing a real awaited
// Supabase call before redirecting.
export function LogoutButton({ className, icon }: { className: string; icon?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? <Spinner /> : icon}
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}

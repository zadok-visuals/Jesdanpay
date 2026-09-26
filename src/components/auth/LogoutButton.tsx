"use client";

import { useFormStatus } from "react-dom";
import { useRef, useState, type ReactNode } from "react";
import { logOut } from "@/lib/actions/auth";
import { Spinner } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// useFormStatus must be read from a component that's a DESCENDANT of the <form>, not the form
// itself — this is that descendant.
function LogoutSubmitButton({
  className,
  icon,
  onClick,
}: {
  className: string;
  icon?: ReactNode;
  onClick: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? <Spinner /> : icon}
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}

// Owns its own <form action={logOut}> internally (previously the caller wrapped it) so it can gate
// submission behind a confirm dialog — the button is type="button", not type="submit", and confirm
// triggers the real submission via formRef.requestSubmit(). No toast here: logOut redirects
// immediately via redirect(), so there's no post-completion moment on this page to toast on.
export function LogoutButton({ className, icon }: { className: string; icon?: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <form action={logOut} ref={formRef}>
        <LogoutSubmitButton className={className} icon={icon} onClick={() => setConfirmOpen(true)} />
      </form>
      <ConfirmDialog
        open={confirmOpen}
        title="Log out"
        message="Are you sure you want to log out?"
        confirmLabel="Log out"
        danger
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

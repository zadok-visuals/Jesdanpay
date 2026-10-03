"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { sendNotification, type AdminActionState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initialState: AdminActionState = {};

export function NotificationComposeForm() {
  const [state, formAction, pending] = useActionState(sendNotification, initialState);
  const [target, setTarget] = useState<"all" | "user">("all");
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Same submitted-flag + toast pattern already used elsewhere for a useActionState form that
  // needs a one-time success/error reaction (see src/components/wallet/TransactionPinCard.tsx's
  // ChangePinForm) — the effect only fires once per real submission, not on every re-render.
  useEffect(() => {
    if (!submitted) return;
    setSubmitted(false);
    if (state.error) {
      toast.error(state.error);
    } else {
      toast.success("Notification sent");
      formRef.current?.reset();
      setTarget("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => setSubmitted(true)}
      className="flex flex-col gap-4"
    >
      <Input label="Title" id="notif-title" name="title" type="text" required placeholder="e.g. Scheduled maintenance" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notif-body" className="text-sm font-medium text-foreground/80">
          Message
        </label>
        <textarea
          id="notif-body"
          name="body"
          required
          rows={4}
          placeholder="What do you want to tell them?"
          className="rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary-400"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground/80">Send to</span>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="target"
              value="all"
              checked={target === "all"}
              onChange={() => setTarget("all")}
            />
            All users
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="target"
              value="user"
              checked={target === "user"}
              onChange={() => setTarget("user")}
            />
            Specific user
          </label>
        </div>
        {target === "user" && (
          <Input
            id="notif-user-email"
            name="userEmail"
            type="email"
            placeholder="user@example.com"
            required
            className="mt-1"
          />
        )}
      </div>

      {state.error && <p className="text-sm text-danger-500">{state.error}</p>}
      <Button type="submit" loading={pending} className="self-start">
        {pending ? "Sending…" : "Send notification"}
      </Button>
    </form>
  );
}

"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addAdmin, type AddAdminState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initialState: AddAdminState = {};

export function AddAdminForm() {
  const [state, formAction, pending] = useActionState(addAdmin, initialState);
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!submitted) return;
    setSubmitted(false);
    if (state.error) {
      toast.error(state.error);
    } else {
      toast.success("Admin added");
      formRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => setSubmitted(true)}
      className="flex flex-wrap items-end gap-3"
    >
      <Input
        label="Email"
        id="addAdminEmail"
        name="email"
        type="email"
        required
        placeholder="user@example.com"
        className="w-64"
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="addAdminRole" className="text-sm font-medium text-foreground/80">
          Role
        </label>
        <select
          id="addAdminRole"
          name="role"
          defaultValue="admin"
          className="h-11 rounded-xl border border-border bg-white px-3.5 text-sm outline-none focus:border-primary-400"
        >
          <option value="admin">Admin</option>
          <option value="super_admin">Super admin</option>
        </select>
      </div>
      <Button type="submit" loading={pending}>
        {pending ? "Adding…" : "Add admin"}
      </Button>
    </form>
  );
}

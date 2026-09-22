"use client";

import { useActionState } from "react";
import { setCnyMarkupRate, type AdminActionState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initialState: AdminActionState = {};

export function CnyMarkupForm({ markupRate }: { markupRate: number }) {
  const [state, formAction, pending] = useActionState(setCnyMarkupRate, initialState);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <Input
        label="CNY markup (%)"
        id="cnyMarkupPercent"
        name="markupPercent"
        type="number"
        min="0"
        max="99"
        step="0.01"
        defaultValue={markupRate * 100}
        className="w-40"
      />
      <Button type="submit" size="sm" loading={pending}>
        Save
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

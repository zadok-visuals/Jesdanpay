"use client";

import { useActionState } from "react";
import { setFxRate, type AdminActionState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Currency } from "@/lib/types/database";

const initialState: AdminActionState = {};

export function FxRateForm({ currency, cnyRate }: { currency: Currency; cnyRate: number | null }) {
  const [state, formAction, pending] = useActionState(setFxRate, initialState);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="sourceCurrency" value={currency} />
      <Input
        label={`1 ${currency} = ? CNY`}
        id={`cnyRate-${currency}`}
        name="cnyRate"
        type="number"
        min="0.000001"
        step="0.000001"
        defaultValue={cnyRate ?? ""}
        placeholder="Not set"
        className="w-40"
      />
      <Button type="submit" size="sm" loading={pending}>
        Save
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

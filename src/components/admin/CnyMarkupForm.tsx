"use client";

import { useActionState } from "react";
import { setCnyMarkupRate, type AdminActionState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initialState: AdminActionState = {};

export function CnyMarkupForm({
  fiatMarkupRate,
  usdtMarkupRate,
}: {
  fiatMarkupRate: number;
  usdtMarkupRate: number;
}) {
  const [state, formAction, pending] = useActionState(setCnyMarkupRate, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Input
        label="Fiat markup — NGN/GHS/KES (%)"
        id="fiatMarkupPercent"
        name="fiatMarkupPercent"
        type="number"
        min="0"
        max="99"
        step="0.01"
        defaultValue={fiatMarkupRate * 100}
        className="w-56"
      />
      <Input
        label="USDT markup (%)"
        id="usdtMarkupPercent"
        name="usdtMarkupPercent"
        type="number"
        min="0"
        max="99"
        step="0.01"
        defaultValue={usdtMarkupRate * 100}
        className="w-40"
      />
      <Button type="submit" size="sm" loading={pending}>
        Save
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

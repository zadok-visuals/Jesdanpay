"use client";

import { useActionState } from "react";
import { setCnyTierRate, type AdminActionState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initialState: AdminActionState = {};

export function CnyTierRateForm({
  tierMin,
  tierMax,
  usdtToCnyRate,
}: {
  tierMin: number;
  tierMax: number;
  usdtToCnyRate: number;
}) {
  const [state, formAction, pending] = useActionState(setCnyTierRate, initialState);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="tierMin" value={tierMin} />
      <Input
        label={`CNY ${tierMin.toLocaleString("en-US")}–${tierMax.toLocaleString("en-US")}: 1 USDT = ? CNY`}
        id={`cnyTierRate-${tierMin}`}
        name="cnyRate"
        type="number"
        min="0.000001"
        step="0.000001"
        defaultValue={usdtToCnyRate}
        className="w-56"
      />
      <Button type="submit" size="sm" loading={pending}>
        Save
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

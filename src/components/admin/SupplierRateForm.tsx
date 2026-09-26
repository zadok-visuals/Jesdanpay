"use client";

import { useActionState } from "react";
import { setSupplierRate, type AdminActionState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
import type { Currency } from "@/lib/types/database";

const initialState: AdminActionState = {};

function pairKey(base: string, quote: string) {
  return `${base}/${quote}`;
}

export function SupplierRateForm({ pairs }: { pairs: { base: Currency; quote: Currency }[] }) {
  const [state, formAction, pending] = useActionState(setSupplierRate, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="pair" className="text-xs font-medium text-foreground/60">
          Pair
        </label>
        <select id="pair" name="pair" className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm" required>
          {pairs.map(({ base, quote }) => (
            <option key={pairKey(base, quote)} value={pairKey(base, quote)}>
              {base}/{quote}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="buyRate" className="text-xs font-medium text-foreground/60">
          Buy rate (quote per 1 base)
        </label>
        <input
          id="buyRate"
          name="buyRate"
          type="number"
          step="0.000001"
          min="0"
          required
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="effectiveFrom" className="text-xs font-medium text-foreground/60">
          Effective from
        </label>
        <input
          id="effectiveFrom"
          name="effectiveFrom"
          type="datetime-local"
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
        />
      </div>
      <Button type="submit" loading={pending}>
        {pending ? "Saving…" : "Save rate"}
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

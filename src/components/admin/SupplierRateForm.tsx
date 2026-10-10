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
    <form action={formAction} className="flex flex-wrap items-start gap-3">
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
        <p className="w-40 text-[11px] leading-tight text-foreground/40">
          USDT/CNY prices every CNY conversion, no matter which currency the customer paid in.
          USDT/NGN, GHS or KES prices USDT swaps in that currency only.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="buyRate" className="text-xs font-medium text-foreground/60">
          Buy rate
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
        <p className="w-40 text-[11px] leading-tight text-foreground/40">
          How many units of the second currency you get for 1 USDT. For USDT/CNY, this is CNY per
          1 USDT (e.g. 6.6). For USDT/NGN, this is NGN per 1 USDT (e.g. 1550).
        </p>
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
        <p className="w-40 text-[11px] leading-tight text-foreground/40">
          When this rate started applying. Leave blank to use right now.
        </p>
      </div>
      <Button type="submit" loading={pending} className="mt-5">
        {pending ? "Saving…" : "Save rate"}
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

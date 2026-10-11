import { test } from "node:test";
import assert from "node:assert/strict";
import { usdtRateAt } from "./supplierRate.ts";
import type { SupplierRate } from "@/lib/types/database";

// Minimal fixtures — only the fields usdtRateAt actually reads.
function rate(partial: Partial<SupplierRate> & Pick<SupplierRate, "base_currency" | "quote_currency" | "buy_rate" | "effective_from">): SupplierRate {
  return {
    id: "test-id",
    set_by: "test-admin",
    created_at: partial.effective_from,
    ...partial,
  };
}

test("usdtRateAt: returns the rate in effect at the order's time", () => {
  const rates = [
    rate({ base_currency: "USDT", quote_currency: "CNY", buy_rate: 6.5, effective_from: "2026-01-01T00:00:00Z" }),
    rate({ base_currency: "USDT", quote_currency: "CNY", buy_rate: 6.6, effective_from: "2026-03-01T00:00:00Z" }),
  ];
  const result = usdtRateAt(rates, "CNY", "2026-03-15T00:00:00Z");
  assert.deepEqual(result, { rate: 6.6, estimated: false });
});

test("usdtRateAt: picks the latest rate still <= the order time, not the absolute latest", () => {
  const rates = [
    rate({ base_currency: "USDT", quote_currency: "CNY", buy_rate: 6.5, effective_from: "2026-01-01T00:00:00Z" }),
    rate({ base_currency: "USDT", quote_currency: "CNY", buy_rate: 6.6, effective_from: "2026-03-01T00:00:00Z" }),
  ];
  const result = usdtRateAt(rates, "CNY", "2026-02-01T00:00:00Z");
  assert.deepEqual(result, { rate: 6.5, estimated: false });
});

test("usdtRateAt: falls back to the EARLIEST rate on file, flagged estimated, when the order predates every rate for that pair", () => {
  const rates = [
    rate({ base_currency: "USDT", quote_currency: "NGN", buy_rate: 1400, effective_from: "2026-05-01T00:00:00Z" }),
    rate({ base_currency: "USDT", quote_currency: "NGN", buy_rate: 1450, effective_from: "2026-06-01T00:00:00Z" }),
  ];
  // An order placed well before the admin's first-ever NGN rate entry.
  const result = usdtRateAt(rates, "NGN", "2026-01-01T00:00:00Z");
  assert.deepEqual(result, { rate: 1400, estimated: true });
});

test("usdtRateAt: returns null only when there is no rate at all on file for that pair", () => {
  const rates = [rate({ base_currency: "USDT", quote_currency: "CNY", buy_rate: 6.6, effective_from: "2026-01-01T00:00:00Z" })];
  const result = usdtRateAt(rates, "NGN", "2026-02-01T00:00:00Z");
  assert.equal(result, null);
});

test("usdtRateAt: ignores rates for a different quote currency or base currency", () => {
  const rates = [
    rate({ base_currency: "USDT", quote_currency: "KES", buy_rate: 130, effective_from: "2026-01-01T00:00:00Z" }),
    rate({ base_currency: "NGN", quote_currency: "CNY", buy_rate: 206, effective_from: "2026-01-01T00:00:00Z" }),
  ];
  const result = usdtRateAt(rates, "CNY", "2026-02-01T00:00:00Z");
  assert.equal(result, null);
});

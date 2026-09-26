export interface NigerianBank {
  name: string;
  code: string;
}

// Public endpoint, no auth required. Paystack's `code` values are standard NIBSS bank codes —
// exactly what Busha's ngn_bank recipient type expects for bank_code (confirmed: createBushaRecipient
// passes it through untransformed, see src/lib/busha/payout.ts). Cached for a day since the bank
// list changes rarely; this is the first external-API cache in this codebase.
export async function getNigerianBanks(): Promise<NigerianBank[]> {
  const res = await fetch("https://api.paystack.co/bank?country=nigeria", {
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) throw new Error("Could not load the bank list");
  const json = await res.json();
  return ((json.data ?? []) as { name: string; code: string }[]).map((b) => ({ name: b.name, code: b.code }));
}

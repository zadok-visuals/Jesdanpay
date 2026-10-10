// Shared by every admin screen that renders a row from admin_activity_ledger (migration 0044) —
// the dashboard's recent-activity card, the Transactions list, and a user's own activity section
// — so the label for a given `kind` can't drift between them.
export const LEDGER_KIND_LABELS: Record<string, string> = {
  deposit: "Deposit",
  swap: "Swap",
  cny_conversion: "CNY conversion",
  china_payment: "Payment to China",
  withdrawal: "Withdrawal",
};

export function ledgerKindLabel(kind: string): string {
  return LEDGER_KIND_LABELS[kind] ?? kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

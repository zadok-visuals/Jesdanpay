// Server-only. Thin fetch wrapper over Busha's Business API (docs.busha.io) — the sole
// deposit/swap provider for NGN, GHS, KES, and USDT, replacing Quidax entirely.
//
// One generic quote -> transfer pattern serves both deposits and swaps, confirmed against
// docs.busha.io's real reference pages:
//   - A deposit is a same-currency quote (source_currency === target_currency); the resulting
//     transfer's `pay_in` carries a temporary bank account (fiat) or a one-time receiving
//     address (crypto) to show the user.
//   - A swap is a quote between two different currencies; the transfer executes it directly,
//     no pay_in details needed since the source balance already sits inside Busha.
//
// Unconfirmed and NOT guessed at: the exact webhook signature scheme (see the webhook route's
// header comment) — confirm against a real dashboard before trusting any signature check.

const BASE_URL = process.env.BUSHA_API_BASE_URL ?? "https://api.sandbox.busha.so";

export class BushaError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "BushaError";
  }
}

async function request<T>(path: string, options: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  const apiKey = process.env.BUSHA_API_KEY;
  if (!apiKey) throw new BushaError("BUSHA_API_KEY is not configured", 500);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.status === "error") {
    const message = json?.message ?? `Busha request failed (${res.status})`;
    throw new BushaError(message, res.status);
  }
  return json.data as T;
}

export type BushaPayInDetails = {
  type: string;
  address?: string;
  network?: string;
  expires_at?: string;
  payer_details?: {
    account_name?: string;
    account_number?: string;
    bank_name?: string;
    email?: string;
  };
};

export type BushaQuote = {
  id: string;
  source_currency: string;
  target_currency: string;
  source_amount: string;
  target_amount: string;
  rate: { rate: string; rate_explained: string };
  fees: { name: string; amount: { amount: string; currency: string } }[];
  reference: string;
  status: "pending" | "accepted" | "expired";
  expires_at: string;
};

export type BushaTransfer = {
  id: string;
  quote_id: string;
  reference: string;
  category: "deposit" | "withdrawal" | "conversion" | "buy" | "sell" | "send" | "exchange";
  source_currency: string;
  target_currency: string;
  source_amount: string;
  target_amount: string;
  pay_in: BushaPayInDetails;
  status:
    | "pending"
    | "processing"
    | "cancelled"
    | "funds_converted"
    | "funds_received"
    | "outgoing_payment_sent"
    | "funds_delivered"
    | "funds_not_delivered"
    | "funds_refunded"
    | "reverse_fund_conversion";
};

// POST /v1/quotes — pass the same currency for source/target to get a deposit quote (no
// conversion); pass different currencies for a swap quote.
export function createQuote(params: {
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: string;
  isDeposit?: boolean;
}): Promise<BushaQuote> {
  return request("/v1/quotes", {
    method: "POST",
    body: {
      source_currency: params.sourceCurrency.toUpperCase(),
      target_currency: params.targetCurrency.toUpperCase(),
      source_amount: params.sourceAmount,
      ...(params.isDeposit ? { pay_in: { type: "temporary_bank_account" } } : {}),
    },
  });
}

// POST /v1/transfers — executes a quote. For a deposit quote, the response's `pay_in` carries
// the bank account (fiat) or receiving address (crypto) to show the user.
export function createTransfer(quoteId: string): Promise<BushaTransfer> {
  return request("/v1/transfers", { method: "POST", body: { quote_id: quoteId } });
}

// GET /v1/transfers/{id} — polling fallback if the webhook hasn't fired yet.
export function getTransfer(transferId: string): Promise<BushaTransfer> {
  return request(`/v1/transfers/${transferId}`, { method: "GET" });
}

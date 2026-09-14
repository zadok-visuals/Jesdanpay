// Server-only. Thin fetch wrapper over Quidax's API.
//
// Quidax exposes two *separate* products under two *separate* base URLs and auth schemes —
// confirmed directly against docs.quidax.io, not assumed:
//
//   1. The swap API (instant NGN/GHS <-> USDT conversion of a balance already inside Quidax) —
//      base `https://openapi.quidax.io/exchange-open-api/api/v1`, `Authorization: Bearer <key>`.
//   2. The ramp/purchase API (pricing for buying crypto with external fiat) — base
//      `https://ramp-be.quidax.io/api/v1/merchants`, `x-private-key: <key>` header instead.
//
// Only a purchase *quote* endpoint is documented for (2) — the actual "create a deposit and
// get payment instructions" endpoint isn't in the accessible docs. `createDeposit()` below is
// a deliberate stub for that gap: don't guess its shape, confirm it against a real Quidax
// sandbox account (same way Busha's base URL got corrected during real testing) before use.

const SWAP_BASE_URL = process.env.QUIDAX_API_BASE_URL ?? "https://openapi.quidax.io/exchange-open-api/api/v1";
const RAMP_BASE_URL = "https://ramp-be.quidax.io/api/v1/merchants";

export class QuidaxError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "QuidaxError";
  }
}

async function swapRequest<T>(path: string, options: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  const apiKey = process.env.QUIDAX_API_KEY;
  if (!apiKey) throw new QuidaxError("QUIDAX_API_KEY is not configured", 500);

  const res = await fetch(`${SWAP_BASE_URL}${path}`, {
    method: options.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.message ?? json?.data?.message ?? `Quidax request failed (${res.status})`;
    throw new QuidaxError(message, res.status);
  }
  return json.data as T;
}

async function rampRequest<T>(path: string, query: Record<string, string>): Promise<T> {
  const privateKey = process.env.QUIDAX_RAMP_PRIVATE_KEY;
  if (!privateKey) throw new QuidaxError("QUIDAX_RAMP_PRIVATE_KEY is not configured", 500);

  const url = `${RAMP_BASE_URL}${path}?${new URLSearchParams(query).toString()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-private-key": privateKey },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.message ?? `Quidax request failed (${res.status})`;
    throw new QuidaxError(message, res.status);
  }
  return json.data as T;
}

export type QuidaxSwapQuotation = {
  id: string;
  from_currency: string;
  to_currency: string;
  quoted_price: string;
  from_amount: string;
  to_amount: string;
  confirmed: boolean;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type QuidaxSwapTransaction = {
  id: string;
  from_currency: string;
  to_currency: string;
  from_amount: string;
  received_amount: string;
  execution_price: string;
  status: string;
  created_at: string;
  updated_at: string;
};

// POST /users/{user_id}/swap_quotation — quote valid for 15 seconds.
export function createSwapQuote(params: {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: string;
}): Promise<QuidaxSwapQuotation> {
  return swapRequest("/users/me/swap_quotation", {
    method: "POST",
    body: {
      from_currency: params.fromCurrency.toLowerCase(),
      to_currency: params.toCurrency.toLowerCase(),
      from_amount: params.fromAmount,
    },
  });
}

// POST /users/{user_id}/swap_quotation/{quotation_id}/refresh — same params as create, returns
// a fresh 15-second quotation once the previous one has expired.
export function refreshSwapQuote(params: {
  quotationId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: string;
}): Promise<QuidaxSwapQuotation> {
  return swapRequest(`/users/me/swap_quotation/${params.quotationId}/refresh`, {
    method: "POST",
    body: {
      from_currency: params.fromCurrency.toLowerCase(),
      to_currency: params.toCurrency.toLowerCase(),
      from_amount: params.fromAmount,
    },
  });
}

// POST /users/{user_id}/swap_quotation/{quotation_id}/confirm — no request body.
export function confirmSwap(quotationId: string): Promise<QuidaxSwapTransaction> {
  return swapRequest(`/users/me/swap_quotation/${quotationId}/confirm`, { method: "POST" });
}

export type QuidaxPurchaseQuote = {
  fee: string;
  to_amount: string;
};

// POST /purchase_quotes/buy — pricing only (fee + expected crypto amount for a fiat deposit).
// Does not create anything or move money.
export function getPurchaseQuote(params: {
  currency: "ngn" | "ghs";
  token: "usdt";
  fiatAmount: string;
  tokenNetwork: "trc20";
}): Promise<QuidaxPurchaseQuote> {
  return rampRequest("/purchase_quotes/buy", {
    currency: params.currency,
    token: params.token,
    fiat_amount: params.fiatAmount,
    token_network: params.tokenNetwork,
  });
}

// STUB — the actual "create a fiat deposit / get payment instructions" endpoint is not in the
// accessible Quidax docs (only its price-quote endpoint above is documented). Do not call this
// or guess its request/response shape; confirm against a real Quidax sandbox account first —
// see the header comment on this file and the plan's "open/unconfirmed" section.
export function createDeposit(): never {
  throw new QuidaxError(
    "Deposit creation is not yet implemented — Quidax's deposit-collection API is unconfirmed. " +
      "See src/lib/quidax/client.ts header comment.",
    501,
  );
}

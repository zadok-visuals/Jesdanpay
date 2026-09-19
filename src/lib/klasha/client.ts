// Server-only. Thin fetch wrapper over Klasha's CNY Payout API (developers.klasha.com) — the
// automated China-vendor-settlement leg. Not a deposit/collection provider for this app: the
// user's NGN/GHS balance (already funded via Busha) is what gets debited; this client only
// ever talks to Klasha to convert that value to CNY and pay the vendor.
//
// Confirmed real and programmatic: quote -> bank codes -> transfer, with a live `fxRate` and a
// webhook reporting payout status. Two things are NOT guessed at and must be confirmed against
// a real sandbox account before this goes live:
//   1. Whether `sourceCurrency` accepts 'NGN' — the only documented example uses 'USD'.
//   2. The exact 3DES parameters below (key length, IV derivation) — implemented per Klasha's
//      own encryption-algorithm docs, but untested against a live key.

import { createCipheriv, createDecipheriv } from "node:crypto";

const BASE_URL = process.env.KLASHA_API_BASE_URL ?? "https://api.klasha.com";

export class KlashaError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "KlashaError";
  }
}

// 3DES-CBC, 24-byte key, IV = first 8 bytes of the key, PKCS7 padding, base64-encoded — per
// Klasha's documented encryption-algorithm section. The secret must be exactly 24 bytes.
function encryptBody(payload: unknown): string {
  const secret = process.env.KLASHA_ENCRYPTION_SECRET;
  if (!secret) throw new KlashaError("KLASHA_ENCRYPTION_SECRET is not configured", 500);

  const key = Buffer.from(secret, "utf8");
  const iv = key.subarray(0, 8);
  const cipher = createCipheriv("des-ede3-cbc", key, iv);
  const json = JSON.stringify(payload);
  return Buffer.concat([cipher.update(json, "utf8"), cipher.final()]).toString("base64");
}

export function decryptBody(encrypted: string): unknown {
  const secret = process.env.KLASHA_ENCRYPTION_SECRET;
  if (!secret) throw new KlashaError("KLASHA_ENCRYPTION_SECRET is not configured", 500);

  const key = Buffer.from(secret, "utf8");
  const iv = key.subarray(0, 8);
  const decipher = createDecipheriv("des-ede3-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted);
}

async function request<T>(path: string, options: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  const bearerToken = process.env.KLASHA_API_KEY;
  const publicKey = process.env.KLASHA_PUBLIC_KEY;
  if (!bearerToken || !publicKey) {
    throw new KlashaError("KLASHA_API_KEY / KLASHA_PUBLIC_KEY are not configured", 500);
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
      "x-auth-token": publicKey,
    },
    body: options.body ? JSON.stringify({ message: encryptBody(options.body) }) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) {
    const message = json?.message ?? json?.error ?? `Klasha request failed (${res.status})`;
    throw new KlashaError(message, res.status);
  }
  return (json.data ?? json) as T;
}

export type KlashaCnyQuotation = {
  id: number;
  sourceAmount: number;
  sourceCurrency: string;
  destinationAmount: number;
  destinationCurrency: string;
  fxRate: number;
  fee: number;
  expiration: number;
  reference: string;
  expired: boolean;
};

// POST /wallet/merchant/quotation/v2 — locks in a live rate + fee for a moment.
export function createCnyQuote(params: {
  sourceCurrency: string;
  destinationAmount: string;
}): Promise<KlashaCnyQuotation> {
  return request("/wallet/merchant/quotation/v2", {
    method: "POST",
    body: {
      serviceCode: "UNIONPAY",
      service: "BANK_ACCOUNT",
      transferType: "B2C",
      destinationCurrency: "CNY",
      sourceCurrency: params.sourceCurrency,
      fundSource: "CASH",
      destinationAmount: params.destinationAmount,
    },
  });
}

export type KlashaBankCode = { code: string; name: string };

// GET /wallet/merchant/bank/transfer/request/banks/CNY
export function getBankCodes(): Promise<KlashaBankCode[]> {
  return request("/wallet/merchant/bank/transfer/request/banks/CNY", { method: "GET" });
}

export type KlashaTransferRequest = {
  quotationId: number;
  requestId: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  receiverFirstName: string;
  receiverLastName: string;
  receiverIdNumber: string;
  receiverIdType: string;
  receiverMobileNumber: string;
  purpose: string;
};

export type KlashaTransferResult = {
  id: number;
  amount: number;
  payoutStatus: "PENDING" | "SUCCESSFUL" | "FAILED";
  requestId: string;
  fee: number;
};

// POST /wallet/merchant/{businessId}/bank/transfer/v2/request
export function initiateCnyTransfer(params: KlashaTransferRequest): Promise<KlashaTransferResult> {
  const businessId = process.env.KLASHA_BUSINESS_ID;
  if (!businessId) throw new KlashaError("KLASHA_BUSINESS_ID is not configured", 500);

  return request(`/wallet/merchant/${businessId}/bank/transfer/v2/request`, {
    method: "POST",
    body: {
      accountName: params.accountName,
      accountNumber: params.accountNumber,
      accountType: "INDIVIDUAL",
      bankCode: params.bankCode,
      bankName: params.bankName,
      creditAccountCountry: "CN",
      purpose: params.purpose,
      quotationId: params.quotationId,
      receiverFirstName: params.receiverFirstName,
      receiverIdNumber: params.receiverIdNumber,
      receiverIdType: params.receiverIdType,
      receiverLastName: params.receiverLastName,
      receiverMobileNumber: params.receiverMobileNumber,
      requestId: params.requestId,
    },
  });
}

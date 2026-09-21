// Server-only. Thin fetch wrapper over Klasha's Payments/Collection API
// (developers.klasha.com) — deposit collection for GHS only (NGN moved to Busha, see
// src/lib/actions/klasha.ts's header comment).
//
// Klasha's CNY payout API (quote -> bank codes -> transfer) was investigated and built
// against earlier, but Klasha's own engineering and product teams confirmed it's a
// merchant-only product — for a business to pay its own vendors from Klasha's dashboard, not
// something that can be resold to end customers via API. It was removed once that came back
// (never actually usable for this app despite looking real and automated from the docs).
//
// Confirmed from docs, not guessed: `productType: "COLLECTION"`, currency enum is
// `NGN|ZAR|GHS` — no KES, no crypto/USDT anywhere in this API. KES and USDT deposits stay on
// Busha; there's no Klasha product to attempt for USDT at all.
//
// Things NOT guessed at and still needing a real production test once Klasha support clears
// account access:
//   1. The 3DES parameters below are almost certainly WRONG. Klasha's docs say 3DES (which
//      needs a 16- or 24-byte key), but the real KLASHA_ENCRYPTION_SECRET base64-decodes to
//      exactly 32 bytes — a valid AES-256 key length, not a valid 3DES one. Every live test so
//      far has returned the same account-wide 403 regardless of encryption scheme (even a
//      bodyless GET fails identically), so this has never actually been exercised end-to-end.
//      Try AES-256-CBC (32-byte decoded key, 16-byte IV) first once account access clears,
//      before assuming 3DES is correct just because it's what the docs say.
//   2. Whether the collection webhook (`charge.completed`) payload is encrypted the same way
//      as request bodies — undocumented; the webhook route tries a plaintext parse first.

import { createCipheriv, createDecipheriv } from "node:crypto";

const BASE_URL = process.env.KLASHA_API_BASE_URL ?? "https://gate.klasapps.com";

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

export type KlashaCollectionResult = {
  tx_ref: string;
  meta: {
    authorization: {
      mode: "banktransfer" | "redirect";
      transfer_account?: string;
      transfer_bank?: string;
      transfer_amount?: number;
      account_expiration?: string;
      redirect?: string;
    };
  };
  status: string;
};

// POST /pay/aggregators/{gateway}/banktransfer/v3 — deposit collection. GHS-only now (NGN
// moved to Busha, confirmed live there while Klasha's own NGN/GHS access was blocked
// account-wide). GHS (like ZAR) returns a redirect URL to Klasha's hosted payment page —
// confirmed from docs, not guessed. No separate quote/fee-preview step exists for this
// endpoint, unlike Busha's quote-then-transfer pattern.
export function createCollection(params: {
  txRef: string;
  currency: "GHS";
  amount: string;
  email: string;
  phoneNumber: string;
  fullName: string;
  redirectUrl: string;
}): Promise<KlashaCollectionResult> {
  return request(`/pay/aggregators/${params.currency}/banktransfer/v3`, {
    method: "POST",
    body: {
      tx_ref: params.txRef,
      amount: params.amount,
      email: params.email,
      phone_number: params.phoneNumber,
      currency: params.currency,
      narration: "JesDanPay wallet deposit",
      rate: 1,
      paymentType: "woo",
      productType: "COLLECTION",
      sourceCurrency: params.currency,
      sourceAmount: Number(params.amount),
      fullname: params.fullName,
      redirect_url: params.redirectUrl,
    },
  });
}

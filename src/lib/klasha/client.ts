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
// Auth — confirmed on a support call AND against developers.klasha.com/overview/authentication
// (previously wrong: this file used to send KLASHA_API_KEY directly as a static bearer token,
// which is not how Klasha auth actually works):
//   1. POST /auth/account/v2/login with { username: <business account email>, password } — a
//      Klasha *account* login, not the API key/public key pair — returns
//      { data: { token: "<JWT>" } }.
//   2. Every other request sends BOTH `Authorization: Bearer <that JWT>` AND
//      `x-auth-token: <KLASHA_PUBLIC_KEY>` together — confirmed from the docs' own example,
//      neither header replaces the other.
//   3. Token lifetime is undocumented anywhere (confirmed directly by Klasha support) — this
//      decodes the JWT's own `exp` claim rather than assuming a fixed TTL, and refreshes a
//      little before that deadline rather than waiting to be rejected.
//   4. Base URL for both auth and the GHS collection endpoint is https://dev.kcookery.com —
//      confirmed by Klasha support (Jeremiah) to be their SANDBOX environment, not production.
//      It has its own separate user store and sandbox credentials/keys — production account
//      credentials do not work against it. Production uses a different live base URL that
//      Klasha will provide once sandbox testing is finished; switching is just
//      KLASHA_API_BASE_URL plus the live credentials, no code change needed.
//
// Things NOT guessed at and still needing a real test now that sandbox access works:
//   1. The 3DES parameters below are almost certainly WRONG. Klasha's docs say 3DES (which
//      needs a 16- or 24-byte key), but the real KLASHA_ENCRYPTION_SECRET base64-decodes to
//      exactly 32 bytes — a valid AES-256 key length, not a valid 3DES one. Every live test so
//      far has returned the same account-wide 403 regardless of encryption scheme (even a
//      bodyless GET fails identically), so this has never actually been exercised end-to-end —
//      and the 403s seen then were most likely just production credentials being used against
//      this sandbox host, not evidence against 3DES specifically. Re-check both now that login
//      actually succeeds against sandbox: try AES-256-CBC (32-byte decoded key, 16-byte IV)
//      first, before assuming 3DES is correct just because it's what the docs say.
//   2. Whether the collection webhook (`charge.completed`) payload is encrypted the same way
//      as request bodies — undocumented; the webhook route tries a plaintext parse first.

import { createCipheriv, createDecipheriv } from "node:crypto";

const BASE_URL = process.env.KLASHA_API_BASE_URL ?? "https://dev.kcookery.com";

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

// Decodes a JWT's payload segment to read its own `exp` claim (seconds since epoch), since
// Klasha support confirmed there's no documented fixed token lifetime to hardcode instead.
function decodeJwtExpiryMs(token: string): number | null {
  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export interface KlashaSession {
  token: string;
  expiresAt: number; // ms epoch, decoded from the JWT's own `exp` claim
}

// Module-level cache — fine at this app's scale (a single server process), and avoids logging
// in again on every Klasha call. Refreshed a little early (see TOKEN_REFRESH_MARGIN_MS) rather
// than exactly at expiry, and forced to null on a 401 so the next request logs in fresh.
let cachedSession: KlashaSession | null = null;
const TOKEN_REFRESH_MARGIN_MS = 90_000;

// POST /auth/account/v2/login — a Klasha business account login (KLASHA_LOGIN_EMAIL /
// KLASHA_LOGIN_PASSWORD), not the API key/public key pair. Exported so a caller can force a
// fresh login (or inspect the decoded expiry) without going through the request() cache.
export async function login(): Promise<KlashaSession> {
  const username = process.env.KLASHA_LOGIN_EMAIL;
  const password = process.env.KLASHA_LOGIN_PASSWORD;
  if (!username || !password) {
    throw new KlashaError("KLASHA_LOGIN_EMAIL / KLASHA_LOGIN_PASSWORD are not configured", 500);
  }
  const publicKey = process.env.KLASHA_PUBLIC_KEY;
  if (!publicKey) {
    throw new KlashaError("KLASHA_PUBLIC_KEY is not configured", 500);
  }

  // Confirmed live in Postman (Klasha support): login against the sandbox host also requires
  // x-auth-token, not just username/password — without it (or with production credentials
  // against this sandbox host) the call returns 401, not just the downstream request() calls.
  const res = await fetch(`${BASE_URL}/auth/account/v2/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-auth-token": publicKey },
    body: JSON.stringify({ username, password }),
  });

  const json = await res.json().catch(() => null);
  const token: string | undefined = json?.data?.token;
  if (!res.ok || json?.error || !token) {
    const message = json?.message ?? json?.error ?? `Klasha login failed (${res.status})`;
    throw new KlashaError(message, res.status);
  }

  const expiresAt = decodeJwtExpiryMs(token);
  if (expiresAt == null) {
    throw new KlashaError("Klasha login token has no readable expiry", 500);
  }

  cachedSession = { token, expiresAt };
  return cachedSession;
}

async function getValidToken(): Promise<string> {
  if (cachedSession && cachedSession.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cachedSession.token;
  }
  return (await login()).token;
}

async function request<T>(
  path: string,
  options: { method: "GET" | "POST"; body?: unknown },
  isRetry = false,
): Promise<T> {
  const publicKey = process.env.KLASHA_PUBLIC_KEY;
  if (!publicKey) {
    throw new KlashaError("KLASHA_PUBLIC_KEY is not configured", 500);
  }

  const token = await getValidToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-auth-token": publicKey,
    },
    body: options.body ? JSON.stringify({ message: encryptBody(options.body) }) : undefined,
  });

  // Safety net for a token invalidated server-side before its decoded exp — force one fresh
  // login and retry exactly once, rather than assuming the decoded expiry is always trustworthy.
  if (res.status === 401 && !isRetry) {
    cachedSession = null;
    return request(path, options, true);
  }

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

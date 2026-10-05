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
//   1. KLASHA_ENCRYPTION_SECRET must be the Klasha dashboard's "New encryption key" (24
//      characters) — NOT the separate, longer "Encryption key" (44 characters) also shown
//      there. Only the 24-character one is a valid 3DES key length; the 44-character one is a
//      different value entirely and would silently produce ciphertext Klasha's side can't
//      decrypt. encryptBody()/decryptBody() below now throw a clear KlashaError (length only,
//      never the secret itself) if what's configured isn't exactly 24 bytes, rather than that
//      failing silently.
//   2. Whether the collection webhook (`charge.completed`) payload is encrypted the same way
//      as request bodies — undocumented; the webhook route tries a plaintext parse first.

import { createCipheriv, createDecipheriv } from "node:crypto";

export class KlashaError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "KlashaError";
  }
}

// Every Klasha env var read goes through this — a stray leading/trailing space (easy to paste
// in by accident into a dashboard env var field) would otherwise silently produce a wrong
// username/password/key or a malformed URL. Read inside each function that needs it rather than
// once at module load, so a value changed/corrected at runtime (e.g. in tests) is always trimmed
// too, and so login()'s diagnostic logging can report whether the RAW value actually had
// whitespace before it got trimmed away.
function readEnv(name: string): { raw: string; trimmed: string | undefined; hadWhitespace: boolean } {
  const raw = process.env[name] ?? "";
  const trimmed = raw.trim();
  return { raw, trimmed: trimmed || undefined, hadWhitespace: raw !== trimmed };
}

// KLASHA_API_BASE_URL also gets trailing slashes stripped (on top of the trim every other var
// gets) — every call site below appends a leading-slash path, so a base URL pasted with a
// trailing slash would otherwise produce "https://host//path".
function getBaseUrl(): string {
  const raw = readEnv("KLASHA_API_BASE_URL").trimmed ?? "https://dev.kcookery.com";
  return raw.replace(/\/+$/, "");
}

// Klasha's dashboard shows two different keys — only the 24-character "New encryption key" is a
// valid 3DES key length; the longer 44-character "Encryption key" is a different value entirely
// and silently produces ciphertext Klasha's side can't decrypt. checkSecretLength below exists so
// pasting the wrong one fails loudly, with a length (never the secret itself) in the error.
function checkSecretLength(secret: string): void {
  const length = Buffer.byteLength(secret, "utf8");
  if (length !== 24) {
    throw new KlashaError(`KLASHA_ENCRYPTION_SECRET must be exactly 24 characters (currently ${length})`, 500);
  }
}

// 3DES-CBC, 24-byte key, IV = first 8 bytes of the key, PKCS7 padding, base64-encoded — per
// Klasha's documented encryption-algorithm section. The secret must be exactly 24 bytes.
function encryptBody(payload: unknown): string {
  const secret = readEnv("KLASHA_ENCRYPTION_SECRET").trimmed;
  if (!secret) throw new KlashaError("KLASHA_ENCRYPTION_SECRET is not configured", 500);
  checkSecretLength(secret);

  const key = Buffer.from(secret, "utf8");
  const iv = key.subarray(0, 8);
  const cipher = createCipheriv("des-ede3-cbc", key, iv);
  const json = JSON.stringify(payload);
  return Buffer.concat([cipher.update(json, "utf8"), cipher.final()]).toString("base64");
}

export function decryptBody(encrypted: string): unknown {
  const secret = readEnv("KLASHA_ENCRYPTION_SECRET").trimmed;
  if (!secret) throw new KlashaError("KLASHA_ENCRYPTION_SECRET is not configured", 500);
  checkSecretLength(secret);

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
  const emailEnv = readEnv("KLASHA_LOGIN_EMAIL");
  const passwordEnv = readEnv("KLASHA_LOGIN_PASSWORD");
  const publicKeyEnv = readEnv("KLASHA_PUBLIC_KEY");

  const username = emailEnv.trimmed;
  const password = passwordEnv.trimmed;
  if (!username || !password) {
    throw new KlashaError("KLASHA_LOGIN_EMAIL / KLASHA_LOGIN_PASSWORD are not configured", 500);
  }
  const publicKey = publicKeyEnv.trimmed;
  if (!publicKey) {
    throw new KlashaError("KLASHA_PUBLIC_KEY is not configured", 500);
  }

  // Confirmed live in Postman (Klasha support): login against the sandbox host also requires
  // x-auth-token, not just username/password — without it (or with production credentials
  // against this sandbox host) the call returns 401, not just the downstream request() calls.
  const url = `${getBaseUrl()}/auth/account/v2/login`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-auth-token": publicKey },
    body: JSON.stringify({ username, password }),
  });

  const json = await res.json().catch(() => null);
  const token: string | undefined = json?.data?.token;
  if (!res.ok || json?.error || !token) {
    const message = json?.message ?? json?.error ?? `Klasha login failed (${res.status})`;
    // Diagnostic only — deliberately no email/password/public key/token values, just enough
    // shape (lengths, whitespace) to tell "wrong credentials" apart from "credentials pasted
    // with a stray space" apart from "wrong host/environment" without a console full of secrets.
    console.error("[klasha.login]", {
      status: res.status,
      message,
      url,
      usernameLength: username.length,
      passwordLength: password.length,
      publicKeyLength: publicKey.length,
      usernameHadWhitespace: emailEnv.hadWhitespace,
      passwordHadWhitespace: passwordEnv.hadWhitespace,
      publicKeyHadWhitespace: publicKeyEnv.hadWhitespace,
    });
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
  const publicKey = readEnv("KLASHA_PUBLIC_KEY").trimmed;
  if (!publicKey) {
    throw new KlashaError("KLASHA_PUBLIC_KEY is not configured", 500);
  }

  const token = await getValidToken();
  const res = await fetch(`${getBaseUrl()}${path}`, {
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

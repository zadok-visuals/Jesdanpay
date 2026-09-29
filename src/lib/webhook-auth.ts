import { timingSafeEqual } from "node:crypto";

// Shared-secret check used by both the Busha and Klasha webhook routes. Neither provider's
// dashboard documents the exact header name their webhook signs/carries a shared secret in, and
// guessing wrong has already broken real webhook delivery for weeks once (see the Busha webhook
// route's header comment) — so this checks a short list of plausible header names rather than a
// single guessed one, and callers treat a non-match as a warning to log, not a reason to reject,
// until a real delivery confirms the actual header in use.
export function checkWebhookSecret(
  headers: Record<string, string>,
  candidateHeaderNames: string[],
  expectedSecret: string,
): { matched: boolean; matchedHeader?: string } {
  for (const name of candidateHeaderNames) {
    const value = headers[name.toLowerCase()];
    if (value && constantTimeEquals(value, expectedSecret)) {
      return { matched: true, matchedHeader: name };
    }
  }
  return { matched: false };
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch rather than returning false, and the length
  // check itself leaks no more than the secret's byte length already would.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

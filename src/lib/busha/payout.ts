// Server-only. Automated withdrawal payout on top of the generic Busha client (src/lib/busha/
// client.ts) — creates a Recipient once per user, then a payout Quote (source and target
// currency are always the SAME currency here: this app's withdrawals never convert, matching
// create_withdrawal_request's existing same-currency-recipient constraint) with a `pay_out`
// object, then executes it via the existing createTransfer.
//
// Confirmed against docs.busha.io (guides/payouts/process-payouts,
// api-reference/recipients/create-a-recipient) for NGN (`ngn_bank`) and KES
// (`mpesa_mobile_money`) specifically — both documented with concrete example request bodies.
// GHS has no documented recipient type at all (not even a guessed one — no `ghs_bank`, no
// Ghana-specific mobile-money example anywhere in the public docs), so it's disabled here rather
// than guessed at; USDT uses the `crypto` type with network `BSC`, which is NOT shown in Busha's
// payout examples (only ETH/BTC/XLM appear there) but matches this account's own confirmed,
// working USDT deposit flow (see client.ts's header comment) — flagged as the one part of this
// mapping worth a live sandbox check before real USDT withdrawals go out this path.
import type { Currency, WithdrawalRecipient } from "@/lib/types/database";
import * as busha from "@/lib/busha/client";

interface PayoutChannel {
  recipientType: string;
  payOutType: string;
}

const PAYOUT_CHANNELS: Partial<Record<Currency, PayoutChannel>> = {
  NGN: { recipientType: "ngn_bank", payOutType: "bank_transfer" },
  KES: { recipientType: "mpesa_mobile_money", payOutType: "mobile_money" },
  USDT: { recipientType: "crypto", payOutType: "address" },
  // GHS intentionally omitted — see header comment.
};

export function getPayoutChannel(currency: Currency): PayoutChannel | null {
  return PAYOUT_CHANNELS[currency] ?? null;
}

// Creates a Busha Recipient from the user's saved withdrawal_recipients row. Callers should
// cache the returned id on that row (busha_recipient_id) and only call this once per user.
export async function createBushaRecipient(
  currency: Currency,
  recipient: WithdrawalRecipient,
): Promise<string> {
  const channel = getPayoutChannel(currency);
  if (!channel) throw new Error(`Automated payout isn't supported for ${currency} yet`);

  let body: Record<string, string>;
  if (channel.recipientType === "ngn_bank") {
    if (!recipient.bank_code || !recipient.bank_name || !recipient.bank_account_number) {
      throw new Error("Missing bank details for automated payout");
    }
    body = {
      type: channel.recipientType,
      currency,
      country_code: "NG",
      bank_name: recipient.bank_name,
      bank_code: recipient.bank_code,
      account_number: recipient.bank_account_number,
      account_name: recipient.account_holder_name,
    };
  } else if (channel.recipientType === "mpesa_mobile_money") {
    if (!recipient.bank_account_number) {
      throw new Error("Missing phone number for automated payout");
    }
    body = {
      type: channel.recipientType,
      currency,
      country_code: "KE",
      phone_number: recipient.bank_account_number,
      account_name: recipient.account_holder_name,
    };
  } else {
    if (!recipient.wallet_address) {
      throw new Error("Missing wallet address for automated payout");
    }
    body = {
      type: channel.recipientType,
      network: "BSC",
      address: recipient.wallet_address,
      account_name: recipient.account_holder_name,
    };
  }

  const created = await busha.createRecipient(body);
  return created.id;
}

// Requests and immediately executes a payout transfer for the exact amount being withdrawn.
export async function createPayoutTransfer(
  currency: Currency,
  amount: number,
  recipientId: string,
  recipient: WithdrawalRecipient,
): Promise<busha.BushaTransfer> {
  const channel = getPayoutChannel(currency);
  if (!channel) throw new Error(`Automated payout isn't supported for ${currency} yet`);

  // Confirmed with Busha support: the crypto payout type needs the wallet address and network on
  // the quote itself — recipient_id alone (sufficient for bank_transfer/mobile_money) isn't enough
  // for this type specifically.
  const isCrypto = channel.recipientType === "crypto";
  if (isCrypto && !recipient.wallet_address) {
    throw new Error("Missing wallet address for automated payout");
  }

  const quote = await busha.createQuote({
    sourceCurrency: currency,
    targetCurrency: currency,
    targetAmount: amount.toFixed(2),
    payOut: {
      type: channel.payOutType,
      recipientId,
      ...(isCrypto ? { address: recipient.wallet_address!, network: "BSC" } : {}),
    },
  });
  return busha.createTransfer(quote.id);
}

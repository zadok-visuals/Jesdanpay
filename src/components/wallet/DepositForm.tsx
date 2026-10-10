"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getDepositQuote,
  initiateDeposit,
  checkDepositStatus,
  type DepositQuoteState,
  type DepositActionState,
} from "@/lib/actions/busha";
import { initiateKlashaDeposit, type KlashaDepositState } from "@/lib/actions/klasha";
import { CURRENCY_META, formatBalance, isCurrencyAvailable } from "@/lib/currency";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import { useCountdown, formatCountdown } from "@/lib/hooks/useCountdown";
import { FIAT_MINIMUM_DEPOSIT } from "@/lib/busha/limits";
import type { Currency } from "@/lib/types/database";

const STATUS_POLL_INTERVAL_MS = 10_000;

// Both buttons refresh the server-rendered balance (router.refresh() re-fetches the current
// route's data — the Server Components here never cache, but the client's already-rendered
// payload from before the deposit still needs this to actually pick up the new number) before
// closing. "View balance" additionally scrolls the balance card into view, in case the user
// had scrolled down while this panel was open — see AccountsView's onViewBalance.
function DepositSuccessScreen({ onClose, onViewBalance }: { onClose: () => void; onViewBalance?: () => void }) {
  const router = useRouter();

  function handleViewBalance() {
    router.refresh();
    onViewBalance?.();
    onClose();
  }

  function handleClose() {
    router.refresh();
    onClose();
  }

  return (
    <div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-border bg-white p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-2xl">✅</div>
      <div>
        <p className="text-base font-semibold">Deposit confirmed!</p>
        <p className="mt-1 text-sm text-foreground/60">
          Your balance has been updated. You can see it now on your Accounts page.
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={handleViewBalance}>View balance</Button>
        <Button variant="secondary" onClick={handleClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

// Generalized from "CopyAddressButton" — originally only ever copied the USDT crypto address,
// now reused next to the bank account number and the "amount to transfer" figure too, so it takes
// a generic value/label instead of being hardcoded to "address".
function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — nothing to recover into,
      // the value is still visible to select and copy manually.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded-md p-1 text-foreground/40 hover:bg-black/[.04] hover:text-foreground/70"
      aria-label={label}
      title={copied ? "Copied!" : label}
    >
      {copied ? (
        <span className="text-xs font-medium text-success-500">Copied!</span>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

type DepositableCurrency = "NGN" | "GHS" | "KES" | "USDT";

// GHS deposit through Klasha, NGN/KES/USDT through Busha. NGN moved here from Klasha once
// Busha confirmed working for it live while Klasha's own access stayed blocked account-wide;
// GHS stays on Klasha since Busha's real account rejects GHS outright.
export function DepositForm({
  currency,
  onClose,
  onViewBalance,
}: {
  currency: DepositableCurrency;
  onClose: () => void;
  onViewBalance?: () => void;
}) {
  // Blocked here too, not just by AccountsView never rendering this for GHS — defense in depth,
  // same as the server-side check in initiateKlashaDeposit (src/lib/actions/klasha.ts).
  if (!isCurrencyAvailable(currency)) {
    return (
      <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-black/[.02] p-6 text-center">
        <p className="text-sm font-medium text-foreground">Ghana (GHS) is coming soon.</p>
        <p className="text-sm text-foreground/50">We will notify you as soon as it is available.</p>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }
  if (currency === "GHS") {
    return <KlashaDepositForm onClose={onClose} />;
  }
  return <BushaDepositForm currency={currency} onClose={onClose} onViewBalance={onViewBalance} />;
}

// Klasha has no separate quote/fee-preview step for deposits — one call both starts the
// collection and returns the redirect link (GHS always uses Klasha's hosted payment page,
// never the direct bank-details response that was NGN-only). Unlike Busha's deposit flow, there's
// no "confirmed" status to poll here (no equivalent of checkDepositStatus for Klasha) — Close
// refreshes regardless of whether the deposit actually completed, since there's no way from here
// to tell the difference, and a refresh is harmless either way.
function KlashaDepositForm({ onClose }: { onClose: () => void }) {
  const currency = "GHS" as const;
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<KlashaDepositState>({});
  const [isDepositing, startDepositing] = useTransition();

  function handleClose() {
    router.refresh();
    onClose();
  }

  function handleDeposit() {
    const fd = new FormData();
    fd.set("currency", currency);
    fd.set("amount", amount);
    startDepositing(async () => {
      const result = await initiateKlashaDeposit({}, fd);
      setState(result);
    });
  }

  if (state.redirectUrl) {
    return (
      <div className="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Complete your deposit</p>
          <button type="button" onClick={handleClose} className="text-xs text-foreground/50 hover:text-foreground">
            Close
          </button>
        </div>
        <p className="text-xs text-foreground/50">
          Finish this payment on the secure page that opens next. Your wallet is credited
          automatically once it&rsquo;s confirmed.
        </p>
        {/* Plain link, no target="_blank" — a new-tab popup can be blocked on mobile browsers,
            which would look exactly like this button silently doing nothing all over again. */}
        <a href={state.redirectUrl} className="self-start">
          <Button>Complete payment</Button>
        </a>
      </div>
    );
  }

  if (state.bankDetails) {
    return (
      <KlashaBankDetailsCard
        bankDetails={state.bankDetails}
        onClose={handleClose}
        onStartNew={() => setState({})}
      />
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Add {currency}</p>
        <button type="button" onClick={handleClose} className="text-xs text-foreground/50 hover:text-foreground">
          Close
        </button>
      </div>

      <div>
        <label htmlFor="depositAmount" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Amount ({currency})
        </label>
        <AmountInput
          id="depositAmount"
          symbol={CURRENCY_META[currency].symbol}
          value={amount}
          onChange={setAmount}
        />
      </div>

      {state.error && <p className="text-sm text-danger-500">{state.error}</p>}

      <div className="flex flex-col items-start gap-1.5">
        <Button
          onClick={handleDeposit}
          loading={isDepositing}
          disabled={!amount || Number(amount) <= 0}
          title={!amount || Number(amount) <= 0 ? "Enter an amount to continue" : undefined}
          className="self-start"
        >
          Deposit now
        </Button>
        {(!amount || Number(amount) <= 0) && (
          <p className="text-xs text-foreground/50">Enter an amount to continue</p>
        )}
      </div>
    </div>
  );
}

// Pulled out of KlashaDepositForm so useCountdown is called unconditionally at this component's
// own top level — KlashaDepositForm only mounts this when state.bankDetails is set, and a hook
// can't live inside that conditional branch directly (Rules of Hooks), but a conditionally
// *mounted child component* that calls its own hooks unconditionally is fine.
function KlashaBankDetailsCard({
  bankDetails,
  onClose,
  onStartNew,
}: {
  bankDetails: NonNullable<KlashaDepositState["bankDetails"]>;
  onClose: () => void;
  onStartNew: () => void;
}) {
  const currency = "GHS" as const;
  const { bankName, accountNumber, amount: bankAmount, expiresAt } = bankDetails;

  // Decided ONCE, at mount, from the expiresAt this component received — not recomputed every
  // tick — so a timestamp that genuinely counts down to zero while the user watches is trusted
  // all the way to a real "Expired" (the normal case), but a timestamp that looks already-past
  // the moment it arrives (seen live: a Klasha account_expiration with no timezone designator,
  // parsed as local server time — see client.ts's normalizeExpiry) is never trusted at all, not
  // even after it "passes". Also rejects anything more than 24h out as implausible for a deposit
  // window, same defensive reasoning. Server-side normalization (client.ts) should mean this
  // almost never distrusts a real value going forward, but this is the client-side backstop for
  // whatever Klasha sends that still doesn't add up.
  const [trustExpiry] = useState(() => {
    if (!expiresAt) return false;
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) return false;
    const msUntil = parsed.getTime() - Date.now();
    return msUntil > 0 && msUntil <= 24 * 60 * 60 * 1000;
  });

  const secondsLeft = useCountdown(trustExpiry ? expiresAt : undefined);
  const expired = trustExpiry ? secondsLeft <= 0 : false;

  return (
    <div className="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Complete your deposit</p>
        <button type="button" onClick={onClose} className="text-xs text-foreground/50 hover:text-foreground">
          Close
        </button>
      </div>

      {!expired && (
        <p className="text-xs text-foreground/50">
          Transfer to the account below from your bank app. Your wallet is credited automatically
          once the payment is confirmed.
        </p>
      )}

      <dl className="flex flex-col gap-2 rounded-lg bg-black/[.03] p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-foreground/50">Bank</dt>
          <dd className="font-medium">{bankName}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-foreground/50">Account number</dt>
          <dd className="flex items-center gap-1 font-medium">
            {accountNumber}
            {/* Hidden once expired — nothing left worth copying for a reference that's no
                longer live. */}
            {!expired && <CopyButton value={accountNumber} label="Copy account number" />}
          </dd>
        </div>
        {bankAmount != null && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-foreground/50">Amount</dt>
            <dd className="font-medium">{formatBalance(currency, bankAmount)}</dd>
          </div>
        )}
        {expiresAt && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-foreground/50">Expires</dt>
            <dd className="font-medium">{new Date(expiresAt).toLocaleString()}</dd>
          </div>
        )}
      </dl>

      {trustExpiry ? (
        <p className={`text-xs font-medium ${expired ? "text-danger-500" : "text-foreground/50"}`}>
          {expired ? "Expired" : `Expires in ${formatCountdown(secondsLeft)}`}
        </p>
      ) : (
        <p className="text-xs text-foreground/50">Valid for a limited time.</p>
      )}

      {expired && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-black/[.02] p-4 text-center">
          <p className="text-sm text-foreground/60">
            This deposit expired before we received your payment. No funds were taken.
          </p>
          <Button variant="secondary" onClick={onStartNew}>
            Start a new deposit
          </Button>
        </div>
      )}
    </div>
  );
}

// Busha's quote-then-transfer pattern, with a fee preview step — used for NGN, KES, and USDT.
function BushaDepositForm({
  currency,
  onClose,
  onViewBalance,
}: {
  currency: "NGN" | "KES" | "USDT";
  onClose: () => void;
  onViewBalance?: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [quoteState, setQuoteState] = useState<DepositQuoteState>({});
  const [depositState, setDepositState] = useState<DepositActionState>({});
  const [isQuoting, startQuoting] = useTransition();
  const [isDepositing, startDepositing] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [depositFailed, setDepositFailed] = useState(false);

  const expiresAt = depositState.bankDetails?.expiresAt || depositState.cryptoAddress?.expiresAt;
  const secondsLeft = useCountdown(expiresAt);
  const expired = expiresAt ? secondsLeft <= 0 : false;

  // Only NGN/GHS/KES have an entry at all (see limits.ts's own comment on why NGN/GHS are
  // currently unset) — USDT never has a minimum here, so this is undefined for it.
  const minimumDeposit = currency !== "USDT" ? FIAT_MINIMUM_DEPOSIT[currency] : undefined;
  const belowMinimum = minimumDeposit != null && Number(amount) > 0 && Number(amount) < minimumDeposit;

  // Poll for this deposit resolving. checkDepositStatus checks Busha's own transfer status
  // directly on every call now — it doesn't just trust a webhook/cron to have updated our DB —
  // so this reaches a terminal state even if nothing else in the pipeline ever fires.
  useEffect(() => {
    if (!depositState.depositId || confirmed || depositFailed) return;
    const interval = setInterval(async () => {
      const result = await checkDepositStatus(depositState.depositId!);
      if (result.status === "completed") {
        setConfirmed(true);
        // Refresh the moment completion is actually detected — not just when the user later
        // clicks a button on the success screen — so the balance is already current in the
        // background by the time they look at it. checkDepositStatus already calls
        // revalidatePath server-side; router.refresh() is what actually makes this client fetch
        // that fresh payload (calling a Server Action as a plain function here, outside a
        // form/transition dispatch, doesn't itself re-render the already-mounted page).
        router.refresh();
        // A toast (not just the inline success screen) so a user who's stepped away from this
        // panel — or closed it while waiting — still sees the confirmation land.
        toast.success("Deposit confirmed — your balance has been updated.");
      } else if (result.status === "failed") {
        setDepositFailed(true);
      }
    }, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [depositState.depositId, confirmed, depositFailed, router]);

  if (confirmed) {
    return <DepositSuccessScreen onClose={onClose} onViewBalance={onViewBalance} />;
  }

  if (depositFailed) {
    return (
      <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-border bg-white p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-50 text-2xl">✕</div>
        <div>
          <p className="text-base font-semibold">Deposit didn&rsquo;t go through</p>
          <p className="mt-1 text-sm text-foreground/60">
            This deposit was cancelled or expired before we received your payment. No funds were
            taken — start a new deposit whenever you&rsquo;re ready.
          </p>
        </div>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  function handleGetQuote() {
    const fd = new FormData();
    fd.set("currency", currency);
    fd.set("amount", amount);
    startQuoting(async () => {
      const result = await getDepositQuote({}, fd);
      setQuoteState(result);
      setDepositState({});
    });
  }

  function handleDeposit() {
    if (!quoteState.quoteId) return;
    const fd = new FormData();
    fd.set("quoteId", quoteState.quoteId);
    fd.set("currency", currency);
    fd.set("amount", quoteState.amount ?? amount);
    startDepositing(async () => {
      const result = await initiateDeposit({}, fd);
      setDepositState(result);
    });
  }

  if (depositState.bankDetails) {
    const { accountName, accountNumber, bankName } = depositState.bankDetails;
    return (
      <div className="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Transfer to complete your deposit</p>
          <button type="button" onClick={onClose} className="text-xs text-foreground/50 hover:text-foreground">
            Close
          </button>
        </div>

        <div className="flex flex-col items-center gap-1 rounded-xl bg-primary-50 py-5 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-primary-700/70">
            Transfer exactly
          </p>
          <div className="flex items-center gap-1.5">
            <p className="text-3xl font-bold text-primary-800">
              {formatBalance(currency as Currency, Number(quoteState.grossAmount))}
            </p>
            <CopyButton value={String(quoteState.grossAmount ?? "")} label="Copy amount" />
          </div>
          {expiresAt && (
            <p className={`text-xs font-medium ${expired ? "text-danger-500" : "text-primary-700/70"}`}>
              {expired ? "Expired" : `Expires in ${formatCountdown(secondsLeft)}`}
            </p>
          )}
        </div>

        {/* Mirrors Busha's own app: the gross transfer amount, the fee, and the net amount that
            actually lands in the wallet, all shown together — previously only the gross "Transfer
            exactly" figure above made it to this screen, the fee/net breakdown only ever appeared
            briefly at the quote-preview step and was lost by the time a user got here. */}
        <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-foreground/60">Deposit fee</dt>
            <dd className="text-sm font-medium">{formatBalance(currency as Currency, Number(quoteState.fee ?? 0))}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-foreground/60">You will receive</dt>
            <dd className="text-sm font-semibold text-primary-700">
              {formatBalance(currency as Currency, Number(quoteState.netAmount ?? 0))}
            </dd>
          </div>
        </dl>

        <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-foreground/60">Bank</dt>
            <dd className="text-sm font-medium">{bankName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-foreground/60">Account number</dt>
            <dd className="flex items-center gap-1 text-sm font-medium">
              {accountNumber}
              <CopyButton value={accountNumber} label="Copy account number" />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-foreground/60">Account name</dt>
            <dd className="text-sm font-medium">{accountName}</dd>
          </div>
        </dl>
        <p className="text-xs text-foreground/50">
          Your wallet is credited automatically once the transfer is confirmed — usually within a
          few minutes.
        </p>
      </div>
    );
  }

  if (depositState.cryptoAddress) {
    const { address, network } = depositState.cryptoAddress;
    return (
      <div className="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Send USDT to complete your deposit</p>
          <button type="button" onClick={onClose} className="text-xs text-foreground/50 hover:text-foreground">
            Close
          </button>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
          <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-primary-50 py-5 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-primary-700/70">
              Send exactly
            </p>
            <div className="flex items-center gap-1.5">
              <p className="text-3xl font-bold text-primary-800">{quoteState.grossAmount} USDT</p>
              <CopyButton value={String(quoteState.grossAmount ?? "")} label="Copy amount" />
            </div>
            {expiresAt && (
              <p className={`text-xs font-medium ${expired ? "text-danger-500" : "text-primary-700/70"}`}>
                {expired ? "Expired" : `Expires in ${formatCountdown(secondsLeft)}`}
              </p>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-foreground/60">Network</p>
              <p className="text-base font-semibold">{network || "—"}</p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm text-foreground/60">Address</p>
              <div className="flex items-start gap-2">
                <p className="break-all text-sm font-medium">{address}</p>
                <CopyButton value={address} label="Copy address" />
              </div>
            </div>
          </div>
        </div>

        {/* Same fee/net breakdown as the fiat bank-transfer screen — mirrors Busha's own app. */}
        <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-foreground/60">Deposit fee</dt>
            <dd className="text-sm font-medium">{quoteState.fee ?? "0.00"} USDT</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-foreground/60">You will receive</dt>
            <dd className="text-sm font-semibold text-primary-700">{quoteState.netAmount ?? "0.00"} USDT</dd>
          </div>
        </dl>

        <p className="text-xs font-medium text-danger-500">
          Only send USDT on the BSC (BNB Smart Chain) network. Sending via any other network may
          result in permanent loss of funds.
        </p>
        <p className="text-xs text-foreground/50">
          Your wallet is credited automatically once the deposit is confirmed on-chain — this
          usually takes a few minutes, depending on network traffic. You&rsquo;ll see a
          notification here the moment it&rsquo;s done.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Add {currency}</p>
        <button type="button" onClick={onClose} className="text-xs text-foreground/50 hover:text-foreground">
          Close
        </button>
      </div>

      <div>
        <label htmlFor="depositAmount" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Amount ({currency})
        </label>
        <AmountInput
          id="depositAmount"
          symbol={CURRENCY_META[currency as Currency].symbol}
          value={amount}
          onChange={(v) => {
            setAmount(v);
            setQuoteState({});
          }}
        />
      </div>

      {quoteState.error && <p className="text-sm text-danger-500">{quoteState.error}</p>}

      {quoteState.quoteId ? (
        // Same three figures as the final payment-instructions screen (gross to transfer, fee,
        // net credited) shown here too, before the user commits — not just a "You deposit"/"Fee"
        // pair that never actually showed what they'd receive.
        <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-primary-50">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-primary-700/70">Amount to transfer</dt>
            <dd className="text-sm font-semibold text-primary-800">
              {formatBalance(currency as Currency, Number(quoteState.grossAmount))}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-primary-700/70">Deposit fee</dt>
            <dd className="text-sm font-medium text-primary-800">
              {formatBalance(currency as Currency, Number(quoteState.fee))}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-primary-700/70">You will receive</dt>
            <dd className="text-sm font-semibold text-primary-800">
              {formatBalance(currency as Currency, Number(quoteState.netAmount))}
            </dd>
          </div>
        </dl>
      ) : null}

      {depositState.error && <p className="text-sm text-danger-500">{depositState.error}</p>}

      <div className="flex flex-col items-start gap-1.5">
        {!quoteState.quoteId ? (
          <Button
            onClick={handleGetQuote}
            loading={isQuoting}
            disabled={!amount || Number(amount) <= 0 || belowMinimum}
            title={
              !amount || Number(amount) <= 0
                ? "Enter an amount to continue"
                : belowMinimum
                  ? `Minimum ${currency} deposit is ${minimumDeposit}`
                  : undefined
            }
            className="self-start"
          >
            Preview
          </Button>
        ) : (
          <Button onClick={handleDeposit} loading={isDepositing} className="self-start">
            Deposit now
          </Button>
        )}
        {!quoteState.quoteId && (!amount || Number(amount) <= 0) && (
          <p className="text-xs text-foreground/50">Enter an amount to continue</p>
        )}
        {!quoteState.quoteId && belowMinimum && (
          <p className="text-xs text-danger-500">
            Minimum {currency} deposit is {formatBalance(currency as Currency, minimumDeposit!)}
          </p>
        )}
      </div>
    </div>
  );
}

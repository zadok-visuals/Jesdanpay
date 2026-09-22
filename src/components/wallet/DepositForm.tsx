"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  getDepositQuote,
  initiateDeposit,
  checkDepositStatus,
  type DepositQuoteState,
  type DepositActionState,
} from "@/lib/actions/busha";
import { initiateKlashaDeposit, type KlashaDepositState } from "@/lib/actions/klasha";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import { useCountdown, formatCountdown } from "@/lib/hooks/useCountdown";
import type { Currency } from "@/lib/types/database";

const STATUS_POLL_INTERVAL_MS = 10_000;

function DepositSuccessScreen({ onClose }: { onClose: () => void }) {
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
        <Link href="/accounts">
          <Button>View balance</Button>
        </Link>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

type DepositableCurrency = "NGN" | "GHS" | "KES" | "USDT";

// GHS deposit through Klasha, NGN/KES/USDT through Busha. NGN moved here from Klasha once
// Busha confirmed working for it live while Klasha's own access stayed blocked account-wide;
// GHS stays on Klasha since Busha's real account rejects GHS outright.
export function DepositForm({ currency, onClose }: { currency: DepositableCurrency; onClose: () => void }) {
  if (currency === "GHS") {
    return <KlashaDepositForm onClose={onClose} />;
  }
  return <BushaDepositForm currency={currency} onClose={onClose} />;
}

// Klasha has no separate quote/fee-preview step for deposits — one call both starts the
// collection and returns the redirect link (GHS always uses Klasha's hosted payment page,
// never the direct bank-details response that was NGN-only).
function KlashaDepositForm({ onClose }: { onClose: () => void }) {
  const currency = "GHS" as const;
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<KlashaDepositState>({});
  const [isDepositing, startDepositing] = useTransition();

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
          <button type="button" onClick={onClose} className="text-xs text-foreground/50 hover:text-foreground">
            Close
          </button>
        </div>
        <p className="text-xs text-foreground/50">
          Finish this payment on the secure page that opens next. Your wallet is credited
          automatically once it's confirmed.
        </p>
        <a href={state.redirectUrl} target="_blank" rel="noopener noreferrer" className="self-start">
          <Button>Complete payment</Button>
        </a>
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

// Busha's quote-then-transfer pattern, with a fee preview step — used for NGN, KES, and USDT.
function BushaDepositForm({ currency, onClose }: { currency: "NGN" | "KES" | "USDT"; onClose: () => void }) {
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

  // Poll for this deposit resolving. checkDepositStatus checks Busha's own transfer status
  // directly on every call now — it doesn't just trust a webhook/cron to have updated our DB —
  // so this reaches a terminal state even if nothing else in the pipeline ever fires.
  useEffect(() => {
    if (!depositState.depositId || confirmed || depositFailed) return;
    const interval = setInterval(async () => {
      const result = await checkDepositStatus(depositState.depositId!);
      if (result.status === "completed") {
        setConfirmed(true);
      } else if (result.status === "failed") {
        setDepositFailed(true);
      }
    }, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [depositState.depositId, confirmed, depositFailed]);

  if (confirmed) {
    return <DepositSuccessScreen onClose={onClose} />;
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
          <p className="text-3xl font-bold text-primary-800">
            {formatBalance(currency as Currency, Number(quoteState.amount))}
          </p>
          {expiresAt && (
            <p className={`text-xs font-medium ${expired ? "text-danger-500" : "text-primary-700/70"}`}>
              {expired ? "Expired" : `Expires in ${formatCountdown(secondsLeft)}`}
            </p>
          )}
        </div>

        <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {[
            { label: "Bank", value: bankName },
            { label: "Account number", value: accountNumber },
            { label: "Account name", value: accountName },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-foreground/60">{label}</dt>
              <dd className="text-sm font-medium">{value}</dd>
            </div>
          ))}
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
        <div className="flex flex-col items-center gap-1 rounded-xl bg-primary-50 py-5 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-primary-700/70">
            Send exactly
          </p>
          <p className="text-3xl font-bold text-primary-800">{quoteState.amount} USDT</p>
          {expiresAt && (
            <p className={`text-xs font-medium ${expired ? "text-danger-500" : "text-primary-700/70"}`}>
              {expired ? "Expired" : `Expires in ${formatCountdown(secondsLeft)}`}
            </p>
          )}
        </div>

        <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-foreground/60">Network</dt>
            <dd className="text-sm font-medium">{network || "—"}</dd>
          </div>
          <div className="flex flex-col gap-1 px-4 py-3">
            <dt className="text-sm text-foreground/60">Address</dt>
            <dd className="break-all text-sm font-medium">{address}</dd>
          </div>
        </dl>
        <p className="text-xs text-foreground/50">
          Your wallet is credited automatically once the deposit is confirmed on-chain.
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
        <div className="flex items-center justify-between gap-4 rounded-xl bg-primary-50 px-4 py-3.5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-primary-700/70">You deposit</p>
            <p className="text-xl font-bold text-primary-800">
              {formatBalance(currency as Currency, Number(quoteState.amount))}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-primary-700/70">Fee</p>
            <p className="text-sm font-semibold text-primary-800">
              {formatBalance(currency as Currency, Number(quoteState.fee))}
            </p>
          </div>
        </div>
      ) : null}

      {depositState.error && <p className="text-sm text-danger-500">{depositState.error}</p>}

      <div className="flex flex-col items-start gap-1.5">
        {!quoteState.quoteId ? (
          <Button
            onClick={handleGetQuote}
            loading={isQuoting}
            disabled={!amount || Number(amount) <= 0}
            title={!amount || Number(amount) <= 0 ? "Enter an amount to continue" : undefined}
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
      </div>
    </div>
  );
}

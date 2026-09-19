"use client";

import { useState, useTransition } from "react";
import {
  getDepositQuote,
  initiateDeposit,
  type DepositQuoteState,
  type DepositActionState,
} from "@/lib/actions/busha";
import { initiateKlashaDeposit, type KlashaDepositState } from "@/lib/actions/klasha";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { Button } from "@/components/ui/Button";
import type { Currency } from "@/lib/types/database";

type DepositableCurrency = "NGN" | "GHS" | "KES" | "USDT";

// NGN/GHS deposit through Klasha, KES/USDT through Busha — see src/lib/klasha/client.ts's
// header comment for why: Klasha's collection API has no KES or crypto support at all.
export function DepositForm({ currency, onClose }: { currency: DepositableCurrency; onClose: () => void }) {
  if (currency === "NGN" || currency === "GHS") {
    return <KlashaDepositForm currency={currency} onClose={onClose} />;
  }
  return <BushaDepositForm currency={currency} onClose={onClose} />;
}

// Klasha has no separate quote/fee-preview step for deposits — one call both starts the
// collection and returns payment instructions.
function KlashaDepositForm({ currency, onClose }: { currency: "NGN" | "GHS"; onClose: () => void }) {
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
          Klasha needs you to finish this payment on their secure page. Your wallet is credited
          automatically once it's confirmed.
        </p>
        <a href={state.redirectUrl} target="_blank" rel="noopener noreferrer" className="self-start">
          <Button>Complete payment</Button>
        </a>
      </div>
    );
  }

  if (state.bankDetails) {
    const { accountNumber, bankName, expiresAt } = state.bankDetails;
    return (
      <div className="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Transfer to complete your deposit</p>
          <button type="button" onClick={onClose} className="text-xs text-foreground/50 hover:text-foreground">
            Close
          </button>
        </div>
        <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-foreground/60">Bank</dt>
            <dd className="text-sm font-medium">{bankName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-foreground/60">Account number</dt>
            <dd className="text-sm font-medium">{accountNumber}</dd>
          </div>
        </dl>
        <p className="text-xs text-foreground/50">
          Transfer exactly {formatBalance(currency, Number(amount))} to the account above
          {expiresAt ? ` before ${new Date(expiresAt).toLocaleString()}` : ""}. Your wallet is
          credited automatically once the transfer is confirmed.
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
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-foreground/50">
            {CURRENCY_META[currency].symbol}
          </span>
          <input
            id="depositAmount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-11 w-full rounded-xl border border-border bg-white pl-8 pr-3.5 text-base outline-none transition-colors focus:border-primary-400 sm:text-sm"
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-danger-500">{state.error}</p>}

      <Button
        onClick={handleDeposit}
        loading={isDepositing}
        disabled={!amount || Number(amount) <= 0}
        className="self-start"
      >
        Deposit now
      </Button>
    </div>
  );
}

// Busha's quote-then-transfer pattern, with a fee preview step — used for KES and USDT only.
function BushaDepositForm({ currency, onClose }: { currency: "KES" | "USDT"; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [quoteState, setQuoteState] = useState<DepositQuoteState>({});
  const [depositState, setDepositState] = useState<DepositActionState>({});
  const [isQuoting, startQuoting] = useTransition();
  const [isDepositing, startDepositing] = useTransition();

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
    const { accountName, accountNumber, bankName, expiresAt } = depositState.bankDetails;
    return (
      <div className="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Transfer to complete your deposit</p>
          <button type="button" onClick={onClose} className="text-xs text-foreground/50 hover:text-foreground">
            Close
          </button>
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
          Transfer exactly {formatBalance(currency as Currency, Number(quoteState.amount))} to the account
          above{expiresAt ? ` before ${new Date(expiresAt).toLocaleString()}` : ""}. Your wallet is
          credited automatically once the transfer is confirmed.
        </p>
      </div>
    );
  }

  if (depositState.cryptoAddress) {
    const { address, network, expiresAt } = depositState.cryptoAddress;
    return (
      <div className="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Send USDT to complete your deposit</p>
          <button type="button" onClick={onClose} className="text-xs text-foreground/50 hover:text-foreground">
            Close
          </button>
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
          Send exactly {quoteState.amount} USDT to the address above
          {expiresAt ? ` before ${new Date(expiresAt).toLocaleString()}` : ""}. Your wallet is credited
          automatically once the deposit is confirmed on-chain.
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
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-foreground/50">
            {CURRENCY_META[currency as Currency].symbol}
          </span>
          <input
            id="depositAmount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setQuoteState({});
            }}
            placeholder="0.00"
            className="h-11 w-full rounded-xl border border-border bg-white pl-8 pr-3.5 text-base outline-none transition-colors focus:border-primary-400 sm:text-sm"
          />
        </div>
      </div>

      {quoteState.error && <p className="text-sm text-danger-500">{quoteState.error}</p>}

      {quoteState.quoteId ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <dl className="divide-y divide-border">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-foreground/60">Fee</dt>
              <dd className="text-sm font-medium">{formatBalance(currency as Currency, Number(quoteState.fee))}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {depositState.error && <p className="text-sm text-danger-500">{depositState.error}</p>}

      <div className="flex gap-3">
        {!quoteState.quoteId ? (
          <Button
            onClick={handleGetQuote}
            loading={isQuoting}
            disabled={!amount || Number(amount) <= 0}
            className="self-start"
          >
            Preview
          </Button>
        ) : (
          <Button onClick={handleDeposit} loading={isDepositing} className="self-start">
            Deposit now
          </Button>
        )}
      </div>
    </div>
  );
}

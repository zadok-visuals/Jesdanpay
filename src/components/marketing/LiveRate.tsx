"use client";

import { useEffect, useState } from "react";
import { getLiveCnyRates, type LiveCnyRate } from "@/lib/actions/marketingRates";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { Reveal } from "@/components/marketing/Reveal";

const REFRESH_MS = 60_000;

export function LiveRate() {
  const [rates, setRates] = useState<LiveCnyRate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await getLiveCnyRates();
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
      } else {
        setRates(result.rates);
        setError(null);
      }
    }

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <section id="rates" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Reveal className="mx-auto max-w-xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary-800/50">
            Live pricing
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-serif)] text-3xl text-primary-900 sm:text-4xl">
            Today&rsquo;s rates
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-10 rounded-3xl border border-white/50 bg-white/50 p-6 backdrop-blur-xl sm:p-10">
            {!rates && !error && (
              <p className="py-6 text-center text-sm text-primary-900/40">Loading live rates…</p>
            )}
            {!rates && error && (
              <p className="py-6 text-center text-sm text-primary-900/50">
                Live rates are temporarily unavailable — sign up to see current pricing in your
                dashboard.
              </p>
            )}
            {rates && (
              <div className="grid gap-4 sm:grid-cols-2">
                {rates.map((rate) => {
                  // from_cny (NGN/GHS/KES): "1 CNY = [amount] [currency]" — CNY on the left.
                  // to_cny (USDT): "1 USDT = ¥[amount]" — USDT on the left, its original layout.
                  const isFromCny = rate.direction === "from_cny";
                  const leftCurrency = isFromCny ? "CNY" : rate.currency;
                  const rightCurrency = isFromCny ? rate.currency : "CNY";
                  return (
                    <div
                      key={rate.currency}
                      className="flex items-center justify-between rounded-2xl border border-primary-800/10 bg-white/60 px-5 py-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl leading-none">{CURRENCY_META[leftCurrency].flag}</span>
                        <span className="text-sm font-medium text-primary-900">1 {leftCurrency}</span>
                      </div>
                      <span className="font-[family-name:var(--font-serif)] text-lg text-primary-900">
                        {formatBalance(rightCurrency, rate.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-6 text-center text-xs text-primary-900/40">
              Indicative only, refreshed about once a minute — the exact rate locks in the moment
              you convert.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

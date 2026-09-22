"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CnyTierRate, Wallet } from "@/lib/types/database";
import { UsdtExchangeForm } from "@/components/payments/UsdtExchangeForm";
import { CnyConvertForm } from "@/components/payments/CnyConvertForm";

type Tab = "Convert USDT" | "Convert CNY";
const TABS: Tab[] = ["Convert USDT", "Convert CNY"];

interface PaymentsViewProps {
  wallets: Wallet[];
  tierRates: CnyTierRate[];
  markupRate: number;
}

export function PaymentsView({ wallets, tierRates, markupRate }: PaymentsViewProps) {
  // Lets other pages deep-link into a specific tab, e.g. /payments?tab=cny from the
  // dashboard's quick actions — falls back to Convert USDT when absent/unrecognized. The query
  // param values themselves ("usdt"/"cny") are independent internal ids, unrelated to these
  // display labels.
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams.get("tab") === "cny" ? "Convert CNY" : "Convert USDT";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar */}
      <div className="inline-flex items-center gap-1 self-start rounded-xl bg-black/[.04] p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
              tab === activeTab
                ? "bg-white text-primary-700"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Panel */}
      {activeTab === "Convert USDT" ? (
        <UsdtExchangeForm wallets={wallets} />
      ) : (
        <CnyConvertForm wallets={wallets} tierRates={tierRates} markupRate={markupRate} />
      )}
    </div>
  );
}

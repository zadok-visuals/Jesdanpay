"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AdminFxRate, SavedRmbRecipient, Wallet } from "@/lib/types/database";
import { RmbExchangeForm } from "@/components/payments/RmbExchangeForm";
import { UsdtExchangeForm } from "@/components/payments/UsdtExchangeForm";
import { CnyConvertForm } from "@/components/payments/CnyConvertForm";

type Tab = "RMB Exchange" | "USDT Exchange" | "Convert to CNY";
const TABS: Tab[] = ["RMB Exchange", "USDT Exchange", "Convert to CNY"];

interface PaymentsViewProps {
  wallets: Wallet[];
  fxRates: AdminFxRate[];
  savedRecipients: SavedRmbRecipient[];
}

export function PaymentsView({ wallets, fxRates, savedRecipients }: PaymentsViewProps) {
  // Lets other pages deep-link into a specific tab, e.g. /payments?tab=usdt from the
  // dashboard's quick actions — falls back to RMB Exchange when absent/unrecognized.
  const searchParams = useSearchParams();
  const initialTab: Tab =
    searchParams.get("tab") === "usdt"
      ? "USDT Exchange"
      : searchParams.get("tab") === "cny"
        ? "Convert to CNY"
        : "RMB Exchange";
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
      {activeTab === "RMB Exchange" ? (
        <RmbExchangeForm wallets={wallets} savedRecipients={savedRecipients} />
      ) : activeTab === "USDT Exchange" ? (
        <UsdtExchangeForm wallets={wallets} />
      ) : (
        <CnyConvertForm wallets={wallets} fxRates={fxRates} />
      )}
    </div>
  );
}

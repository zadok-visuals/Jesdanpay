"use client";

import { useState } from "react";
import type { Wallet } from "@/lib/types/database";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { RmbExchangeForm } from "@/components/payments/RmbExchangeForm";

type Tab = "RMB Exchange" | "USDT Exchange";
const TABS: Tab[] = ["RMB Exchange", "USDT Exchange"];

interface PaymentsViewProps {
  wallets: Wallet[];
}

export function PaymentsView({ wallets }: PaymentsViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("RMB Exchange");

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
        <RmbExchangeForm wallets={wallets} />
      ) : (
        <ComingSoon
          title="USDT Exchange"
          description="USDT ↔ NGN exchange via Busha lands in Milestone 2 once the Busha integration is wired in."
        />
      )}
    </div>
  );
}

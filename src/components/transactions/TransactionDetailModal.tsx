"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Pill, statusTone } from "@/components/ui/Pill";
import { formatBalance } from "@/lib/currency";
import { getActivityDetail, type ActivityDetail } from "@/lib/actions/activity";
import type { UnifiedActivity } from "@/lib/transactions";

const TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  usdt_ngn: "USDT exchange",
  rmb_manual: "Send to China",
  rmb_auto: "Send to China",
  convert_to_cny: "Convert to CNY",
  convert_from_cny: "Convert from CNY",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <dt className="shrink-0 text-sm text-foreground/60">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function TransactionDetailModal({
  activity,
  onClose,
}: {
  activity: { source: UnifiedActivity["source"]; id: string } | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activity) {
      setDetail(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getActivityDetail(activity.source, activity.id).then((result) => {
      if (result.error) setError(result.error);
      else setDetail(result.detail ?? null);
      setLoading(false);
    });
  }, [activity]);

  return (
    <Modal open={!!activity} onClose={onClose} title="Transaction details">
      {loading && <p className="py-6 text-center text-sm text-foreground/50">Loading…</p>}
      {error && <p className="py-6 text-center text-sm text-danger-500">{error}</p>}
      {detail && (
        <dl className="-mx-1 divide-y divide-border">
          <Row label="Type" value={TYPE_LABELS[detail.type] ?? detail.type} />
          <Row label="Status" value={<Pill tone={statusTone(detail.status)}>{detail.status}</Pill>} />
          {detail.description && <Row label="Description" value={detail.description} />}
          {detail.reference && <Row label="Reference" value={detail.reference} />}
          {(() => {
            const isConversion =
              detail.type !== "withdrawal" &&
              detail.targetCurrency != null &&
              detail.targetAmount != null;
            return (
              <>
                <Row
                  label={isConversion ? "Source amount" : "Amount"}
                  value={formatBalance(detail.sourceCurrency, detail.sourceAmount)}
                />
                {isConversion && (
                  <>
                    <Row
                      label="Exchange rate"
                      value={`1 ${detail.sourceCurrency} = ${(detail.targetAmount! / detail.sourceAmount).toLocaleString(
                        "en-US",
                        { maximumFractionDigits: 6 },
                      )} ${detail.targetCurrency}`}
                    />
                    <Row label="Target amount" value={formatBalance(detail.targetCurrency!, detail.targetAmount!)} />
                  </>
                )}
              </>
            );
          })()}
          {detail.type === "withdrawal" && detail.fee != null && (
            <Row label="Fee" value={formatBalance(detail.sourceCurrency, detail.fee)} />
          )}
          {detail.type === "withdrawal" && detail.targetAmount != null && (
            <Row label="Net payout" value={formatBalance(detail.sourceCurrency, detail.targetAmount)} />
          )}
          <Row label="Date" value={new Date(detail.createdAt).toLocaleString()} />
        </dl>
      )}
    </Modal>
  );
}

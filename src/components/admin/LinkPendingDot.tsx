"use client";

import { useLinkStatus } from "next/link";

export function LinkPendingDot() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className="ml-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-primary-500" aria-hidden />;
}

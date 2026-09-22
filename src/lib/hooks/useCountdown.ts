"use client";

import { useEffect, useState } from "react";

export function useCountdown(expiresAt: string | undefined) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      setSecondsLeft(Math.max(diff, 0));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return secondsLeft;
}

export function formatCountdown(secondsLeft: number) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

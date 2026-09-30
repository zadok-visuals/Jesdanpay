"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "framer-motion";

// Splits "$18M+" into ("$", 18, "M+"), "24,000+" into ("", 24000, "+") with its comma noted, "4"
// into ("", 4, ""), "< 2 hrs" into ("< ", 2, " hrs") — anything that isn't part of the numeral
// itself (currency symbols, comparison signs, unit suffixes, the "+") is kept as literal text and
// re-applied around the tweened number rather than parsed as part of the animation.
function parseStat(raw: string) {
  const match = raw.match(/^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!match) return { prefix: "", value: 0, suffix: raw, hasComma: false };
  const [, prefix, numeral, suffix] = match;
  return { prefix, value: parseFloat(numeral.replace(/,/g, "")), suffix, hasComma: numeral.includes(",") };
}

export function AnimatedStat({ value: raw, className = "" }: { value: string; className?: string }) {
  const { prefix, value, suffix, hasComma } = parseStat(raw);
  const ref = useRef<HTMLParagraphElement>(null);
  // once: true — the count-up plays the first time the band scrolls into view and never again,
  // even if the visitor scrolls away and back.
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setDisplay,
    });
    return () => controls.stop();
  }, [inView, value]);

  const formatted = hasComma
    ? Math.round(display).toLocaleString("en-US")
    : String(Math.round(display));

  return (
    <p ref={ref} className={className}>
      {prefix}
      {formatted}
      {suffix}
    </p>
  );
}

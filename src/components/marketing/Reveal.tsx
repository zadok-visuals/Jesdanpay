"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

// Shared scroll-reveal used by every marketing section (fade up + settle once it enters the
// viewport). Pulled into one place since ~10 sections all want the identical motion preset —
// duplicating this inline in each section would just be the same six lines repeated ten times.
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

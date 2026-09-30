"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

// Subtle hover tilt applied around every icon in FeatureCards, HowItWorks, and SecurityTrust — one
// small reusable wrapper instead of duplicating the same whileHover config in each of those ~10
// icon usages, or baking bespoke animation into every individual icon component.
export function IconMotion({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      whileHover={{ scale: 1.12, rotate: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 14 }}
    >
      {children}
    </motion.div>
  );
}

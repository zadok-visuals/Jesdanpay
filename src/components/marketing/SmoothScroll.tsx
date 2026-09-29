"use client";

import { ReactLenis } from "lenis/react";

// Wraps the whole marketing page in a single global Lenis instance (root mode — no extra wrapper
// div, it hooks the real document scroll) for the soft, weighted scroll feel the brief asks for.
// Scoped to the marketing tree only; the authenticated dashboard keeps native scrolling.
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  return (
    <ReactLenis root options={{ lerp: 0.1, duration: 1.2, smoothWheel: true }}>
      {children}
    </ReactLenis>
  );
}

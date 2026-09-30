"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/layout/Wordmark";
import { PillButton } from "@/components/marketing/PillButton";

const LINKS = [
  { href: "#how-it-works", label: "Product" },
  { href: "#countries", label: "Countries" },
  { href: "#features", label: "Pricing" },
  { href: "#security", label: "Support" },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 sm:px-6 sm:pt-6">
      <nav
        className={`flex w-full max-w-6xl items-center justify-between rounded-full border border-white/40 px-5 py-3 backdrop-blur-xl transition-all duration-500 sm:px-7 ${
          scrolled ? "bg-white/70 shadow-[0_8px_30px_-12px_rgba(10,46,31,0.25)]" : "bg-white/30"
        }`}
      >
        <Wordmark className="h-7" />

        <div className="hidden items-center gap-9 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-primary-900/70 transition-colors hover:text-primary-900"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-primary-900/70 transition-colors hover:text-primary-900"
          >
            Log in
          </Link>
          <PillButton href="/signup" size="sm">
            Sign up
          </PillButton>
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-primary-900 md:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
            {menuOpen ? (
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </nav>

      {menuOpen && (
        <div className="absolute inset-x-4 top-[calc(100%+8px)] flex flex-col gap-1 rounded-3xl border border-white/40 bg-white/90 p-4 shadow-[0_20px_50px_-20px_rgba(10,46,31,0.35)] backdrop-blur-xl md:hidden">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-primary-900/80 hover:bg-primary-50"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-black/[.06] pt-3">
            <Link
              href="/login"
              className="rounded-xl px-3 py-2.5 text-center text-sm font-medium text-primary-900/80 hover:bg-primary-50"
            >
              Log in
            </Link>
            <PillButton href="/signup" className="justify-center">
              Sign up
            </PillButton>
          </div>
        </div>
      )}
    </header>
  );
}

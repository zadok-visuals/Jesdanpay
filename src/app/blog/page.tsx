import Link from "next/link";
import type { Metadata } from "next";
import { SmoothScroll } from "@/components/marketing/SmoothScroll";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — JesDanPay",
  description: "Notes on the JesDanPay corridor: how it works, rates, KYC, and more.",
};

function formatPostDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <SmoothScroll>
      <div className="min-h-dvh bg-cream">
        <MarketingNav />
        <main className="px-4 pb-24 pt-36 sm:px-6 sm:pt-44">
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary-800/50">
              From the team
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-serif)] text-4xl text-primary-900 sm:text-5xl">
              JesDanPay Blog
            </h1>

            <div className="mt-12 flex flex-col gap-5">
              {posts.length === 0 && (
                <p className="text-sm text-primary-900/50">No posts yet — check back soon.</p>
              )}
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group block rounded-3xl border border-white/50 bg-white/50 p-8 backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:bg-white/70 hover:shadow-[0_30px_60px_-25px_rgba(10,46,31,0.3)]"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <time className="text-xs uppercase tracking-[0.15em] text-primary-900/40">
                      {formatPostDate(post.date)}
                    </time>
                    {post.draft && (
                      <span className="rounded-full bg-accent-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-800">
                        Draft
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-primary-900 group-hover:text-primary-700">
                    {post.title}
                  </h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-primary-900/55">{post.excerpt}</p>
                </Link>
              ))}
            </div>
          </div>
        </main>
        <MarketingFooter />
      </div>
    </SmoothScroll>
  );
}

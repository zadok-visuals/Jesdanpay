import type { ComponentProps } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { SmoothScroll } from "@/components/marketing/SmoothScroll";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { getAllPostSlugs, getPostBySlug } from "@/lib/blog";

export function generateStaticParams() {
  return getAllPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  return { title: post ? `${post.title} — JesDanPay Blog` : "Post not found — JesDanPay Blog" };
}

// Small element -> Tailwind mapping instead of pulling in @tailwindcss/typography for three
// draft posts — keeps post bodies in the same warm/serif visual language as the rest of the
// marketing site rather than a generic "prose" theme.
const mdxComponents = {
  h2: (props: ComponentProps<"h2">) => (
    <h2 className="mt-10 font-[family-name:var(--font-serif)] text-2xl text-primary-900" {...props} />
  ),
  h3: (props: ComponentProps<"h3">) => <h3 className="mt-8 text-lg font-semibold text-primary-900" {...props} />,
  p: (props: ComponentProps<"p">) => <p className="mt-4 text-[15px] leading-relaxed text-primary-900/70" {...props} />,
  ul: (props: ComponentProps<"ul">) => (
    <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-primary-900/70" {...props} />
  ),
  ol: (props: ComponentProps<"ol">) => (
    <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-primary-900/70" {...props} />
  ),
  a: (props: ComponentProps<"a">) => (
    <a className="font-medium text-primary-700 underline underline-offset-2" {...props} />
  ),
  strong: (props: ComponentProps<"strong">) => <strong className="font-semibold text-primary-900" {...props} />,
};

function formatPostDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const { content } = await compileMDX({
    source: post.content,
    components: mdxComponents,
  });

  return (
    <SmoothScroll>
      <div className="min-h-dvh bg-cream">
        <MarketingNav />
        <main className="px-4 pb-24 pt-36 sm:px-6 sm:pt-44">
          <article className="mx-auto max-w-2xl">
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
            <h1 className="mt-3 font-[family-name:var(--font-serif)] text-4xl leading-tight text-primary-900 sm:text-5xl">
              {post.title}
            </h1>
            <div className="mt-8">{content}</div>
          </article>
        </main>
        <MarketingFooter />
      </div>
    </SmoothScroll>
  );
}

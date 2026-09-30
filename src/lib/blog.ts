// Server-only. No external CMS — blog posts are just .mdx files under content/blog/, read from
// disk and parsed with gray-matter. getAllPosts only needs the frontmatter (title/date/excerpt),
// so it never touches the MDX body; the [slug] page is the only place that actually compiles a
// post's content (via next-mdx-remote/rsc's compileMDX), since that's the expensive step.
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const BLOG_DIR = path.join(process.cwd(), "content/blog");

export interface BlogPostMeta {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  draft: boolean;
}

export interface BlogPost extends BlogPostMeta {
  content: string;
}

function readPostFile(slug: string): matter.GrayMatterFile<string> | null {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;
  return matter(fs.readFileSync(filePath, "utf8"));
}

export function getAllPostSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx$/, ""));
}

function toMeta(slug: string, data: Record<string, unknown>): BlogPostMeta {
  return {
    slug,
    title: String(data.title ?? slug),
    date: String(data.date ?? ""),
    excerpt: String(data.excerpt ?? ""),
    draft: Boolean(data.draft),
  };
}

// Sorted newest first — every current post is dated, but a missing/malformed date sorts last
// rather than crashing the listing page.
export function getAllPosts(): BlogPostMeta[] {
  return getAllPostSlugs()
    .map((slug) => {
      const file = readPostFile(slug);
      return file ? toMeta(slug, file.data) : null;
    })
    .filter((post): post is BlogPostMeta => post !== null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getPostBySlug(slug: string): BlogPost | null {
  const file = readPostFile(slug);
  if (!file) return null;
  return { ...toMeta(slug, file.data), content: file.content };
}

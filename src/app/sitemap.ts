import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";

// Same APP_URL convention as metadataBase in layout.tsx — process.env.APP_URL ?? localhost so
// this resolves correctly in every environment without a code change.
const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  // getAllPosts() does NOT filter out drafts itself (confirmed by reading src/lib/blog.ts — it
  // only reads frontmatter, draft included) — every current post under content/blog/ is marked
  // `draft: true` (placeholder content awaiting the client's review), so this filter is what
  // actually keeps them out of the sitemap, not getAllPosts() itself.
  const publishedPosts = getAllPosts().filter((post) => !post.draft);

  return [
    { url: `${BASE_URL}/`, lastModified: new Date() },
    { url: `${BASE_URL}/blog`, lastModified: new Date() },
    ...publishedPosts.map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: post.date,
    })),
    { url: `${BASE_URL}/privacy`, lastModified: new Date() },
    { url: `${BASE_URL}/terms`, lastModified: new Date() },
    { url: `${BASE_URL}/login`, lastModified: new Date() },
    { url: `${BASE_URL}/signup`, lastModified: new Date() },
  ];
}

import Link from "next/link";
import type { AdminSearchParams } from "@/lib/admin/pagination";

// Plain-link pagination — no client state, matches the existing markupDays range-tab convention
// (src/app/admin/page.tsx before this patch) rather than inventing a client-side widget. Preserves
// every other active searchParam (status/email/date filters) while only changing `page`.
export function Pagination({
  page,
  pageSize,
  totalCount,
  basePath,
  searchParams,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  basePath: string;
  searchParams: AdminSearchParams;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  function hrefFor(targetPage: number) {
    const qp = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "page" || value == null) continue;
      if (Array.isArray(value)) value.forEach((v) => qp.append(key, v));
      else qp.set(key, value);
    }
    qp.set("page", String(targetPage));
    return `${basePath}?${qp.toString()}`;
  }

  return (
    <div className="flex items-center justify-between gap-3 pt-2 text-sm">
      <p className="text-foreground/50">
        Page {page} of {totalPages} · {totalCount} total
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            href={hrefFor(page - 1)}
            className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-black/[.03]"
          >
            Previous
          </Link>
        ) : (
          <span className="rounded-lg border border-border px-3 py-1.5 font-medium text-foreground/30">
            Previous
          </span>
        )}
        {page < totalPages ? (
          <Link
            href={hrefFor(page + 1)}
            className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-black/[.03]"
          >
            Next
          </Link>
        ) : (
          <span className="rounded-lg border border-border px-3 py-1.5 font-medium text-foreground/30">
            Next
          </span>
        )}
      </div>
    </div>
  );
}

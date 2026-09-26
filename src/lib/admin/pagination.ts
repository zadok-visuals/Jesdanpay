export const ADMIN_PAGE_SIZE = 25;

export type AdminSearchParams = { [key: string]: string | string[] | undefined };

function firstValue(params: AdminSearchParams, key: string): string | undefined {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export function parsePageParam(params: AdminSearchParams): number {
  const n = Number(firstValue(params, "page"));
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

// Supabase's .range(from, to) is inclusive on both ends.
export function pageRange(page: number, pageSize: number = ADMIN_PAGE_SIZE): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

export function parseStringParam(params: AdminSearchParams, key: string): string | undefined {
  const value = firstValue(params, key)?.trim();
  return value ? value : undefined;
}

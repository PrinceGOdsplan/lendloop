/**
 * The reviewer panel shows when the URL carries a `demo` parameter: `?demo`,
 * `?demo=` (what Vercel turns a bare `?demo` into), `?demo=1` or `?demo=true`.
 * `?demo=0` and `?demo=false` turn it off.
 */
export function isDemoValue(value: string | string[] | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  const v = (Array.isArray(value) ? (value[0] ?? "") : value).trim().toLowerCase();
  return v !== "0" && v !== "false";
}

/** For a raw query string such as `location.search`. */
export function isDemoSearch(search: string): boolean {
  return isDemoValue(new URLSearchParams(search).get("demo"));
}

/** For a Next.js `searchParams` object. */
export function isDemoParams(params: Record<string, string | string[] | undefined>): boolean {
  return "demo" in params ? isDemoValue(params.demo ?? "") : false;
}

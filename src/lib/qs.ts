export function qs(params?: Record<string, unknown> | undefined): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => typeof v !== "undefined" && v !== null && v !== "");
  if (!entries.length) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of entries) sp.append(k, String(v));
  return `?${sp.toString()}`;
}

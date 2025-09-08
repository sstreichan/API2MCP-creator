export const time = {
  start() { return Date.now(); },
  end(t: number) { return Date.now() - t; }
};

export function logRequest(entry: { tool: string; method: string; url: string; status?: number; ms: number }) {
  try {
    const safeUrl = redact(entry.url);
    const out = { ...entry, url: safeUrl };
    // Write to STDERR
    console.error(JSON.stringify(out));
  } catch {
    // ignore logging errors
  }
}

function redact(u: string): string {
  try {
    const url = new URL(u);
    if (url.searchParams) {
      for (const key of url.searchParams.keys()) {
        if (/key|token|secret|password/i.test(key)) url.searchParams.set(key, "REDACTED");
      }
    }
    return url.toString();
  } catch { return u; }
}

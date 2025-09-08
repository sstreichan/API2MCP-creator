export type RetryOptions = {
  attempts?: number;
  minDelayMs?: number;
  factor?: number;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  retryAfterMs?: (err: unknown) => number | undefined;
};

export function sleep(ms: number): Promise<void> { return new Promise((res) => setTimeout(res, ms)); }

export async function retry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.minDelayMs ?? 300;
  const factor = opts.factor ?? 2;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await fn(attempt); }
    catch (err) {
      lastErr = err;
      const should = opts.shouldRetry?.(err, attempt) ?? false;
      if (!should || attempt >= attempts) break;
      const serverDelay = opts.retryAfterMs?.(err);
      const backoff = base * Math.pow(factor, attempt - 1);
      const jitter = Math.random() * backoff;
      const delay = typeof serverDelay === "number" ? serverDelay : backoff + jitter;
      await sleep(Math.floor(delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  delaysMs: readonly number[] = [250, 600],
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  retryDelay: (error: unknown, fallbackDelayMs: number, attempt: number) => number = (_error, fallbackDelayMs) => fallbackDelayMs,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= delaysMs.length || !shouldRetry(error)) throw error;
      const delay = retryDelay(error, delaysMs[attempt], attempt);
      if (!Number.isFinite(delay) || delay < 0) throw error;
      await wait(delay);
    }
  }
}

export function retryAfterDelayMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

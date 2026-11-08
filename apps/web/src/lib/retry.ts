export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  delaysMs: readonly number[] = [250, 600],
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= delaysMs.length || !shouldRetry(error)) throw error;
      await wait(delaysMs[attempt]);
    }
  }
}

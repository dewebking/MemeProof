export function lockWasAcquired(value: unknown): boolean {
  return value === true;
}

export function describeLockRpcResult(value: unknown): { resultType: string; returnedValue: unknown } {
  if (value === null || typeof value === "boolean") {
    return { resultType: value === null ? "null" : "boolean", returnedValue: value };
  }
  if (typeof value === "object") {
    return {
      resultType: Array.isArray(value) ? "array" : "object",
      returnedValue: Array.isArray(value) ? `[array length ${value.length}]` : `{object with ${Object.keys(value).length} keys; values omitted}`,
    };
  }
  if (typeof value === "string") {
    return { resultType: "string", returnedValue: `[string length ${value.length}; value omitted]` };
  }
  return { resultType: typeof value, returnedValue: String(value) };
}

export function safeRpcErrorMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, "[URL redacted]")
    .replace(/\b(?:SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET|NEXT_PUBLIC_SUPABASE_URL)\s*=\s*[^\s]+/gi, "[environment value redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token redacted]")
    .replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi, "[identifier redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[opaque value redacted]")
    .slice(0, 240);
}

export function describeTransportError(error: unknown): {
  errorName: string;
  errorCode: string;
  errorMessage: string;
} {
  const outer = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
  const cause = typeof outer.cause === "object" && outer.cause !== null ? outer.cause as Record<string, unknown> : outer;
  const name = typeof outer.name === "string" && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(outer.name) ? outer.name : "FetchError";
  const rawCode = typeof cause.code === "string" ? cause.code : typeof outer.code === "string" ? outer.code : null;
  const rawMessage = typeof cause.message === "string" ? cause.message : typeof outer.message === "string" ? outer.message : "Supabase request failed before receiving an HTTP response.";
  const code = rawCode && /^[A-Za-z0-9_-]{1,40}$/.test(rawCode)
    ? rawCode
    : name === "TypeError" && /invalid url|parse url/i.test(rawMessage)
      ? "ERR_INVALID_URL"
      : "transport_error";
  return { errorName: name, errorCode: code, errorMessage: safeRpcErrorMessage(rawMessage) };
}

export function isNextDynamicUsageError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Dynamic server usage: Route ");
}

import { retryAfterDelayMs, withRetry } from "./retry.ts";

const API_BASE_URL = "https://api.meme.cooking";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_PAGES = 100;

export type MemeCookingToken = Record<string, unknown>;

export type MemeCookingFeed = {
  records: MemeCookingToken[];
  pagesFetched: number;
  recordsReceived: number;
  uniqueRecords: number;
};

export class MemeCookingApiError extends Error {
  readonly status: number;
  readonly upstreamStatus?: number;
  readonly failureCode?: string;

  constructor(
    message: string,
    status: number,
    upstreamStatus?: number,
    failureCode?: string,
  ) {
    super(message);
    this.name = "MemeCookingApiError";
    this.status = status;
    this.upstreamStatus = upstreamStatus;
    this.failureCode = failureCode;
  }
}

class UpstreamHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, retryAfterMs: number | null) {
    super(`http_${status}`);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function retryable(error: unknown): boolean {
  if (error instanceof UpstreamHttpError) {
    const transient = error.status === 408 || error.status === 429 || error.status >= 500;
    return transient && (error.retryAfterMs === null || error.retryAfterMs <= 2_500);
  }
  return true;
}

function networkFailureCode(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === "object" && "code" in current && typeof current.code === "string") {
      const code = current.code;
      if (/^(?:E[A-Z0-9_]+|UND_ERR_[A-Z0-9_]+)$/.test(code)) return code;
    }
    current = typeof current === "object" && "cause" in current ? current.cause : null;
  }
  return "NETWORK_ERROR";
}

async function requestMemeCooking(url: string, fetcher: typeof fetch): Promise<Response> {
  try {
    return await withRetry(async () => {
      const response = await fetcher(url, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new UpstreamHttpError(response.status, retryAfterDelayMs(response.headers.get("retry-after")));
      return response;
    }, retryable, [250, 600], undefined, (error, fallbackDelay) =>
      error instanceof UpstreamHttpError
        ? Math.max(fallbackDelay, error.retryAfterMs ?? 0)
        : fallbackDelay,
    );
  } catch (error) {
    if (error instanceof UpstreamHttpError) {
      const status = error.status === 404 ? 404 : error.status === 429 ? 503 : error.status >= 500 ? error.status : 502;
      console.warn("[meme-cooking] upstream returned HTTP error", { host: "api.meme.cooking", status: error.status });
      throw new MemeCookingApiError(
        `Meme.Cooking returned HTTP ${error.status}.`,
        status,
        error.status,
        `HTTP_${error.status}`,
      );
    }
    const failureCode = networkFailureCode(error);
    if ((error instanceof Error && error.name === "TimeoutError") || failureCode === "ETIMEDOUT" || failureCode === "UND_ERR_CONNECT_TIMEOUT") {
      console.warn("[meme-cooking] upstream request timed out", { host: "api.meme.cooking", timeoutMs: REQUEST_TIMEOUT_MS, failureCode });
      throw new MemeCookingApiError("Meme.Cooking request timed out.", 504, undefined, "TIMEOUT");
    }
    console.warn("[meme-cooking] upstream connection failed", { host: "api.meme.cooking", failureCode });
    throw new MemeCookingApiError("Meme.Cooking could not be reached.", 502, undefined, failureCode);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToken(value: unknown): value is MemeCookingToken {
  return isRecord(value) && (
    typeof value.meme_id === "string" ||
    typeof value.meme_id === "number" ||
    typeof value.id === "string" ||
    typeof value.id === "number"
  );
}

function nextLink(value: unknown, headerValue?: string | null): string | null {
  const candidate = value ?? headerValue ?? null;
  if (candidate === null || candidate === "") return null;
  if (typeof candidate === "string") return candidate.trim() || null;
  if (isRecord(candidate)) {
    const href = candidate.href ?? candidate.url;
    if (typeof href === "string" && href.trim()) return href;
  }
  throw new MemeCookingApiError("Meme.Cooking returned an unsupported pagination link.", 502, undefined, "UNSUPPORTED_PAGINATION");
}

function nextLinkFromHeader(value: string | null): string | null {
  if (!value) return null;
  for (const part of value.split(/,(?=\s*<)/)) {
    const match = part.match(/<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i);
    if (match?.[1]) return match[1];
  }
  return null;
}

function normalizeMemePage(payload: unknown, headerNext: string | null): { records: MemeCookingToken[]; next: string | null } {
  if (Array.isArray(payload) && payload.every(isToken)) return { records: payload, next: nextLink(null, headerNext) };
  if (isRecord(payload)) {
    for (const key of ["data", "memes", "items", "results"]) {
      const value = payload[key];
      if (!Array.isArray(value) || !value.every(isToken)) continue;
      const links = isRecord(payload.links) ? payload.links : {};
      const pagination = isRecord(payload.pagination) ? payload.pagination : {};
      const nextValue = links.next ?? pagination.next ?? pagination.next_page_url ?? payload.next;
      return { records: value, next: nextLink(nextValue, headerNext) };
    }
  }
  throw new MemeCookingApiError("Meme.Cooking returned an unexpected token response.", 502, undefined, "INVALID_RESPONSE");
}

function safeMemePageUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value, `${API_BASE_URL}/meme`);
  } catch {
    throw new MemeCookingApiError("Meme.Cooking returned an invalid pagination link.", 502, undefined, "INVALID_PAGINATION_URL");
  }
  if (url.origin !== API_BASE_URL || url.pathname !== "/meme") {
    throw new MemeCookingApiError("Meme.Cooking returned an unsafe pagination link.", 502, undefined, "UNSAFE_PAGINATION_URL");
  }
  return url.href;
}

async function fetchMemePage(url: string, fetcher: typeof fetch): Promise<{ payload: unknown; next: string | null }> {
  const response = await requestMemeCooking(url, fetcher);
  try {
    return { payload: await response.json(), next: nextLinkFromHeader(response.headers.get("link")) };
  } catch {
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "unknown content type";
    throw new MemeCookingApiError(
      `Meme.Cooking returned invalid JSON (HTTP ${response.status}, ${contentType}).`,
      502,
      undefined,
      "INVALID_JSON",
    );
  }
}

export async function getMemeFeed(fetcher: typeof fetch = fetch): Promise<MemeCookingFeed> {
  const visited = new Set<string>();
  const byId = new Map<string, MemeCookingToken>();
  let pageUrl: string | null = `${API_BASE_URL}/meme`;
  let pagesFetched = 0;
  let recordsReceived = 0;
  while (pageUrl) {
    pageUrl = safeMemePageUrl(pageUrl);
    if (visited.has(pageUrl)) throw new MemeCookingApiError("Meme.Cooking pagination loop detected.", 502, undefined, "PAGINATION_LOOP");
    if (pagesFetched >= MAX_PAGES) throw new MemeCookingApiError("Meme.Cooking pagination exceeded the safe page limit.", 502, undefined, "PAGE_LIMIT");
    visited.add(pageUrl);
    const response = await fetchMemePage(pageUrl, fetcher);
    const page = normalizeMemePage(response.payload, response.next);
    recordsReceived += page.records.length;
    for (const token of page.records) {
      const id = token.meme_id ?? token.id;
      if (id !== undefined && id !== null) byId.set(String(id), { ...token, meme_id: id });
    }
    pageUrl = page.next ? safeMemePageUrl(page.next) : null;
    pagesFetched += 1;
  }
  const records = [...byId.values()];
  return { records, pagesFetched, recordsReceived, uniqueRecords: records.length };
}

export async function getMemes(fetcher: typeof fetch = fetch): Promise<MemeCookingToken[]> {
  return (await getMemeFeed(fetcher)).records;
}

export async function getMeme(id: string, fetcher: typeof fetch = fetch): Promise<MemeCookingToken> {
  const response = await requestMemeCooking(`${API_BASE_URL}/meme/${encodeURIComponent(id)}`, fetcher);
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new MemeCookingApiError("Meme.Cooking returned invalid JSON.", 502, undefined, "INVALID_JSON"); }
  if (isToken(payload)) return payload;
  if (isRecord(payload)) {
    for (const key of ["data", "meme", "token", "result"]) {
      if (isToken(payload[key])) return payload[key];
    }
  }
  throw new MemeCookingApiError("Meme.Cooking returned an unexpected token response.", 502, undefined, "INVALID_RESPONSE");
}
